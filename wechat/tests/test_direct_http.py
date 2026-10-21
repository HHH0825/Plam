"""Direct HTTP uses server-verified identities and the existing business sessions."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import test_cloud_backend as fixtures
from palm import create_app


class DirectHTTPTest(fixtures.CloudBackendTest):
    def setUp(self):
        super().setUp()
        self.app.config['REQUEST_MODE'] = 'direct_http'
        # Existing lifecycle assertions exercise the decoded interface returned to pages.
        self.app.after_request_funcs[None].remove(__import__('palm.cloud_runtime', fromlist=['direct_envelope']).direct_envelope)

    def call(self, method, path, token=None, data=None, key=None):
        self.requests += 1
        headers = {'Idempotency-Key': key or 'direct-request-' + str(self.requests).zfill(12),
                   'X-WX-OPENID': 'forged-other-owner', 'X-Palm-Bridge': 'untrusted-client-value'}
        if token: headers['Authorization'] = 'Bearer ' + token
        headers.update(self.version_headers(method, path, headers['Idempotency-Key']))
        return self.client.open('/api/mp' + path, method=method, headers=headers, json=data)

    # The parent test explicitly checks the bridge gate, so replace only that case.
    def test_profile_claims_expiry_bridge_gate_and_restart(self):
        alice, bob = self.login('a'), self.login('b')
        self.assertNotEqual(alice['user']['id'], bob['user']['id'])
        item = self.item(alice['token'])
        self.assertEqual(self.call('GET', '/items/' + str(item['id']), bob['token']).status_code, 404)
        self.assertEqual(self.client.get('/api/mp/items', headers={'X-WX-OPENID': 'a'}).status_code, 401)
        self.assertEqual(self.call('PUT', '/profile', alice['token'], {'username': 'Name', 'avatar_key': 'cat'}).status_code, 200)
        self.assertEqual(self.call('PUT', '/profile', bob['token'], {'username': 'name', 'avatar_key': 'cat'}).status_code, 400)

    def test_login_body_limit_and_development_login_rejected(self):
        oversized = self.client.post('/api/mp/auth/login', json={'code': 'x' * 65536})
        self.assertEqual(oversized.status_code, 413)
        self.assertFalse(self.db.rows)
        self.assertEqual(self.client.post('/api/mp/auth/login', data='code=a', content_type='text/plain').status_code, 415)
        self.app.config.pop('WECHAT_CODE_EXCHANGER')
        self.assertEqual(self.client.post('/api/mp/auth/login', json={'code': 'dev:student'}).status_code, 400)
        self.assertFalse(self.db.rows)

    def test_invalid_mode_fails_and_direct_needs_no_bridge_secret(self):
        with self.assertRaises(ValueError): create_app({'REQUEST_MODE': 'typo'})
        app = create_app({'STORAGE_BACKEND': 'cloudbase', 'REQUEST_MODE': 'direct_http',
                          'DEV_LOGIN': False, 'BRIDGE_SECRET': '', 'CLOUDBASE_CLIENT': self.db})
        response = app.test_client().get('/api/mp/items')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['statusCode'], 401)

    def test_photo_signing_is_owned_and_fails_closed(self):
        from unittest.mock import patch
        from palm.cloud_client import CloudBaseError
        token = self.login('a')['token']; other = self.login('b')['token']
        item = self.item(token)
        row = self.db.rows[('palm_items', str(item['id']))]
        row['photo_key'] = 'a' * 32 + '.jpg'
        path = '/items/' + str(item['id']) + '/photo/download'
        with patch.object(self.storage, 'download_ticket', create=True, side_effect=CloudBaseError(200, 'PHOTO_DOWNLOAD_TTL_UNVERIFIED')) as sign:
            self.assertEqual(self.call('GET', path, other).status_code, 404)
            sign.assert_not_called()
            self.assertEqual(self.call('GET', path, token).status_code, 503)
        with patch.object(self.storage, 'download_ticket', create=True, return_value={'url': 'https://test.invalid/private', 'expires_at': 1300, 'max_age': 300}):
            response = self.call('GET', path, token)
            self.assertNotIn('url', response.json)
            self.assertIn('X-Palm-Photo-Transfer', response.headers)

    def test_wire_envelope_preserves_error_status_and_receipt_commit(self):
        from palm.cloud_runtime import direct_envelope
        self.app.after_request_funcs[None].insert(0, direct_envelope)
        denied = self.client.get('/api/mp/items')
        self.assertEqual(denied.status_code, 200)
        self.assertEqual(denied.json['statusCode'], 401)
        self.assertEqual(self.client.get('/healthz').json, {'ok': True})
        login = self.client.post('/api/mp/auth/login', json={'code': 'wire'})
        token = login.headers['X-Palm-Session']
        self.assertNotIn('token', login.json['data'])
        self.assertNotIn(token, login.get_data(as_text=True))
        headers = {'Authorization': 'Bearer ' + token, 'Idempotency-Key': 'wire-envelope-item-0001'}
        data = {'name': 'Camera', 'purchase_date': '2025-01-01', 'purchase_price': '1.01', 'status': 'active', 'icon_type': 'other', 'category': 'Digital', 'notes': ''}
        first = self.client.post('/api/mp/items', headers=headers, json=data)
        replay = self.client.post('/api/mp/items', headers=headers, json=data)
        self.assertEqual(first.json['statusCode'], 201)
        self.assertEqual(first.json, replay.json)
        self.assertEqual(len([v for (t, _), v in self.db.rows.items() if t == 'palm_items']), 1)


if __name__ == '__main__': unittest.main()
