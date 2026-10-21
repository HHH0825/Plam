"""Real SDK signatures plus transactional photo authorization/failure tests (no network)."""
import base64
import hashlib
import hmac
import io
import json
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).parent))
from test_cloud_backend import CloudBackendTest
from palm.cos_photos import COSPhotos, BUCKET, HOST, validate_download
from palm.cloud_client import CloudBaseError
from PIL import Image


def transfer(response):
    raw = response.headers['X-Palm-Photo-Transfer']
    return json.loads(base64.urlsafe_b64decode(raw + '=' * (-len(raw) % 4)))


class COSSignatureTest(unittest.TestCase):
    def test_signed_policy_exact_key_size_type_deadline_and_hmac(self):
        store = COSPhotos('test-id', 'test-secret', client=object())
        path = 'palm/staging/1/' + 'a' * 48
        info = store.upload_ticket(path, 'image/jpeg', 1234, 1600, now=1000)
        form = info['form']; raw = base64.b64decode(form['policy']); policy = json.loads(raw)
        self.assertIn({'bucket': BUCKET}, policy['conditions'])
        self.assertIn({'key': path}, policy['conditions'])
        self.assertIn(['content-length-range', 1234, 1234], policy['conditions'])
        self.assertIn({'Content-Type': 'image/jpeg'}, policy['conditions'])
        key = hmac.new(b'test-secret', b'1000;1600', hashlib.sha1).hexdigest()
        self.assertEqual(form['q-signature'], hmac.new(key.encode(), hashlib.sha1(raw).hexdigest().encode(), hashlib.sha1).hexdigest())
        replay = store.upload_ticket(path, 'image/jpeg', 1234, 1600, now=1200)
        self.assertEqual(replay['expires_at'], 1600)
        self.assertEqual(replay['form']['q-key-time'], '1200;1600')
        for instant in (1600, 1601, 999):
            with self.assertRaises(CloudBaseError): store.upload_ticket(path, 'image/jpeg', 1234, 1600, now=instant)
        self.assertNotIn('test-secret', json.dumps(info))

    def test_real_sdk_download_is_host_signed_and_both_bounds_are_five_minutes(self):
        store = COSPhotos('test-id', 'test-secret')
        path = 'palm/photos/' + 'a' * 32 + '.jpg'
        info = store.download_ticket(path)
        self.assertIn('q-header-list=host', info['url'])
        self.assertLessEqual(info['expires_at'], int(time.time()) + 300)
        for value in (info['url'].replace(HOST, 'evil.example'),
                      info['url'].replace(path, path.replace('a', 'b')),
                      info['url'] + '&q-key-time=1%3B2'):
            with self.assertRaises(CloudBaseError): validate_download(value, path)
        with self.assertRaises(CloudBaseError): validate_download(info['url'], path, now=info['expires_at'])

    def test_io_limits_short_read_and_redacted_error(self):
        class Body:
            def get_raw_stream(self): return io.BytesIO(b'x' * 12)
        class Client:
            def head_object(self, **args): return {'Content-Length': '12', 'Content-Type': 'image/png'}
            def get_object(self, **args): return {'Body': Body()}
            def put_object(self, **args): raise RuntimeError('SECRET AND SIGNED URL')
        store = COSPhotos('test-id', 'test-secret', client=Client())
        path = 'palm/staging/1/' + 'a' * 48
        self.assertEqual(store.download(path, 12, 'image/png'), b'x' * 12)
        from palm.validation import InputError
        with self.assertRaises(InputError): store.download(path, 11, 'image/png')
        with self.assertRaises(InputError): store.download(path, 12, 'image/jpeg')
        with self.assertRaises(CloudBaseError) as raised: store.upload('palm/photos/' + 'b' * 32 + '.jpg', b'bytes')
        self.assertNotIn('SECRET', str(raised.exception))
        for path in ('palm/photos/../escape', 'other/file', 'palm/staging/2/filename'):
            with self.assertRaises(CloudBaseError): store.path(path)

    def test_stream_initialization_and_close_never_expose_sdk_diagnostics(self):
        class Stream:
            def __init__(self): self.buffer = io.BytesIO(b'x' * 12)
            def read(self, size): return self.buffer.read(size)
            def close(self): raise RuntimeError('SECRET SIGNATURE')
        class Body:
            def get_raw_stream(self): return Stream()
        class Client:
            def head_object(self, **args): return {'Content-Length': '12'}
            def get_object(self, **args): return {'Body': Body()}
        store = COSPhotos('test-id', 'test-secret', client=Client())
        path = 'palm/staging/1/' + 'a' * 48
        self.assertEqual(store.download(path, 12), b'x' * 12)
        with patch.object(Body, 'get_raw_stream', side_effect=RuntimeError('SECRET SIGNATURE')):
            with self.assertRaises(CloudBaseError) as raised: store.download(path, 12)
        self.assertEqual(raised.exception.code, 'PHOTO_COS_READ_FAILED')
        self.assertNotIn('SECRET', str(raised.exception))


