"""Private COS objects; administrator authorization never reaches upload clients."""
import hashlib
import json
import os
import re
import time
from threading import BoundedSemaphore
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, parse_qs
from urllib.request import Request, build_opener
from flask import abort, current_app, g
from io import BytesIO
from werkzeug.datastructures import FileStorage
from .cloud_client import CloudBaseError, Configuration
from cloudbase_probe.client import _NoRedirect
from .photo import PHOTO_MAX_BYTES, normalized_photo, thumbnail_bytes, thumbnail_key
from .validation import InputError

_processing_slot = BoundedSemaphore(1)


def final_object(key): return 'palm/photos/' + key


def validate_upload_lifetime(info, now=None):
    """Do not release COS credentials whose actual signature outlives the ticket."""
    now = int(time.time()) if now is None else now
    authorization = info.get('headers', {}).get('Authorization', '')
    try:
        parts = parse_qs(authorization).get('q-sign-time', [''])[0].split(';')
        start, end = map(int, parts)
        if start > now + 5 or end <= now or end > now + 600 or end - start > 600:
            raise ValueError('lifetime')
    except (ValueError, TypeError, AttributeError):
        raise CloudBaseError(200, 'PHOTO_UPLOAD_TTL_UNVERIFIED') from None
    return end


class Storage:
    def __init__(self, config, bucket, host):
        self.config, self.bucket, self.host = config, bucket, host
        if not re.fullmatch(r'[A-Za-z0-9-]+', bucket): raise ValueError('CLOUDBASE_STORAGE_BUCKET missing')
        if not re.fullmatch(r'[a-z0-9.-]+\.myqcloud\.com', host): raise ValueError('CLOUDBASE_STORAGE_HOST must be the existing COS hostname')
        self.opener = build_opener(_NoRedirect())

    def file_id(self, path):
        if not path.startswith(('palm/photos/', 'palm/staging/')) or '..' in path: raise ValueError('Invalid storage path')
        return f'cloud://{self.config.env_id}.{self.bucket}/{path}'

    def trusted_url(self, url):
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or parsed.hostname != self.host or parsed.port not in (None, 443) or parsed.username or parsed.password:
            raise CloudBaseError(200, 'UNTRUSTED_STORAGE_URL')
        return url

    def api(self, action, body):
        url = f'https://{self.config.env_id}.api.tcloudbasegateway.com/v1/storages/{action}'
        req = Request(url, method='POST', data=json.dumps(body).encode(), headers={
            'Authorization': 'Bearer ' + self.config.api_key, 'Content-Type': 'application/json'})
        try:
            with self.opener.open(req, timeout=5) as response:
                raw = response.read(64 * 1024 + 1)
                request_id = response.headers.get('X-Request-Id', '')
                status = response.status
        except HTTPError as error:
            with error:
                try: payload = json.loads(error.read(8192))
                except (ValueError, UnicodeError): payload = {}
                if not isinstance(payload, dict): payload = {}
                raise CloudBaseError(error.code, payload.get('code', 'STORAGE_ERROR'), payload.get('requestId', '')) from None
        except (OSError, URLError): raise CloudBaseError(0, 'STORAGE_NETWORK_ERROR') from None
        if status != 200 or len(raw) > 64 * 1024: raise CloudBaseError(status, 'STORAGE_INVALID_RESPONSE', request_id)
        try: rows = json.loads(raw)
        except (ValueError, UnicodeError): raise CloudBaseError(status, 'STORAGE_INVALID_JSON', request_id) from None
        if not isinstance(rows, list) or len(rows) != len(body): raise CloudBaseError(status, 'STORAGE_INVALID_RESPONSE', request_id)
        for row in rows:
            if not isinstance(row, dict): raise CloudBaseError(status, 'STORAGE_INVALID_RESPONSE', request_id)
            if row.get('code') and not (action == 'delete-objects' and row['code'] == 'OBJECT_NOT_EXIST'):
                raise CloudBaseError(status, row['code'], request_id)
        return rows

    def upload_info(self, path):
        result = self.api('get-objects-upload-info', [{'objectId': path}])[0]
        if result.get('cloudObjectId') != self.file_id(path): raise CloudBaseError(200, 'STORAGE_WRONG_BUCKET')
        return {'url': self.trusted_url(result['uploadUrl']), 'headers': {
            'Authorization': result['authorization'], 'X-Cos-Security-Token': result['token'],
            'X-Cos-Meta-Fileid': result['cloudObjectMeta']}}

    def download(self, path):
        info = self.api('get-objects-download-info', [{'cloudObjectId': self.file_id(path)}])[0]
        req = Request(self.trusted_url(info.get('downloadUrlEncoded') or info['downloadUrl']))
        try:
            with self.opener.open(req, timeout=5) as response: raw = response.read(PHOTO_MAX_BYTES + 1)
        except (OSError, URLError): raise CloudBaseError(0, 'STORAGE_DOWNLOAD_FAILED') from None
        if len(raw) > PHOTO_MAX_BYTES: raise InputError('照片不能超过 5 MB')
        return raw

    def download_ticket(self, path):
        info = self.api('get-objects-download-info', [{'cloudObjectId': self.file_id(path)}])[0]
        url = self.trusted_url(info.get('downloadUrlEncoded') or info.get('downloadUrl', ''))
        now = int(time.time())
        try:
            query = parse_qs(urlsplit(url).query)
            # Reject ambiguous/unsigned or long-lived signatures. Never trust a nominal maxAge.
            if len(query.get('q-sign-time', [])) != 1 or len(query.get('q-key-time', [])) != 1:
                raise ValueError('signature')
            if query.get('q-sign-algorithm') != ['sha1'] or len(query.get('q-signature', [])) != 1:
                raise ValueError('signature')
            if not re.fullmatch(r'[0-9a-fA-F]{40}', query['q-signature'][0]):
                raise ValueError('signature')
            bounds = [list(map(int, query[key][0].split(';'))) for key in ('q-sign-time', 'q-key-time')]
            for start, end in bounds:
                if start > now + 5 or end <= now or end > now + 300 or end - start > 300:
                    raise ValueError('lifetime')
            expires = min(bound[1] for bound in bounds)
        except (ValueError, TypeError, KeyError):
            raise CloudBaseError(200, 'PHOTO_DOWNLOAD_TTL_UNVERIFIED') from None
        # The exact requested path must be covered; do not sign arbitrary server-returned objects.
        from urllib.parse import unquote
        if unquote(urlsplit(url).path) != '/' + path:
            raise CloudBaseError(200, 'STORAGE_WRONG_OBJECT')
        return {'url': url, 'expires_at': expires, 'max_age': expires - now}

    def upload(self, path, raw):
        info = self.upload_info(path)
        req = Request(info['url'], method='PUT', data=raw, headers=info['headers'])
        try:
            with self.opener.open(req, timeout=5) as response:
                if response.status not in (200, 201, 204): raise CloudBaseError(response.status, 'STORAGE_UPLOAD_FAILED')
        except (OSError, URLError): raise CloudBaseError(0, 'STORAGE_UPLOAD_FAILED') from None

    def delete(self, path): self.api('delete-objects', [{'cloudObjectId': self.file_id(path)}])


