"""Storage locations exercise both real SQLite and transactional CloudBase adapter."""
import unittest
import sqlite3
from pathlib import Path
from contextlib import closing
from unittest.mock import patch
from test_purchases import PurchasesContract
from palm.cloud_client import CloudBaseError


class LocationContract:
    cloud = False
    setUp = PurchasesContract.setUp
    send = PurchasesContract.send
    item = PurchasesContract.item
    wish = PurchasesContract.wish

    def location(self, name='书桌抽屉'):
        r = self.send('POST', '/storage-locations', {'name': name})
        self.assertEqual(r.status_code, 201, r.json)
        return r.json

    def assign(self, items, location=None, **kwargs):
        return self.send('POST', '/storage-locations/assign', {
            'storage_location_id': location['id'] if location else None,
            'items': [{'id': i['id'], 'revision': i['revision']} for i in items]}, **kwargs)

    def latest(self, item):
        return self.send('GET', '/items/' + str(item['id'])).json

    def test_validation_duplicate_and_namespace_isolation(self):
        for name in ['', '  ', '字' * 41]:
            self.assertEqual(self.send('POST', '/storage-locations', {'name': name}).status_code, 400)
        location = self.location(' 书桌抽屉 ')
        self.assertEqual(location['name'], '书桌抽屉')
        self.assertEqual(self.send('POST', '/storage-locations', {'name': '书桌抽屉'}).status_code, 409)
        self.assertEqual(self.send('GET', '/storage-locations', token=self.bob).json['locations'], [])
        self.assertEqual(self.send('PUT', '/storage-locations/' + str(location['id']), {'name': '偷改'}, revision=0, token=self.bob).status_code, 404)
        self.assertEqual(self.send('POST', '/storage-locations', {'name': '书桌抽屉'}, token=self.bob).status_code, 201)

    def test_batch_move_clear_and_cost_unchanged(self):
        a, b, target = self.item(), self.item('水杯'), self.location()
        moved = self.assign([a, b], target)
        self.assertEqual(moved.status_code, 200, moved.json)
        latest = self.latest(a)
        self.assertEqual(latest['storage_location_name'], target['name'])
        for field in ['net_cost', 'daily_net_cost', 'purchase_price', 'maintenance_total']:
            self.assertEqual(latest[field], a[field])
        result = self.send('GET', '/storage-locations').json
        self.assertEqual(result['locations'][0]['count'], 2)
        self.assertEqual(result['unassigned_count'], 0)
        self.assertEqual(self.assign([latest]).status_code, 200)
        self.assertIsNone(self.latest(a)['storage_location_id'])

    def test_batch_stale_or_foreign_item_rolls_back_all(self):
        a, b, target = self.item(), self.item('手机'), self.location()
        self.assertEqual(self.assign([b], target).status_code, 200)
        response = self.assign([a, b], target)
        self.assertEqual(response.status_code, 409)
        self.assertIsNone(self.latest(a)['storage_location_id'])
        foreign = self.send('POST', '/items', {'name':'别人的','category':'数码','purchase_date':'2025-01-01','purchase_price':'1'}, token=self.bob).json
        self.assertEqual(self.assign([a, foreign], target).status_code, 404)
        self.assertIsNone(self.latest(a)['storage_location_id'])

    def test_replay_and_bounds(self):
        item, target = self.item(), self.location()
        first = self.assign([item], target, key='location-replay-00001')
        second = self.assign([item], target, key='location-replay-00001')
        self.assertEqual(first.json, second.json)
        self.assertEqual(self.latest(item)['revision'], 1)
        for entries in [[], [{'id': item['id'], 'revision': 1}] * 51,
                        [{'id': item['id'], 'revision': 1}] * 2,
                        [{'id': True, 'revision': 1}], [{'id': item['id'], 'revision': True}]]:
            self.assertEqual(self.send('POST', '/storage-locations/assign', {'storage_location_id': None, 'items': entries}).status_code, 400)
        self.assertEqual(self.send('POST', '/storage-locations/assign', {'items': [{'id': item['id'], 'revision': 1}]}).status_code, 400)

    def test_rename_delete_resolves_stale_links(self):
        item, target = self.item(), self.location()
        self.assign([item], target)
        renamed = self.send('PUT', '/storage-locations/' + str(target['id']), {'name': '衣柜上层'}, revision=target['revision'])
        self.assertEqual(renamed.status_code, 200, renamed.json)
        self.assertEqual(self.latest(item)['storage_location_name'], '衣柜上层')
        self.assertEqual(self.send('DELETE', '/storage-locations/' + str(target['id']), revision=0).status_code, 409)
        self.assertEqual(self.send('DELETE', '/storage-locations/' + str(target['id']), revision=renamed.json['revision']).status_code, 200)
        self.assertIsNone(self.latest(item)['storage_location_id'])
        self.assertEqual(self.send('GET', '/storage-locations').json['unassigned_count'], 1)
        self.assertEqual(self.assign([self.latest(item)], target).status_code, 409)

    def test_legacy_edit_preserves_and_explicit_null_clears(self):
        target = self.location()
        payload = {'name':'耳机','category':'数码','purchase_date':'2025-01-01','purchase_price':'100','status':'active','storage_location_id':target['id']}
        created = self.send('POST', '/items', payload).json
        legacy = {k:v for k,v in payload.items() if k != 'storage_location_id'}
        response = self.send('PUT', '/items/' + str(created['id']), legacy, revision=created['revision'])
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json['storage_location_id'], target['id'])
        cleared = self.send('PUT', '/items/' + str(created['id']), {**legacy,'storage_location_id':None}, revision=response.json['revision'])
        self.assertIsNone(cleared.json['storage_location_id'])
        wish = self.wish()
        converted = self.send('POST', '/wishlist/' + str(wish['id']) + '/convert', payload, revision=wish['revision'])
        self.assertEqual(converted.status_code, 201, converted.json)
        self.assertEqual(converted.json['storage_location_id'], target['id'])

    def test_trash_restore_disposal_and_deleted_target(self):
        item, target = self.item(), self.location()
        self.assign([item], target)
        item = self.latest(item)
        self.send('DELETE', '/items/' + str(item['id']), revision=item['revision'])
        self.assertEqual(self.send('GET', '/storage-locations').json['locations'][0]['count'], 0)
        if self.cloud:
            item['revision'] = self.db.get('palm_items', item['id'])['revision']
        restored = self.send('POST', '/trash/' + str(item['id']) + '/restore', {}, revision=item['revision'])
        self.assertEqual(restored.status_code, 200, restored.json)
        item = self.latest(item)
        self.assertEqual(item['storage_location_id'], target['id'])
        disposed = self.send('POST', '/items/' + str(item['id']) + '/disposal', {'disposed_on':'2025-02-01','method':'sold','proceeds':'10'}, revision=item['revision'])
        self.assertEqual(disposed.status_code, 201, disposed.json)
        self.assertEqual(self.send('GET', '/storage-locations').json['locations'][0]['count'], 0)
        item = self.latest(item)
        self.assertEqual(item['storage_location_name'], target['name'])
        self.assertEqual(self.assign([item]).status_code, 409)


