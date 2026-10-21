"""Cloud provider contract tests with an isolated transactional document service."""
import copy
import io
import json
import re
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from datetime import datetime, timedelta, timezone
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from palm import create_app, initialize_app
from palm.cloud_client import CloudBaseError


class MemoryDocuments:
    def __init__(self): self.rows, self.transactions, self.version, self.counter = {}, {}, 0, 0
    def data(self, tx=None): return self.transactions[tx][0] if tx else self.rows
    def get(self, name, key, transaction_id=None): return copy.deepcopy(self.data(transaction_id).get((name, str(key))))
    def insert(self, name, documents, transaction_id=None):
        store = self.data(transaction_id)
        for row in documents:
            key = (name, str(row['_id']))
            if key in store: raise CloudBaseError(409, 'DUPLICATE_KEY')
            store[key] = copy.deepcopy(row)
        return [r['_id'] for r in documents]
    def update(self, name, key, values, transaction_id=None):
        self.data(transaction_id)[(name, str(key))].update(copy.deepcopy(values))
    def delete(self, name, key, transaction_id=None): self.data(transaction_id).pop((name, str(key)), None)
    def start_transaction(self):
        self.counter += 1; key = str(self.counter)
        self.transactions[key] = (copy.deepcopy(self.rows), self.version)
        return key
    def finish_transaction(self, key, commit=False):
        if key not in self.transactions: raise CloudBaseError(404, 'TRANSACTION_NOT_FOUND')
        data, version = self.transactions.pop(key)
        if commit:
            if version != self.version: raise CloudBaseError(409, 'TRANSACTION_CONFLICT')
            self.rows = data; self.version += 1
    def page(self, name, conditions=None, transaction_id=None, limit=100, after=None):
        def match(row, conditions):
            for key, expected in (conditions or {}).items():
                value = row.get(key)
                if isinstance(expected, dict):
                    for op, arg in expected.items():
                        if op == '$ne' and value == arg: return False
                        if op == '$lte' and (value is None or value > arg): return False
                        if op == '$gt' and (value is None or value <= arg): return False
                elif value != expected: return False
            return True
        rows = [copy.deepcopy(r) for (table, _), r in self.data(transaction_id).items() if table == name and match(r, conditions)]
        return sorted([r for r in rows if after is None or r['_id'] > after], key=lambda r: r['_id'])[:limit]
    def query(self, name, conditions=None, transaction_id=None):
        result, after = [], None
        while True:
            rows = self.page(name, conditions, transaction_id, after=after)
            result += rows
            if len(rows) < 100: return result
            after = rows[-1]['_id']


class MemoryStorage:
    def __init__(self):
        self.objects = {}
        from palm.cos_photos import COSPhotos
        self.signer = COSPhotos('test-id', 'test-secret')
    def upload_ticket(self, *args): return self.signer.upload_ticket(*args)
    def download_ticket(self, path): return self.signer.download_ticket(path)
    def file_id(self, path): return 'cloud://cloud1.test-bucket/' + path
    def upload_info(self, path):
        now = int(time.time())
        return {'url': 'https://test.cos.ap-shanghai.myqcloud.com/' + path,
                'headers': {'Authorization': f'q-sign-time={now};{now + 600}'}}
    def download(self, path, expected_size=None, content_type=None):
        from palm.validation import InputError
        raw = self.objects[path]
        if expected_size is not None and len(raw) != expected_size: raise InputError('照片大小与上传凭证不一致')
        return raw
    def upload(self, path, raw): self.objects[path] = raw
    def delete(self, path): self.objects.pop(path, None)


