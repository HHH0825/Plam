"""Migration contracts run against isolated SQLite and transactional CloudBase."""
import base64
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from palm import create_app, initialize_app
from test_cloud_backend import MemoryDocuments, MemoryStorage


class MigrationCases:
    def call(self, method, path, token=None, data=None, key=None):
        self.sequence += 1
        headers = {'Idempotency-Key': key or 'migration-test-' + str(self.sequence).zfill(12), 'X-Palm-Bridge': 'b' * 48}
        if token: headers['Authorization'] = 'Bearer ' + token
        return self.client.open('/api/mp' + path, method=method, json=data, headers=headers)

    def login(self, name):
        result = self.call('POST', '/auth/login', data={'code': name})
        self.assertEqual(result.status_code, 200, result.json)
        return result.json

    def item(self, token):
        result = self.call('POST', '/items', token, {'name': '测试相机', 'category': '摄影', 'icon_type': 'digital',
            'purchase_date': '2026-10-01', 'purchase_price': '100.00', 'status': 'active', 'notes': ''})
        self.assertEqual(result.status_code, 201, result.json)
        return result.json

    def snapshot(self, token):
        result = self.call('POST', '/local-migration/snapshots', token, {})
        self.assertEqual(result.status_code, 201, result.json)
        return result.json

    def test_frozen_pages_owner_isolation_confirmation_and_legacy_write_block(self):
        a, b = self.login('a'), self.login('b')
        self.item(a['token'])
        snap = self.snapshot(a['token'])
        prefix = '/local-migration/snapshots/' + snap['id']
        all_rows = {}
        for page in snap['pages']:
            value = self.call('GET', prefix + '/pages/' + str(page['index']), a['token'])
            self.assertEqual(value.status_code, 200)
            raw = json.dumps(value.json, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
            self.assertEqual(hashlib.sha256(raw).hexdigest(), page['hash'])
            all_rows.setdefault(value.json['table'], []).extend(value.json['rows'])
        self.assertEqual(all_rows['items'][0]['name'], '测试相机')
        self.assertEqual(self.call('GET', prefix + '/pages/0', b['token']).status_code, 404)
        raw = json.dumps(all_rows, ensure_ascii=False)
        self.assertNotIn(a['token'], raw)
        self.assertNotIn('password_hash', raw)
        self.assertNotIn('openid', raw)
        data = {'data_hash': snap['data_hash'], 'backup_saved': True, 'confirmed': True}
        self.assertEqual(self.call('POST', prefix + '/confirm', a['token'], {}).status_code, 400)
        receipt = self.call('POST', prefix + '/confirm', a['token'], data)
        self.assertEqual(receipt.status_code, 200, receipt.json)
        self.assertEqual(self.call('POST', prefix + '/confirm', a['token'], data).json, receipt.json)
        self.assertEqual(self.call('GET', '/local-migration/status', a['token']).json['mode'], 'local')
        rejected = self.call('POST', '/items', a['token'], {'name': '不可再写'})
        self.assertEqual(rejected.status_code, 409, rejected.json)
        self.assertEqual(len(self.call('GET', '/items', a['token']).json), 1)
        self.assertEqual(self.item(b['token'])['name'], '测试相机')

    def test_cloud_change_invalidates_confirmation_without_freezing_account(self):
        a = self.login('a')
        self.item(a['token'])
        snap = self.snapshot(a['token'])
        self.item(a['token'])
        result = self.call('POST', '/local-migration/snapshots/' + snap['id'] + '/confirm', a['token'],
            {'data_hash': snap['data_hash'], 'backup_saved': True, 'confirmed': True})
        self.assertEqual(result.status_code, 409, result.json)
        self.assertEqual(self.call('GET', '/local-migration/status', a['token']).json['mode'], 'cloud')
        self.item(a['token'])


class SQLiteMigrationTests(MigrationCases, unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='palm-migration-')
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.app = initialize_app(create_app({'TESTING': True, 'DATABASE': str(root / 'db.sqlite3'),
            'PHOTO_DIR': str(root / 'photos'), 'WECHAT_CODE_EXCHANGER': lambda code: 'test-' + code}))
        self.client = self.app.test_client()
        self.sequence = 0


class CloudMigrationTests(MigrationCases, unittest.TestCase):
    def setUp(self):
        self.db, self.storage, self.sequence = MemoryDocuments(), MemoryStorage(), 0
        self.app = initialize_app(create_app({'TESTING': True, 'STORAGE_BACKEND': 'cloudbase', 'DEV_LOGIN': False,
            'BRIDGE_SECRET': 'b' * 48, 'CLOUDBASE_CLIENT': self.db, 'CLOUDBASE_STORAGE': self.storage,
            'WECHAT_CODE_EXCHANGER': lambda code: 'test-' + code}))
        self.client = self.app.test_client()

    def test_photo_resume_is_frozen_and_checked_before_confirmation(self):
        a = self.login('a')
        item = self.item(a['token'])
        key = 'a' * 32 + '.jpg'
        self.db.update('palm_items', item['id'], {'photo_key': key})
        raw = b'isolated-photo-fixture' * 3000
        self.storage.objects['palm/photos/' + key] = raw
        snap = self.snapshot(a['token'])
        prefix = '/local-migration/snapshots/' + snap['id']
        confirmation = {'data_hash': snap['data_hash'], 'backup_saved': True, 'confirmed': True}
        self.assertEqual(self.call('POST', prefix + '/confirm', a['token'], confirmation).status_code, 400)
        prepared = self.call('POST', prefix + '/photos/0/prepare', a['token'], {})
        self.assertEqual(prepared.status_code, 200, prepared.json)
        self.storage.objects.pop('palm/photos/' + key)
        self.assertEqual(self.call('POST', prefix + '/photos/0/prepare', a['token'], {}).json, prepared.json)
        chunks, offset = [], 0
        while offset is not None:
            response = self.call('GET', prefix + '/photos/0?offset=' + str(offset), a['token'])
            self.assertEqual(response.status_code, 200, response.json)
            chunks.append(base64.b64decode(response.json['data']))
            offset = response.json['next_offset']
        self.assertEqual(b''.join(chunks), raw)
        self.assertEqual(hashlib.sha256(raw).hexdigest(), prepared.json['hash'])

    def test_transaction_conflict_never_half_confirms_account(self):
        a = self.login('a'); self.item(a['token']); snap = self.snapshot(a['token'])
        original = self.db.finish_transaction
        def conflict(ident, commit=False):
            if commit: self.db.version += 1
            return original(ident, commit)
        with patch.object(self.db, 'finish_transaction', side_effect=conflict):
            response = self.call('POST', '/local-migration/snapshots/' + snap['id'] + '/confirm', a['token'],
                {'data_hash': snap['data_hash'], 'backup_saved': True, 'confirmed': True})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.call('GET', '/local-migration/status', a['token']).json['mode'], 'cloud')


if __name__ == '__main__': unittest.main()
