"""Restricted private COS IO. No credentials or signed URLs belong in logs/receipts."""
import base64
import hashlib
import hmac
import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from urllib.parse import parse_qs, unquote, urlsplit

from .cloud_client import CloudBaseError
from .photo import PHOTO_MAX_BYTES
from .validation import InputError

BUCKET = '636c-cloud1-example-1000000000'
REGION = 'ap-shanghai'
HOST = BUCKET + '.cos.' + REGION + '.myqcloud.com'
MIMES = {'image/jpeg', 'image/png', 'image/webp'}
TRANSFER_HEADER = 'X-Palm-Photo-Transfer'


def transfer_response(response, kind, info):
    encoded = base64.urlsafe_b64encode(json.dumps({'v': 1, 'kind': kind, **info},
        ensure_ascii=True, separators=(',', ':')).encode()).decode().rstrip('=')
    if len(encoded) > 4096:
        raise CloudBaseError(0, 'PHOTO_TRANSFER_TOO_LARGE')
    response.headers[TRANSFER_HEADER] = encoded
    response.headers['Cache-Control'] = 'no-store'
    return response


def validate_download(url, path, host=HOST, now=None):
    now = int(time.time()) if now is None else now
    parsed = urlsplit(url)
    query = parse_qs(parsed.query)
    try:
        if (parsed.scheme != 'https' or parsed.netloc != host or parsed.fragment
                or unquote(parsed.path) != '/' + path):
            raise ValueError('object')
        if query.get('q-sign-algorithm') != ['sha1'] or len(query.get('q-signature', [])) != 1:
            raise ValueError('signature')
        if not re.fullmatch('[0-9a-f]{40}', query['q-signature'][0]):
            raise ValueError('signature')
        ends = []
        for key in ('q-sign-time', 'q-key-time'):
            if len(query.get(key, [])) != 1: raise ValueError('ambiguous')
            start, end = map(int, query[key][0].split(';'))
            if start > now + 5 or end <= now or end > now + 300 or not 0 < end - start <= 300:
                raise ValueError('expiry')
            ends.append(end)
    except (ValueError, TypeError, KeyError):
        raise CloudBaseError(0, 'PHOTO_DOWNLOAD_TTL_UNVERIFIED') from None
    return {'url': url, 'expires_at': min(ends)}