def storage():
    instance = current_app.extensions.get('cloudbase_storage')
    if instance: return instance
    from .cos_photos import COSPhotos
    instance = current_app.config.get('CLOUDBASE_STORAGE') or COSPhotos()
    current_app.extensions['cloudbase_storage'] = instance
    return instance


def prepare_commit(ticket_id, item_id):
    """Perform image IO outside the business transaction; GC survives any failed commit."""
    import secrets
    from . import cloud_repository as repo
    from .cloud_runtime import begin
    from .validation import InputError
    repo.item_row(item_id)
    ticket = repo.get('photo_uploads', ticket_id)
    if not ticket or ticket['user_id'] != g.user_id or ticket['item_id'] != item_id: abort(404)
    if ticket.get('committed_key'): return
    if ticket['expires_at'] <= int(time.time()): abort(410, description='照片上传凭证已过期，请重新上传')
    if not _processing_slot.acquire(timeout=2):
        raise CloudBaseError(0, 'PHOTO_PROCESSING_BUSY')
    try:
        # Waiting requests must not download/decode images. Hold the slot until
        # both derived files have been uploaded, including every failure path.
        if ticket['expires_at'] <= int(time.time()):
            abort(410, description='照片上传凭证已过期，请重新上传')
        from .cloud_versions import check_mutation
        check_mutation()
        raw = storage().download(ticket['object_id'], expected_size=ticket.get('size_bytes'),
                                 content_type=ticket.get('content_type'))
        # A declared MIME is not proof of file format. Check the source as well.
        from PIL import Image, UnidentifiedImageError
        try:
            with Image.open(BytesIO(raw)) as source:
                if {'JPEG': 'image/jpeg', 'PNG': 'image/png', 'WEBP': 'image/webp'}.get(source.format) != ticket.get('content_type'):
                    raise InputError('照片真实格式与上传凭证不一致')
        except (UnidentifiedImageError, OSError, ValueError):
            raise InputError('照片文件无效') from None
        encoded = normalized_photo(FileStorage(stream=BytesIO(raw), filename='photo'))
        thumb = thumbnail_bytes(encoded)
        del raw
        key = secrets.token_hex(16) + '.jpg'
        begin()
        try:
            for name in (key, thumbnail_key(key)):
                repo.queue_file(final_object(name), int(time.time()) + 24 * 3600)
            repo.db().finish_transaction(g.cloud_tx, commit=True)
            g.cloud_tx = None
        except Exception:
            if g.cloud_tx:
                repo.db().finish_transaction(g.cloud_tx)
                g.cloud_tx = None
            raise
        # Fresh paths prevent a racing retry from overwriting committed bytes.
        storage().upload(final_object(key), encoded)
        storage().upload(final_object(thumbnail_key(key)), thumb)
        g.prepared_photo = (ticket_id, key)
    finally:
        _processing_slot.release()
