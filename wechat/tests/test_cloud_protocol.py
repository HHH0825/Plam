"""Test production wire pagination, integer cents, transaction IDs and photo TTL."""
import io
import json
import sys
import unittest
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from palm.cloud_client import Configuration, DocumentClient, CloudBaseError
from palm.cloud_storage import validate_upload_lifetime, Storage


class Reply(io.BytesIO):
    status = 200
    headers = {}
    def __init__(self, body): super().__init__(json.dumps(body).encode())


class CloudProtocolTest(unittest.TestCase):
    def test_download_signature_must_cover_exact_private_object_and_both_five_minute_bounds(self):
        from unittest.mock import patch
        store = Storage(Configuration('cloud1-test', 'test-key'), 'test-bucket', 'test.cos.ap-shanghai.myqcloud.com')
        path = 'palm/photos/' + 'a' * 32 + '.jpg'
        base = 'https://test.cos.ap-shanghai.myqcloud.com/' + path
        valid = base + '?q-sign-algorithm=sha1&q-signature=' + 'a' * 40 + '&q-sign-time=1000;1300&q-key-time=1000;1300'
        with patch('palm.cloud_storage.time.time', return_value=1000), patch.object(store, 'api', return_value=[{'downloadUrl': valid}]):
            self.assertEqual(store.download_ticket(path)['expires_at'], 1300)
        for url in (base, valid.replace('1300', '4600'), valid.replace('1000;1300', '0;1300'),
                    valid.replace('myqcloud.com', 'evil.example'), valid.replace(path, 'palm/photos/wrong.jpg'),
                    valid.replace('q-key-time=1000;1300', 'q-key-time=1000;4600'),
                    valid + '&q-sign-time=1000;1300'):
            with self.subTest(url=url), patch('palm.cloud_storage.time.time', return_value=1000), patch.object(store, 'api', return_value=[{'downloadUrl': url}]), self.assertRaises(CloudBaseError):
                store.download_ticket(path)
    def test_three_wire_pages_keep_owner_and_transaction_and_integer_cents(self):
        requests = []
        class Service:
            def open(self, request, timeout):
                query = parse_qs(urlsplit(request.full_url).query)
                requests.append(query)
                count = 100 if len(requests) < 3 else 5
                start = (len(requests) - 1) * 100
                return Reply({'list': [{'_id': str(n).zfill(5), 'price_cents': {'$numberLong': '120001'}}
                                       for n in range(start, start + count)]})
        client = DocumentClient(Configuration('cloud1-test', 'test-key'), opener=Service())
        result = client.query('palm_items', {'user_id': 7}, transaction_id='tx1')
        self.assertEqual(len(result), 205)
        self.assertTrue(all(r['price_cents'] == 120001 for r in result))
        for query in requests:
            self.assertEqual(query['transactionId'], ['tx1'])
            self.assertEqual(json.loads(query['order'][0]), [{'field': '_id', 'direction': 'asc'}])
        self.assertEqual(json.loads(requests[0]['query'][0]), {'user_id': {'$numberLong': '7'}})
        self.assertEqual(json.loads(requests[1]['query'][0]), {'$and': [
            {'user_id': {'$numberLong': '7'}}, {'_id': {'$gt': '00099'}}]})

    def test_upload_credentials_must_expire_within_ten_minutes(self):
        now = 1000
        def info(value): return {'headers': {'Authorization': value}}
        self.assertEqual(validate_upload_lifetime(info('q-sign-time=1000;1600'), now), 1600)
        for value in ('', 'q-sign-time=1000;4600', 'q-sign-time=0;1500',
                      'q-sign-time=1000;999', 'q-sign-time=bad', 'q-sign-time=1007;1600'):
            with self.subTest(value=value), self.assertRaises(CloudBaseError):
                validate_upload_lifetime(info(value), now)

if __name__ == '__main__': unittest.main()