class COSPhotos:
    def __init__(self, secret_id=None, secret_key=None, client=None):
        self.secret_id = secret_id or os.environ.get('PALM_COS_SECRET_ID', '')
        self.secret_key = secret_key or os.environ.get('PALM_COS_SECRET_KEY', '')
        if not self.secret_id or not self.secret_key:
            raise CloudBaseError(0, 'PHOTO_COS_CONFIGURATION_MISSING')
        if os.environ.get('CLOUDBASE_STORAGE_BUCKET', BUCKET) != BUCKET or os.environ.get('CLOUDBASE_STORAGE_HOST', HOST) != HOST:
            raise CloudBaseError(0, 'PHOTO_COS_CONFIGURATION_INVALID')
        # SDK INFO messages include authorization headers. Suppress all SDK/request logs.
        for name in ('qcloud_cos', 'requests', 'urllib3'):
            logger = logging.getLogger(name)
            logger.handlers.clear()
            logger.addHandler(logging.NullHandler())
            logger.propagate = False
            logger.setLevel(logging.CRITICAL + 1)
        if client is None:
            from qcloud_cos import CosConfig, CosS3Client
            client = CosS3Client(CosConfig(Region=REGION, SecretId=self.secret_id,
                SecretKey=self.secret_key, Scheme='https', Timeout=5), retry=0)
        self.client = client

    @staticmethod
    def path(path):
        if not isinstance(path, str) or not re.fullmatch(
                r'palm/(?:staging/[1-9][0-9]*/[a-f0-9]{48}|photos/[a-f0-9]{32}(?:\.thumb)?\.jpg)', path):
            raise CloudBaseError(0, 'PHOTO_COS_OBJECT_INVALID')
        return path

    def invoke(self, operation, **kwargs):
        try:
            return getattr(self.client, operation)(Bucket=BUCKET, **kwargs)
        except Exception as error:
            # Never stringify SDK exceptions: they can contain signed request URLs.
            code, request_id = 'PHOTO_COS_REQUEST_FAILED', ''
            try:
                candidate = error.get_error_code()
                identifier = error.get_request_id()
                if re.fullmatch('[A-Za-z0-9_]{1,80}', candidate or ''): code = 'COS_' + candidate
                if re.fullmatch('[A-Za-z0-9_-]{1,160}', identifier or ''): request_id = identifier
            except Exception:
                pass
            raise CloudBaseError(0, code, request_id) from None

    def upload_ticket(self, path, content_type, size_bytes, expires_at, now=None):
        self.path(path)
        now = int(time.time()) if now is None else now
        if not isinstance(content_type, str) or content_type not in MIMES or type(size_bytes) is not int or not 0 < size_bytes <= PHOTO_MAX_BYTES:
            raise InputError('照片只支持 JPEG、PNG、WebP，且不能超过 5 MB')
        if type(expires_at) is not int or not now < expires_at <= now + 600:
            raise CloudBaseError(0, 'PHOTO_UPLOAD_TTL_UNVERIFIED')
        # Sign the original absolute deadline on replay, never extend the ticket.
        key_time = f'{now};{expires_at}'
        fields = {'key': path, 'Content-Type': content_type, 'acl': 'default',
                  'success_action_status': '204', 'q-sign-algorithm': 'sha1',
                  'q-ak': self.secret_id, 'q-sign-time': key_time}
        conditions = [{'bucket': BUCKET}, *({key: value} for key, value in fields.items()),
                      ['content-length-range', size_bytes, size_bytes]]
        policy = json.dumps({'expiration': datetime.fromtimestamp(expires_at, timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                             'conditions': conditions}, separators=(',', ':')).encode()
        sign_key = hmac.new(self.secret_key.encode(), key_time.encode(), hashlib.sha1).hexdigest()
        signature = hmac.new(sign_key.encode(), hashlib.sha1(policy).hexdigest().encode(), hashlib.sha1).hexdigest()
        fields.update({'policy': base64.b64encode(policy).decode(), 'q-key-time': key_time, 'q-signature': signature})
        return {'url': 'https://' + HOST + '/', 'form': fields, 'expires_at': expires_at}

    def head(self, path):
        return self.invoke('head_object', Key=self.path(path))

    def download(self, path, expected_size=None, content_type=None):
        info = self.head(path)
        try: length = int(info.get('Content-Length', -1))
        except (ValueError, TypeError): length = -1
        if not 0 < length <= PHOTO_MAX_BYTES: raise InputError('照片不能超过 5 MB，且不能为空')
        if expected_size is not None and length != expected_size: raise InputError('照片大小与上传凭证不一致')
        if content_type and info.get('Content-Type', '').split(';')[0].lower() != content_type:
            raise InputError('照片类型与上传凭证不一致')
        result = self.invoke('get_object', Key=self.path(path))
        stream = None
        try:
            stream = result['Body'].get_raw_stream()
            # Some HTTP streams may short-read; still stop at the strict byte bound.
            chunks, total = [], 0
            while total <= PHOTO_MAX_BYTES:
                chunk = stream.read(min(64 * 1024, PHOTO_MAX_BYTES + 1 - total))
                if not chunk: break
                chunks.append(chunk); total += len(chunk)
            raw = b''.join(chunks)
        except Exception:
            raise CloudBaseError(0, 'PHOTO_COS_READ_FAILED') from None
        finally:
            if stream is not None:
                try: stream.close()
                except Exception: pass  # Never expose raw SDK errors containing signed URLs.
        if len(raw) != length: raise InputError('照片上传未完成或内容发生变化')
        return raw

    def upload(self, path, raw):
        self.invoke('put_object', Key=self.path(path), Body=raw, ContentType='image/jpeg',
                    ContentMD5=base64.b64encode(hashlib.md5(raw).digest()).decode())

    def delete(self, path):
        self.invoke('delete_object', Key=self.path(path))

    def download_ticket(self, path):
        path = self.path(path)
        # SDK 1.9.44 backdates the signing start by 60 seconds. Expired=300
        # would make BOTH signed intervals 360 seconds. 240 keeps them <=300.
        url = self.invoke('get_presigned_url', Key=path, Method='GET', Expired=240, SignHost=True)
        return validate_download(url, path)
