"""Offline protocol, access control and transaction failure checks for the probe."""
import copy
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from cloudbase_probe.app import create_app
from cloudbase_probe.client import Client, CloudBaseError, Configuration, ConfigurationError, integer_value
from cloudbase_probe.probe import COLLECTION, run_probe


class Response(io.BytesIO):
    def __init__(self, status, payload):
        super().__init__(json.dumps(payload).encode() if payload is not None else b"")
        self.status = status
        self.headers = {}


class Opener:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests = []

    def open(self, request, timeout):
        self.requests.append(request)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class MemoryDatabase:
    """Transactional snapshots stand in for the remote database, never SQLite."""
    def __init__(self, broken_rollback=False, uncertain_insert=False):
        self.documents = {"existing-user-data": {"_id": "existing-user-data", "price_cents": 55}}
        self.transactions = {}
        self.deleted = []
        self.broken_rollback = broken_rollback
        self.uncertain_insert = uncertain_insert

    def state(self, tx=None):
        return self.documents if tx is None else self.transactions[tx]

    def insert(self, collection, documents, transaction_id=None):
        assert collection == COLLECTION
        for document in documents:
            self.state(transaction_id)[document["_id"]] = copy.deepcopy(document)
        if self.uncertain_insert:
            self.uncertain_insert = False
            raise CloudBaseError(0, "NETWORK_ERROR")
        return [document["_id"] for document in documents]

    def get(self, collection, doc_id, transaction_id=None):
        return copy.deepcopy(self.state(transaction_id).get(doc_id))

    def update(self, collection, doc_id, values, transaction_id=None):
        self.state(transaction_id)[doc_id].update(values)

    def delete(self, collection, doc_id):
        self.deleted.append(doc_id)
        del self.documents[doc_id]

    def start_transaction(self):
        tx_id = "tx" + str(len(self.transactions))
        self.transactions[tx_id] = copy.deepcopy(self.documents)
        return tx_id

    def finish_transaction(self, tx_id, commit=False):
        state = self.transactions.pop(tx_id)
        if commit or self.broken_rollback:
            self.documents = state