class CloudBackendTest(unittest.TestCase):
    def test_me_overview_cloud_contract(self):
        login = self.login('overview')
        token, user = login['token'], login['user']
        self.db.update('palm_users', user['id'], {'created_at': '2026-10-10T16:00:00+00:00'})
        active, idle, disposed, trash = [self.item(token) for _ in range(4)]
        self.db.update('palm_items', idle['id'], {'status': 'idle', 'purchase_cents': 0})
        self.db.update('palm_items', disposed['id'], {'status': 'disposed'})
        self.db.update('palm_items', trash['id'], {'deleted_at': '2026-10-11T00:00:00Z'})
        self.item(self.login('other')['token'])
        stats = self.call('GET', '/stats', token).json
        self.assertEqual((stats['held_items'], stats['held_purchase_total']), (2, '1200.01'))
        with patch('palm.routes_auth.natural_today', return_value=__import__('datetime').date(2026, 10, 11)):
            me = self.call('GET', '/auth/me', token).json
        self.assertEqual(me['account_age_days'], 1)
        self.assertEqual(me['user'], user)

    def setUp(self):
        self.db, self.storage, self.requests = MemoryDocuments(), MemoryStorage(), 0
        self.app = initialize_app(create_app({'TESTING': True, 'STORAGE_BACKEND': 'cloudbase',
            'DEV_LOGIN': False, 'BRIDGE_SECRET': 'b' * 48, 'CLOUD_PHOTOS_ENABLED': True, 'CLOUDBASE_CLIENT': self.db,
            'CLOUDBASE_STORAGE': self.storage, 'WECHAT_CODE_EXCHANGER': lambda code: 'wx-' + code}))
        self.client = self.app.test_client()
        self.guard = patch('palm.database.get_db', side_effect=AssertionError('Cloud touched SQLite'))
        self.guard.start(); self.addCleanup(self.guard.stop)
    def version_headers(self, method, path, key):
        if method == 'GET': return {}
        match = re.match(r'/(?:items|trash)/(\d+)', path)
        row = self.db.get('palm_items', match[1]) if match else None
        child = re.match(r'/(maintenance|disposal)/(\d+)', path)
        if child:
            record = self.db.get('palm_' + child[1] + '_records', child[2])
            row = self.db.get('palm_items', record['item_id']) if record else None
        if not row: return {}
        versions = getattr(self, '_request_versions', {})
        revision = versions.setdefault(key, row.get('revision', 0))
        self._request_versions = versions
        return {'If-Match': f'"{revision}"'}
    def call(self, method, path, token=None, data=None, key=None):
        self.requests += 1
        headers = {'X-Palm-Bridge': 'b' * 48, 'Idempotency-Key': key or 'cloud-request-' + str(self.requests).zfill(12)}
        headers.update(CloudBackendTest.version_headers(self, method, path, headers['Idempotency-Key']))
        if token: headers['Authorization'] = 'Bearer ' + token
        return self.client.open('/api/mp' + path, method=method, headers=headers, json=data)
    def login(self, user):
        result = self.call('POST', '/auth/login', data={'code': user})
        self.assertEqual(result.status_code, 200, result.json)
        return result.json
    def item(self, token, key=None):
        result = self.call('POST', '/items', token, {'name': 'Camera', 'category': 'Digital', 'icon_type': 'digital',
            'purchase_date': '2025-01-01', 'purchase_price': '1200.01', 'notes': '', 'status': 'active'}, key)
        self.assertEqual(result.status_code, 201, result.json)
        return result.json
    def test_sessions_isolation_idempotency_and_no_raw_token_persistence(self):
        alice, bob = self.login('alice'), self.login('bob')
        self.assertEqual(alice['user']['id'], self.login('alice')['user']['id'])
        key = 'same-request-create-0001'
        item = self.item(alice['token'], key)
        replay = self.item(alice['token'], key)
        self.assertEqual(item, replay)
        self.assertEqual(self.call('GET', '/items', bob['token']).json, [])
        for path in (f"/items/{item['id']}", f"/items/{item['id']}/photo/download", f"/items/{item['id']}/maintenance"):
            self.assertEqual(self.call('GET', path, bob['token']).status_code, 404)
        bad = self.call('POST', '/items', alice['token'], {'name': 'Different'}, key)
        self.assertEqual(bad.status_code, 409)
        self.assertNotIn(alice['token'], json.dumps(list(self.db.rows.values()), default=str))
        self.assertEqual(self.call('POST', '/auth/logout', alice['token']).status_code, 204)
        self.assertEqual(self.call('GET', '/items', alice['token']).status_code, 401)
    def test_lifecycle_reports_and_atomic_rollback(self):
        token = self.login('owner')['token']; item = self.item(token); prefix = f"/items/{item['id']}"
        repair = self.call('POST', prefix + '/maintenance', token,
                           {'maintained_on': '2025-03-01', 'cost': '100.02', 'description': 'Clean'})
        self.assertEqual(repair.status_code, 201, repair.json)
        invalid = self.call('POST', prefix + '/disposal', token, {'disposed_on': '2025-02-01', 'method': 'sold', 'proceeds': '500.00'})
        self.assertEqual(invalid.status_code, 400)
        original = self.db.update
        def fail_parent(name, key, values, transaction_id=None):
            if name == 'palm_items' and values.get('status') == 'disposed': raise CloudBaseError(503, 'INJECTED_FAILURE')
            return original(name, key, values, transaction_id)
        with patch.object(self.db, 'update', side_effect=fail_parent):
            failed = self.call('POST', prefix + '/disposal', token, {'disposed_on': '2025-04-01', 'method': 'sold', 'proceeds': '500.00'})
        self.assertEqual(failed.status_code, 503)
        self.assertFalse(any(table == 'palm_disposal_records' for table, _ in self.db.rows))
        disposed = self.call('POST', prefix + '/disposal', token, {'disposed_on': '2025-04-01', 'method': 'sold', 'proceeds': '500.00'})
        self.assertEqual(disposed.status_code, 201, disposed.json)
        detail = self.call('GET', prefix, token).json
        self.assertEqual(detail['net_cost'], '800.03')
        self.assertEqual(self.call('GET', '/reports/monthly?month=2025-03', token).json['totals']['maintenance_total'], '100.02')
        self.assertEqual(self.call('POST', prefix + '/usage/today', token).status_code, 410)
        self.assertEqual(self.call('POST', prefix + '/maintenance', token, {'maintained_on': '2025-03-02', 'cost': '1', 'description': 'x'}).status_code, 400)
        self.assertEqual(self.call('DELETE', '/disposal/' + str(disposed.json['id']), token).status_code, 204)
        self.assertEqual(self.call('GET', prefix, token).json['status'], 'idle')
    def test_profile_claims_expiry_bridge_gate_and_restart(self):
        alice, bob = self.login('a'), self.login('b')
        self.assertEqual(self.call('PUT', '/profile', alice['token'], {'username': 'Name', 'avatar_key': 'cat'}).status_code, 200)
        self.assertEqual(self.call('PUT', '/profile', bob['token'], {'username': 'name', 'avatar_key': 'cat'}).status_code, 400)
        self.assertEqual(self.client.get('/api/mp/items').status_code, 403)
        item = self.item(alice['token'])
        self.app = initialize_app(create_app({**self.app.config, 'CLOUDBASE_CLIENT': self.db}))
        self.client = self.app.test_client()
        self.assertEqual(self.call('GET', '/items', alice['token']).json[0]['id'], item['id'])
        import hashlib
        self.db.rows[('palm_wechat_sessions', hashlib.sha256(alice['token'].encode()).hexdigest())]['expires_at'] = 0
        self.assertEqual(self.call('GET', '/items', alice['token']).status_code, 401)
    def test_private_photo_commit_replay_and_gc_after_replacement(self):
        token = self.login('owner')['token']; item = self.item(token); prefix = f"/items/{item['id']}"
        out = io.BytesIO(); Image.new('RGB', (40, 20), 'red').save(out, 'PNG')
        ticket = self.call('POST', prefix + '/photo/uploads', token, {'size_bytes': len(out.getvalue()), 'content_type': 'image/png'}).json
        record = self.db.rows[('palm_photo_uploads', ticket['ticket'])]
        self.storage.objects[record['object_id']] = out.getvalue()
        key = 'photo-commit-request-0001'
        result = self.call('POST', prefix + '/photo/uploads/' + ticket['ticket'] + '/commit', token, {}, key)
        self.assertEqual(result.status_code, 200, result.json)
        self.assertTrue(result.json['photo_version'])
        self.assertEqual(self.call('POST', prefix + '/photo/uploads/' + ticket['ticket'] + '/commit', token, {}, key).json, result.json)
        response = self.call('GET', prefix + '/photo/download?size=thumb', token)
        import base64
        encoded = response.headers['X-Palm-Photo-Transfer']
        info = json.loads(base64.urlsafe_b64decode(encoded + '=' * (-len(encoded) % 4)))
        self.assertNotIn('url', response.json)
        self.assertIn('/palm/photos/', info['url'])
        finals = [p for p in self.storage.objects if p.startswith('palm/photos/')]
        self.assertEqual(len(finals), 2)
        self.assertFalse(any(r['object_id'] in finals for (t, _), r in self.db.rows.items() if t == 'palm_storage_gc'))
        self.assertEqual(self.call('DELETE', prefix + '/photo', token).status_code, 204)
        self.assertEqual(sum(r['object_id'] in finals for (t, _), r in self.db.rows.items() if t == 'palm_storage_gc'), 2)
    def test_trash_expiration_and_large_cascade_is_bounded(self):
        token = self.login('owner')['token']; item = self.item(token); item_id = item['id']
        self.call('DELETE', f'/items/{item_id}', token)
        self.assertEqual(self.call('POST', f'/trash/{item_id}/restore', token).status_code, 200)
        self.call('DELETE', f'/items/{item_id}', token)
        row = self.db.rows[('palm_items', str(item_id))]
        row['deleted_at'] = (datetime.now(timezone.utc) - timedelta(days=31)).isoformat()
        for n in range(125):
            self.db.rows[('palm_maintenance_records', str(n))] = {'_id': str(n), 'id': n, 'user_id': row['user_id'], 'item_id': item_id}
        self.assertEqual(self.call('GET', '/trash', token).json, [])
        self.assertEqual(self.call('POST', f'/trash/{item_id}/restore', token).status_code, 410)
        from palm.cloud_maintenance import run
        with self.app.app_context():
            for _ in range(20): self.assertLessEqual(run(max_operations=12), 12)
        self.assertNotIn(('palm_items', str(item_id)), self.db.rows)
        self.assertFalse(any(t == 'palm_maintenance_records' for t, _ in self.db.rows))
        self.assertEqual(self.call('POST', f'/trash/{item_id}/restore', token).status_code, 410)
    def test_paginated_owned_listing_keeps_integer_amounts(self):
        token = self.login('owner')['token']; item = self.item(token)
        original = copy.deepcopy(self.db.rows[('palm_items', str(item['id']))])
        for n in range(2, 206): self.db.rows[('palm_items', str(n))] = {**original, 'id': n, '_id': str(n)}
        rows = self.call('GET', '/items', token).json
        self.assertEqual(len(rows), 205)
        self.assertEqual(rows[0]['id'], 205)
        self.assertEqual(rows[-1]['purchase_price'], '1200.01')

    def test_photo_gc_failure_retries_without_blocking_other_cleanup(self):
        from palm.cloud_maintenance import run
        instant = datetime.now(timezone.utc)
        epoch = int(instant.timestamp())
        for key in ('a-failed', 'b-success'):
            self.db.rows[('palm_storage_gc', key)] = {
                '_id': key, 'object_id': 'palm/staging/' + key, 'due_at': epoch,
            }
            self.storage.objects['palm/staging/' + key] = b'image'
        self.db.rows[('palm_wechat_sessions', 'expired')] = {'_id': 'expired', 'expires_at': epoch - 1}
        original = self.storage.delete
        def fail_one(path):
            if path.endswith('a-failed'): raise CloudBaseError(503, 'STORAGE_NETWORK_ERROR', 'gc-request')
            original(path)
        with self.app.app_context(), patch.object(self.storage, 'delete', side_effect=fail_one):
            with self.assertLogs(self.app.logger, level='WARNING') as logs:
                self.assertEqual(run(now=instant), 3)
            self.assertNotIn('palm/staging/', '\n'.join(logs.output))
            retained = self.db.rows[('palm_storage_gc', 'a-failed')]
            self.assertEqual(retained['attempts'], 1)
            self.assertEqual(retained['due_at'], epoch + 300)
            self.assertEqual(retained['last_error_code'], 'STORAGE_NETWORK_ERROR')
            self.assertNotIn(('palm_storage_gc', 'b-success'), self.db.rows)
            self.assertNotIn(('palm_wechat_sessions', 'expired'), self.db.rows)
            self.assertEqual(run(now=instant), 0)
            with self.assertLogs(self.app.logger, level='WARNING'):
                self.assertEqual(run(now=instant + timedelta(seconds=300), max_operations=1), 1)
            self.assertEqual(retained['attempts'], 2)
            self.assertEqual(retained['due_at'], epoch + 900)
        with self.app.app_context():
            self.assertEqual(run(now=instant + timedelta(seconds=900)), 1)
        self.assertNotIn(('palm_storage_gc', 'a-failed'), self.db.rows)
        self.assertNotIn('palm/staging/a-failed', self.storage.objects)

    def test_uncertain_commit_replays_the_committed_receipt(self):
        token = self.login('owner')['token']
        original = self.db.finish_transaction
        lose_response = [True]
        def uncertain(key, commit=False):
            original(key, commit)
            if commit and lose_response[0]:
                lose_response[0] = False
                raise CloudBaseError(0, 'NETWORK_ERROR')
        with patch.object(self.db, 'finish_transaction', side_effect=uncertain):
            failed = self.call('POST', '/items', token, {'name': 'Camera', 'purchase_date': '2025-01-01',
                'purchase_price': '1.01', 'status': 'active', 'icon_type': 'other', 'category': 'Digital', 'notes': ''}, 'uncertain-commit-0001')
        self.assertEqual(failed.status_code, 503)
        replay = self.call('POST', '/items', token, {'name': 'Camera', 'purchase_date': '2025-01-01',
                'purchase_price': '1.01', 'status': 'active', 'icon_type': 'other', 'category': 'Digital', 'notes': ''}, 'uncertain-commit-0001')
        self.assertEqual(replay.status_code, 201, replay.json)
        self.assertEqual(len(self.call('GET', '/items', token).json), 1)

    def test_concurrent_first_login_only_commits_one_identity(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        original = self.db.start_transaction
        barrier = Barrier(2)
        def simultaneous():
            key = original(); barrier.wait(timeout=5); return key
        def login_once(_):
            with self.app.test_client() as client:
                return client.post('/api/mp/auth/login', headers={'X-Palm-Bridge': 'b' * 48}, json={'code': 'same-person'})
        with patch.object(self.db, 'start_transaction', side_effect=simultaneous):
            with ThreadPoolExecutor(max_workers=2) as pool: replies = list(pool.map(login_once, range(2)))
        self.assertEqual(sorted(r.status_code for r in replies), [200, 409])
        owner = self.login('same-person')['user']['id']
        self.assertEqual(len([r for (t, _), r in self.db.rows.items() if t == 'palm_users']), 1)
        self.assertTrue(all(r['user_id'] == owner for (t, _), r in self.db.rows.items() if t == 'palm_wechat_identities'))

    def test_expired_invalid_and_foreign_photo_tickets_never_attach_files(self):
        owner, other = self.login('owner')['token'], self.login('other')['token']
        item = self.item(owner); prefix = f"/items/{item['id']}"
        ticket = self.call('POST', prefix + '/photo/uploads', owner, {'size_bytes': 14, 'content_type': 'image/png'}).json
        row = self.db.rows[('palm_photo_uploads', ticket['ticket'])]
        commit = prefix + '/photo/uploads/' + ticket['ticket'] + '/commit'
        self.storage.objects[row['object_id']] = b'<svg>bad</svg>'
        self.assertEqual(self.call('POST', commit, other, {}).status_code, 404)
        self.assertEqual(self.call('POST', commit, owner, {}).status_code, 400)
        row['expires_at'] = 0
        self.assertEqual(self.call('POST', commit, owner, {}).status_code, 410)
        self.assertFalse(self.call('GET', prefix, owner).json['photo_url'])

if __name__ == '__main__': unittest.main()
