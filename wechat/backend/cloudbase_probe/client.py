"""CloudBase NoSQL HTTP API transport, based on the official OpenAPI 1.0.0.

Credentials remain server-side. No implicit fallback to SQLite, redirects or
automatic write retries: a timed-out write may already have taken effect.
"""

from dataclasses import dataclass, field
import json
import os
import re
import socket
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener


class ConfigurationError(ValueError):
    pass


class CloudBaseError(RuntimeError):
    def __init__(self, status=0, code="NETWORK_ERROR", request_id=""):
        self.status = status
        self.code = code if re.fullmatch(r"[A-Za-z0-9_-]{1,100}", str(code)) else "UPSTREAM_ERROR"
        self.request_id = request_id if re.fullmatch(r"[A-Za-z0-9_-]{1,100}", str(request_id)) else ""
        # Never include headers, tokens, upstream body or URLs in exceptions.
        super().__init__(f"CloudBase HTTP {status}: {self.code}")


@dataclass(frozen=True)
class Configuration:
    env_id: str
    api_key: str = field(repr=False)
    instance: str = "(default)"
    database: str = "(default)"

    def __post_init__(self):
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{1,100}", self.env_id):
            raise ConfigurationError("CLOUDBASE_ENV_ID 缺失或格式不正确")
        if not self.api_key or self.api_key.strip() != self.api_key or any(c.isspace() for c in self.api_key):
            raise ConfigurationError("请配置服务端管理员 CLOUDBASE_API_KEY；不要使用发布密钥")
        for value in (self.instance, self.database):
            if not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}|\(default\)", value):
                raise ConfigurationError("数据库实例或名称格式不正确")

    @classmethod
    def from_environ(cls, environ=None):
        env = os.environ if environ is None else environ
        key = env.get("CLOUDBASE_API_KEY", "")
        injected = env.get("CLOUDBASE_APIKEY", "")
        if key and injected and key != injected:
            raise ConfigurationError("两项 API Key 配置不一致，请保留一项")
        return cls(env.get("CLOUDBASE_ENV_ID", ""), key or injected,
                   env.get("CLOUDBASE_DB_INSTANCE", "(default)"),
                   env.get("CLOUDBASE_DB_NAME", "(default)"))

    @property
    def base_url(self):
        return (f"https://{self.env_id}.api.tcloudbasegateway.com/v1/database/instances/"
                f"{quote(self.instance, safe='()')}/databases/{quote(self.database, safe='()')}")


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Do not forward an administrator Authorization header to another URL.
        return None


class Client:
    def __init__(self, config, opener=None, timeout=5):
        self.config = config
        self.opener = opener or build_opener(_NoRedirect())
        self.timeout = timeout

    def request_timeout(self):
        return self.timeout

    def read_response(self, response, limit):
        return response.read(limit)

    def _request(self, method, path, body=None, query=None, expected=(200,)):
        url = self.config.base_url + path
        if query:
            url += "?" + urlencode(query)
        data = None if body is None else json.dumps(body, ensure_ascii=False, allow_nan=False).encode("utf-8")
        req = Request(url, data=data, method=method, headers={
            "Authorization": "Bearer " + self.config.api_key,
            "Content-Type": "application/json", "Accept": "application/json",
        })
        try:
            with self.opener.open(req, timeout=self.request_timeout()) as response:
                status = response.status
                raw = self.read_response(response, 1024 * 1024 + 1)
                request_id = response.headers.get("X-Request-Id", "")
        except HTTPError as error:
            with error:
                raw = self.read_response(error, 8192)
                request_id = error.headers.get("X-Request-Id", "")
                try:
                    payload = json.loads(raw)
                except (ValueError, UnicodeError):
                    payload = {}
                if not isinstance(payload, dict):
                    payload = {}
                raise CloudBaseError(error.code, payload.get("code", "UPSTREAM_ERROR"),
                                     payload.get("request_id", request_id)) from None
        except (URLError, TimeoutError, socket.timeout, OSError):
            raise CloudBaseError(0, "NETWORK_ERROR") from None
        if status not in expected:
            raise CloudBaseError(status, "UNEXPECTED_STATUS", request_id)
        if len(raw) > 1024 * 1024:
            raise CloudBaseError(status, "RESPONSE_TOO_LARGE", request_id)
        if status == 204:
            return None
        try:
            payload = json.loads(raw)
        except (ValueError, UnicodeError):
            raise CloudBaseError(status, "INVALID_JSON", request_id) from None
        if not isinstance(payload, dict):
            raise CloudBaseError(status, "INVALID_RESPONSE", request_id)
        if payload.get("code"):
            raise CloudBaseError(status, payload["code"], payload.get("request_id", request_id))
        return payload

    @staticmethod
    def _documents(collection, doc_id=None):
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,100}", collection):
            raise ValueError("Invalid collection name")
        path = f"/collections/{quote(collection, safe='')}/documents"
        if doc_id is not None:
            if not isinstance(doc_id, str) or not doc_id or len(doc_id) > 200:
                raise ValueError("Invalid document ID")
            path += "/" + quote(doc_id, safe="")
        return path

    def insert(self, collection, documents, transaction_id=None):
        body = {"data": documents}
        if transaction_id:
            body["transactionId"] = transaction_id
        result = self._request("POST", self._documents(collection), body, expected=(201,))
        ids = result.get("insertedIds")
        if not isinstance(ids, list) or len(ids) != len(documents) or not all(isinstance(x, str) for x in ids):
            raise CloudBaseError(201, "INVALID_INSERT_RESPONSE")
        return ids

    def get(self, collection, doc_id, transaction_id=None):
        query = {"transactionId": transaction_id} if transaction_id else None
        try:
            return self._request("GET", self._documents(collection, doc_id), query=query)
        except CloudBaseError as error:
            # A missing collection or endpoint is NOT a missing document.
            if error.status == 404 and error.code == "DOCUMENT_NOT_FOUND":
                return None
            raise

    def update(self, collection, doc_id, values, transaction_id=None):
        body = {"data": {"$set": values}, "upsert": False, "returnDoc": False}
        if transaction_id:
            body["transactionId"] = transaction_id
        result = self._request("PATCH", self._documents(collection, doc_id), body)
        if result.get("matched") != 1:
            raise CloudBaseError(200, "INVALID_UPDATE_RESPONSE")

    def delete(self, collection, doc_id):
        try:
            result = self._request("DELETE", self._documents(collection, doc_id))
        except CloudBaseError as error:
            if error.status == 404 and error.code == "DOCUMENT_NOT_FOUND":
                return
            raise
        if result.get("deleted") != 1:
            raise CloudBaseError(200, "INVALID_DELETE_RESPONSE")

    def start_transaction(self):
        result = self._request("POST", "/transactions", expected=(201,))
        tx_id = result.get("transactionId")
        if not isinstance(tx_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", tx_id):
            raise CloudBaseError(201, "INVALID_TRANSACTION_RESPONSE")
        return tx_id

    def finish_transaction(self, tx_id, commit=False):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", tx_id):
            raise ValueError("Invalid transaction ID")
        action = "commit" if commit else "rollback"
        self._request("POST", f"/transactions/{tx_id}/{action}", expected=(204,))


def integer_value(value):
    """Decode only the integer EJSON values needed to verify money in cents."""
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if isinstance(value, dict) and len(value) == 1:
        for name in ("$numberInt", "$numberLong"):
            if name in value and isinstance(value[name], str) and re.fullmatch(r"-?\d+", value[name]):
                return int(value[name])
    raise CloudBaseError(200, "INVALID_INTEGER_RESPONSE")