class ProtocolTests(unittest.TestCase):
    def config(self):
        return Configuration("cloud1-test", "secret-test-admin")

    def test_official_http_shapes_and_integer_ejson(self):
        opener = Opener(Response(201, {"insertedIds": ["x"]}),
                        Response(200, {"_id": "x", "price": {"$numberLong": "12345"}}),
                        Response(200, {"matched": 1, "updated": 1}),
                        Response(201, {"transactionId": "tx1"}), Response(204, None),
                        Response(200, {"deleted": 1}))
        client = Client(self.config(), opener=opener)
        self.assertEqual(client.insert(COLLECTION, [{"_id": "x"}], "tx0"), ["x"])
        self.assertEqual(integer_value(client.get(COLLECTION, "x", "tx0")["price"]), 12345)
        client.update(COLLECTION, "x", {"price": -123}, "tx0")
        self.assertEqual(client.start_transaction(), "tx1")
        client.finish_transaction("tx1", commit=True)
        client.delete(COLLECTION, "x")
        requests = opener.requests
        self.assertEqual([r.method for r in requests], ["POST", "GET", "PATCH", "POST", "POST", "DELETE"])
        self.assertIn("/instances/(default)/databases/(default)/", requests[0].full_url)
        self.assertEqual(requests[0].get_header("Authorization"), "Bearer secret-test-admin")
        self.assertEqual(json.loads(requests[0].data)["transactionId"], "tx0")
        self.assertTrue(requests[1].full_url.endswith("/x?transactionId=tx0"))
        self.assertEqual(json.loads(requests[2].data)["data"], {"$set": {"price": -123}})
        self.assertFalse(json.loads(requests[2].data)["upsert"])
        self.assertTrue(requests[4].full_url.endswith("/transactions/tx1/commit"))

    def test_missing_collection_is_not_missing_document(self):
        errors = [HTTPError("https://example.test", 404, "", {}, io.BytesIO(json.dumps({"code": code}).encode()))
                  for code in ("DOCUMENT_NOT_FOUND", "DATABASE_COLLECTION_NOT_EXIST")]
        client = Client(self.config(), opener=Opener(*errors))
        self.assertIsNone(client.get(COLLECTION, "missing"))
        with self.assertRaises(CloudBaseError):
            client.get(COLLECTION, "missing")

    def test_write_timeout_is_not_retried_and_errors_hide_secrets(self):
        opener = Opener(URLError("secret-test-admin leaked upstream"))
        with self.assertRaises(CloudBaseError) as caught:
            Client(self.config(), opener=opener).insert(COLLECTION, [{"_id": "x"}])
        self.assertEqual(len(opener.requests), 1)
        self.assertNotIn("secret-test-admin", str(caught.exception))
        self.assertNotIn("secret-test-admin", repr(self.config()))
        error = CloudBaseError(403, "secret: not a code", "secret: not an id")
        self.assertEqual(error.code, "UPSTREAM_ERROR")
        self.assertEqual(error.request_id, "")

    def test_redirect_handler_refuses_forwarding_bearer(self):
        from cloudbase_probe.client import _NoRedirect
        self.assertIsNone(_NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.test"))

    def test_unexpected_success_status_or_malformed_body_is_rejected(self):
        for response in (Response(200, {"insertedIds": ["x"]}), Response(201, []), Response(201, {"insertedIds": []})):
            with self.subTest(response=response):
                with self.assertRaises(CloudBaseError):
                    Client(self.config(), opener=Opener(response)).insert(COLLECTION, [{"_id": "x"}])

    def test_invalid_configuration_and_conflicting_keys(self):
        for environ in ({}, {"CLOUDBASE_ENV_ID": "../unsafe", "CLOUDBASE_API_KEY": "a"},
                        {"CLOUDBASE_ENV_ID": "cloud1-test", "CLOUDBASE_API_KEY": "a", "CLOUDBASE_APIKEY": "b"}):
            with self.assertRaises(ConfigurationError):
                Configuration.from_environ(environ)
        for value in (True, 1.2, {"$numberDouble": "1.5"}):
            with self.assertRaises(CloudBaseError):
                integer_value(value)
        self.assertEqual(integer_value({"$numberInt": "-123"}), -123)


class ProbeTests(unittest.TestCase):
    def test_first_insert_permission_denied_does_not_report_unattempted_documents(self):
        class Denied:
            def insert(self, collection, documents, transaction_id=None):
                raise CloudBaseError(403, "DATABASE_PERMISSION_DENIED")
            def get(self, *args):
                raise AssertionError("Do not repeatedly call a denied API")
        result = run_probe(Denied())
        self.assertFalse(result["ok"])
        self.assertEqual(result["checks"], [])
        self.assertEqual(result["cleanup_status"], "not_needed")
        self.assertTrue(result["cleanup"])
        self.assertEqual(result["remaining_test_ids"], [])
        self.assertIn("ADMINONLY", result["hint"])

    def test_read_denied_after_successful_insert_stays_unverified(self):
        class ReadDenied(MemoryDatabase):
            def get(self, *args):
                raise CloudBaseError(403, "DATABASE_PERMISSION_DENIED")
        result = run_probe(ReadDenied())
        self.assertFalse(result["ok"])
        self.assertFalse(result["cleanup"])
        self.assertEqual(result["cleanup_status"], "unverified")
        self.assertEqual(len(result["remaining_test_ids"]), 1)
        self.assertTrue(result["remaining_test_ids"][0].endswith("-item"))

    def test_two_document_transactions_and_cleanup(self):
        database = MemoryDatabase()
        result = run_probe(database)
        self.assertTrue(result["ok"])
        self.assertTrue(result["cleanup"])
        self.assertEqual(len(result["checks"]), 5)
        self.assertEqual(database.documents, {"existing-user-data": {"_id": "existing-user-data", "price_cents": 55}})
        self.assertTrue(all(doc_id.startswith("probe-" + result["run_id"]) for doc_id in database.deleted))
        self.assertFalse(database.transactions)

    def test_broken_rollback_blocks_migration(self):
        database = MemoryDatabase(broken_rollback=True)
        result = run_probe(database)
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"]["code"], "VERIFICATION_FAILED")
        self.assertTrue(result["cleanup"])
        self.assertEqual(list(database.documents), ["existing-user-data"])
        self.assertEqual(result["cleanup_status"], "verified")

    def test_timed_out_insert_that_did_write_is_cleaned(self):
        database = MemoryDatabase(uncertain_insert=True)
        result = run_probe(database)
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"]["code"], "NETWORK_ERROR")
        self.assertTrue(result["cleanup"])
        self.assertEqual(list(database.documents), ["existing-user-data"])

    def test_unowned_document_is_never_deleted(self):
        class Collision(MemoryDatabase):
            def insert(self, collection, documents, transaction_id=None):
                doc = documents[0].copy()
                doc["probe_run"] = "another-run"
                self.documents[doc["_id"]] = doc
                raise CloudBaseError(409, "DOCUMENT_EXISTS")
        database = Collision()
        result = run_probe(database)
        self.assertFalse(result["cleanup"])
        self.assertEqual(len(result["remaining_test_ids"]), 1)
        self.assertEqual(database.deleted, [])


class AccessTests(unittest.TestCase):
    TOKEN = "t" * 40

    def test_health_and_disabled_route_never_access_database(self):
        app = create_app({"TESTING": True, "PROBE_ENABLED": False})
        with patch("cloudbase_probe.app.Client") as client:
            response = app.test_client().get("/healthz")
            self.assertTrue(response.json["ok"])
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            self.assertEqual(app.test_client().post("/probe").status_code, 503)
            client.assert_not_called()

    def test_auth_input_restrictions_and_cooldown(self):
        app = create_app({"TESTING": True, "PROBE_ENABLED": True, "PROBE_ACCESS_TOKEN": self.TOKEN})
        headers = {"Authorization": "Bearer " + self.TOKEN}
        caller = app.test_client()
        with patch("cloudbase_probe.app.Client") as client, patch("cloudbase_probe.app.Configuration.from_environ"), patch("cloudbase_probe.app.run_probe", return_value={"ok": True, "cleanup": True}) as probe:
            self.assertEqual(caller.post("/probe").status_code, 401)
            self.assertEqual(caller.post("/probe?collection=users", headers=headers).status_code, 400)
            self.assertEqual(caller.post("/probe", data=b"{}", headers=headers).status_code, 400)
            self.assertEqual(caller.get("/probe", headers=headers).status_code, 405)
            client.assert_not_called()
            self.assertEqual(caller.post("/probe", headers=headers).status_code, 200)
            self.assertEqual(caller.post("/probe", headers=headers).status_code, 429)
            self.assertEqual(probe.call_count, 1)

    def test_cloud_failure_is_not_reported_as_success(self):
        app = create_app({"TESTING": True, "PROBE_ENABLED": True, "PROBE_ACCESS_TOKEN": self.TOKEN})
        with patch("cloudbase_probe.app.Client"), patch("cloudbase_probe.app.Configuration.from_environ"), patch("cloudbase_probe.app.run_probe", return_value={"ok": False, "cleanup": True, "error": {"code": "AUTH_ERROR"}}):
            response = app.test_client().post("/probe", headers={"Authorization": "Bearer " + self.TOKEN})
            self.assertEqual(response.status_code, 502)
            self.assertFalse(response.json["ok"])

    def test_missing_admin_configuration_is_actionable(self):
        app = create_app({"TESTING": True, "PROBE_ENABLED": True, "PROBE_ACCESS_TOKEN": self.TOKEN})
        with patch.dict("os.environ", {}, clear=True):
            response = app.test_client().post("/probe", headers={"Authorization": "Bearer " + self.TOKEN})
        self.assertEqual(response.status_code, 503)
        self.assertIn("CLOUDBASE_ENV_ID", response.json["error"])


if __name__ == "__main__":
    unittest.main()