class PhotoTransactionTest(CloudBackendTest):
    def test_busy_slot_rejects_before_downloading_any_image(self):
        token, path, raw = self.fixture()
        ticket = self.ticket(token, path, raw).json['ticket']
        from palm.cloud_storage import _processing_slot
        self.assertTrue(_processing_slot.acquire(blocking=False))
        try:
            with patch.object(self.storage, 'download') as download:
                response = self.call('POST', path + '/photo/uploads/' + ticket + '/commit', token, {})
            self.assertEqual(response.status_code, 503)
            download.assert_not_called()
        finally:
            _processing_slot.release()

    def test_slot_covers_download_and_both_uploads_and_releases_on_failure(self):
        from palm.cloud_storage import _processing_slot
        token, path, raw = self.fixture()
        for failure_phase in ('download', 'full', 'thumb', None):
            with self.subTest(failure_phase=failure_phase):
                ticket = self.ticket(token, path, raw).json['ticket']
                row = self.db.rows[('palm_photo_uploads', ticket)]
                self.storage.objects[row['object_id']] = raw
                phases = []
                original_download, original_upload = self.storage.download, self.storage.upload
                def occupied(phase):
                    acquired = _processing_slot.acquire(blocking=False)
                    if acquired:
                        _processing_slot.release()
                    self.assertFalse(acquired, phase)
                    phases.append(phase)
                    if phase == failure_phase:
                        raise CloudBaseError(0, 'INJECTED_IO_FAILURE')
                def download(*args, **kwargs):
                    occupied('download')
                    return original_download(*args, **kwargs)
                def upload(key, content):
                    occupied('thumb' if key.endswith('.thumb.jpg') else 'full')
                    return original_upload(key, content)
                with patch.object(self.storage, 'download', side_effect=download), patch.object(self.storage, 'upload', side_effect=upload):
                    response = self.call('POST', path + '/photo/uploads/' + ticket + '/commit', token, {})
                self.assertEqual(response.status_code, 503 if failure_phase else 200)
                self.assertTrue(_processing_slot.acquire(blocking=False))
                _processing_slot.release()
                if failure_phase is None:
                    self.assertEqual(phases, ['download', 'full', 'thumb'])

    def fixture(self):
        token = self.login('photo-owner')['token']; item = self.item(token)
        out = io.BytesIO(); Image.new('RGB', (50, 30), 'red').save(out, 'PNG')
        return token, '/items/' + str(item['id']), out.getvalue()

    def ticket(self, token, path, raw, key=None):
        return self.call('POST', path + '/photo/uploads', token, {'size_bytes': len(raw), 'content_type': 'image/png'}, key)

    def test_header_only_replay_deadline_owner_and_no_signature_persistence(self):
        token, path, raw = self.fixture(); key = 'photo-upload-replay-0001'
        first = self.ticket(token, path, raw, key)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(set(first.json), {'ticket', 'expires_at'})
        replay = self.ticket(token, path, raw, key)
        self.assertEqual(first.json, replay.json)
        self.assertEqual(transfer(replay)['expires_at'], transfer(first)['expires_at'])
        persisted = json.dumps(list(self.db.rows.values()))
        for value in ('q-signature', 'policy', 'test-secret', 'https://', 'test-id'):
            self.assertNotIn(value, persisted)
        other = self.login('other-owner')['token']
        self.assertEqual(self.ticket(other, path, raw).status_code, 404)
        record = self.db.rows[('palm_photo_uploads', first.json['ticket'])]
        record['expires_at'] = 0
        self.assertEqual(self.ticket(token, path, raw, key).status_code, 410)

    def test_failed_thumbnail_preserves_old_photo_and_both_new_files_are_queued(self):
        token, path, raw = self.fixture()
        row = next(r for (name, _), r in self.db.rows.items() if name == 'palm_items')
        old = 'a' * 32 + '.jpg'; row['photo_key'] = old
        response = self.ticket(token, path, raw)
        ticket = self.db.rows[('palm_photo_uploads', response.json['ticket'])]
        self.storage.objects[ticket['object_id']] = raw
        original = self.storage.upload
        def fail_thumb(path, raw):
            if '.thumb.' in path: raise CloudBaseError(0, 'COS_TEST_FAILURE')
            original(path, raw)
        with patch.object(self.storage, 'upload', side_effect=fail_thumb):
            failed = self.call('POST', path + '/photo/uploads/' + response.json['ticket'] + '/commit', token, {})
        self.assertEqual(failed.status_code, 503)
        self.assertEqual(self.call('GET', path, token).json['photo_version'], hashlib.sha256(old.encode()).hexdigest()[:24])
        queued = [r['object_id'] for (name, _), r in self.db.rows.items() if name == 'palm_storage_gc']
        self.assertEqual(sum(p.startswith('palm/photos/') for p in queued), 2)
        self.assertFalse(ticket['committed_key'])

    def test_feature_disabled_keeps_core_and_rejects_upload_and_commit_before_io(self):
        token, path, raw = self.fixture(); response = self.ticket(token, path, raw)
        self.app.config['CLOUD_PHOTOS_ENABLED'] = False
        with patch.object(self.storage, 'download') as read, patch.object(self.storage, 'upload_ticket') as sign:
            self.assertEqual(self.ticket(token, path, raw).status_code, 503)
            self.assertEqual(self.call('POST', path + '/photo/uploads/' + response.json['ticket'] + '/commit', token, {}).status_code, 503)
            read.assert_not_called(); sign.assert_not_called()
        self.assertEqual(self.call('GET', '/items', token).status_code, 200)

    def io_interruption(self, event):
        token, path, raw = self.fixture()
        response = self.ticket(token, path, raw)
        ticket_id = response.json['ticket']
        self.storage.objects[self.db.rows[('palm_photo_uploads', ticket_id)]['object_id']] = raw
        original = self.storage.upload
        def interrupted(object_id, content):
            original(object_id, content)
            if '.thumb.' in object_id:
                if event == 'expire': self.db.rows[('palm_photo_uploads', ticket_id)]['expires_at'] = 0
                else:
                    row = next(r for (name, _), r in self.db.rows.items() if name == 'palm_items')
                    row['deleted_at'] = '2026-10-06 00:00:00'
        with patch.object(self.storage, 'upload', side_effect=interrupted):
            reply = self.call('POST', path + '/photo/uploads/' + ticket_id + '/commit', token, {})
        self.assertIn(reply.status_code, (404, 410))
        self.assertFalse(self.db.rows[('palm_photo_uploads', ticket_id)]['committed_key'])
        queued = [r for (name, _), r in self.db.rows.items() if name == 'palm_storage_gc' and r['object_id'].startswith('palm/photos/')]
        self.assertEqual(len(queued), 2)

    def test_expiry_during_file_io_cannot_attach_new_photos(self): self.io_interruption('expire')

    def test_deleted_item_during_file_io_cannot_attach_new_photos(self): self.io_interruption('delete')

    def test_wire_header_survives_envelope_without_retmsg_signature(self):
        from palm.cloud_runtime import direct_envelope
        token, path, raw = self.fixture()
        self.app.config['REQUEST_MODE'] = 'direct_http'
        self.app.after_request_funcs[None].insert(0, direct_envelope)
        response = self.ticket(token, path, raw)
        self.assertEqual(response.json['statusCode'], 200)
        self.assertEqual(transfer(response)['kind'], 'upload')
        self.assertNotIn('q-signature', response.get_data(as_text=True))
        self.assertNotIn('https://', response.get_data(as_text=True))


if __name__ == '__main__': unittest.main()