class SQLiteLocationsTest(LocationContract, unittest.TestCase):
    def test_version_ten_upgrade_preserves_items_and_creates_a_pre_location_backup(self):
        item = self.item('旧版物品', '88.88')
        path = Path(self.app.config['DATABASE'])
        with closing(sqlite3.connect(path)) as db:
            db.execute('DROP INDEX idx_items_location')
            db.execute('ALTER TABLE items DROP COLUMN storage_location_id')
            db.execute('ALTER TABLE items DROP COLUMN revision')
            db.execute('DROP TABLE storage_locations')
            db.execute('PRAGMA user_version=10')
            db.commit()
        from palm import initialize_app
        initialize_app(self.app)
        upgraded = self.latest(item)
        self.assertEqual(upgraded['name'], item['name'])
        self.assertEqual(upgraded['purchase_price'], '88.88')
        self.assertEqual(upgraded['revision'], 0)
        self.assertIsNone(upgraded['storage_location_id'])
        with closing(sqlite3.connect(path)) as db:
            self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0], 15)
        with closing(sqlite3.connect(str(path) + '.pre-locations.bak')) as backup:
            self.assertEqual(backup.execute('PRAGMA user_version').fetchone()[0], 10)
            self.assertEqual(backup.execute('SELECT name FROM items WHERE id=?', (item['id'],)).fetchone()[0], '旧版物品')


class CloudLocationsTest(LocationContract, unittest.TestCase):
    cloud = True

    def test_commit_failure_rolls_back_moves_and_retry_is_safe(self):
        a, b, target = self.item(), self.item('手机'), self.location()
        finish = self.db.finish_transaction
        def fail(key, commit=False):
            if commit:
                finish(key, False)
                raise CloudBaseError(503, 'INJECTED_FAILURE')
            return finish(key, commit)
        with patch.object(self.db, 'finish_transaction', side_effect=fail):
            self.assertEqual(self.assign([a,b], target, key='location-fail-000001').status_code, 503)
        self.assertIsNone(self.latest(a)['storage_location_id'])
        self.assertIsNone(self.latest(b)['storage_location_id'])
        self.assertEqual(self.assign([a,b], target, key='location-fail-000001').status_code, 200)


if __name__ == '__main__':
    unittest.main()
