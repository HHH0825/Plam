"""Account-level book ordering stays atomic and compatible on both providers."""
import unittest
from unittest.mock import patch
from flask import g
from test_purchases import PurchasesContract
from test_membership import MemberContract


class OrderContract:
    setUp = PurchasesContract.setUp
    send = PurchasesContract.send
    grant = MemberContract.grant

    def create_book(self, name, **extra):
        r = self.send('POST', '/member/books', {'name': name, **extra})
        self.assertEqual(r.status_code, 201, r.json)
        return r.json

    def order(self):
        r = self.send('GET', '/member/books').json
        return [b['id'] for b in r['books'] if not b['archived']], r['order_revision']

    def save_order(self, ids, revision, **extra):
        return self.send('PUT', '/member/books/order', {'book_ids': ids}, revision=revision, **extra)

    def test_default_moves_new_book_and_restored_book_append(self):
        self.grant()
        a, b = self.create_book('旅行'), self.create_book('家居')
        ids, rev = self.order()
        self.assertEqual(ids, ['default', a['id'], b['id']])
        ids = [b['id'], a['id'], 'default']
        self.assertEqual(self.save_order(ids, rev).status_code, 200)
        c = self.create_book('新建', order=-99999)
        self.assertEqual(self.order()[0], ids + [c['id']])
        self.send('PUT', '/member/books/' + a['id'], {**a, 'archived': True}, revision=a['revision'])
        self.assertEqual(self.order()[0], [b['id'], 'default', c['id']])
        self.send('PUT', '/member/books/' + a['id'], {**a, 'archived': False}, revision=a['revision'] + 1)
        self.assertEqual(self.order()[0], [b['id'], 'default', c['id'], a['id']])
        self.assertEqual(self.send('DELETE', '/member/books/default', revision=0).status_code, 400)

    def test_replay_stale_revision_and_concurrent_create_do_not_overwrite(self):
        self.grant(); a = self.create_book('A'); ids, rev = self.order()
        key = 'book-order-replay-0001'
        r = self.save_order(ids[::-1], rev, key=key)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.save_order(ids[::-1], rev, key=key).json, r.json)
        self.assertEqual(self.order()[1], r.json['order_revision'])
        self.assertEqual(self.save_order(ids, rev).status_code, 409)
        latest = self.order(); b = self.create_book('B')
        self.assertEqual(self.save_order(latest[0], latest[1]).status_code, 409)
        self.assertEqual(self.order()[0], [a['id'], 'default', b['id']])

    def test_invalid_ids_archives_and_foreign_accounts_fail_without_writes(self):
        self.grant(); a = self.create_book('A'); ids, rev = self.order()
        for invalid in [[], ['default'], ['default', 'default'], ['default', 'foreign'], [1, a['id']], 'default']:
            self.assertEqual(self.save_order(invalid, rev).status_code, 400)
            self.assertEqual(self.order(), (ids, rev))
        self.assertEqual(self.save_order(ids, rev, token=self.bob).status_code, 409)
        self.send('PUT', '/member/books/' + a['id'], {**a, 'archived': True}, revision=0)
        self.assertEqual(self.save_order(ids, self.order()[1]).status_code, 400)

    def test_free_and_expired_can_reorder_without_paid_membership(self):
        self.assertEqual(self.save_order(['default'], 0).status_code, 200)
        self.grant(); a = self.create_book('A'); ids, rev = self.order(); self.grant('expired')
        self.assertEqual(self.save_order(ids[::-1], rev).status_code, 200)
        self.assertEqual(self.order()[0], ids[::-1])

    def test_create_failure_rolls_back_both_book_and_order(self):
        self.grant(); original = self.order()
        with patch('palm.membership.save_book_order', side_effect=RuntimeError('isolated failure')):
            with self.assertRaises(RuntimeError):
                self.send('POST', '/member/books', {'name': 'should rollback'})
        self.assertEqual(self.order(), original)

    def test_deletion_bumps_list_version_and_keeps_other_ids(self):
        self.grant(); a, b = self.create_book('A'), self.create_book('B'); ids, rev = self.order()
        self.assertEqual(self.send('DELETE', '/member/books/' + a['id'], revision=0).status_code, 204)
        self.assertEqual(self.order()[0], ['default', b['id']])
        self.assertGreater(self.order()[1], rev)
        self.assertEqual(self.save_order(ids[::-1], rev).status_code, 409)

    def test_simultaneous_sort_requests_cannot_both_commit(self):
        self.grant(); self.create_book('A'); self.create_book('B'); ids, rev = self.order()
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        barrier = Barrier(2)
        def update(index):
            barrier.wait(timeout=5)
            target = ids[::-1] if index == 0 else [ids[1], ids[0], ids[2]]
            return self.save_order(target, rev, key='parallel-sort-request-' + str(index), client=self.app.test_client())
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(update, (0, 1)))
        self.assertEqual(sorted(r.status_code for r in responses), [200, 409])
        self.assertEqual(self.order()[1], rev + 1)

    def test_legacy_order_is_read_without_migration_and_old_sticker_is_preserved(self):
        self.grant(); a = self.create_book('A', cover='home', sticker='cat', order=-5)
        user = self.send('GET', '/auth/me').json['user']['id']
        from palm.membership import delete, get
        from palm.database import get_db
        with self.app.app_context():
            g.user_id = user
            if self.cloud:
                from palm.cloud_runtime import begin
                begin()
            delete('book_order', 'current')
            if self.cloud:
                self.db.finish_transaction(g.pop('cloud_tx'), commit=True)
            else:
                get_db().commit()
        self.assertEqual(self.order(), (['default', a['id']], 0))
        with self.app.app_context():
            g.user_id = user
            self.assertIsNone(get('book_order', 'current'))
        updated = self.send('PUT', '/member/books/' + a['id'], {'name': '改名', 'cover': 'travel'}, revision=0)
        self.assertEqual(updated.json['sticker'], 'cat')
        self.assertEqual(self.save_order([a['id'], 'default'], 0).status_code, 200)


class SQLiteBookOrderTest(OrderContract, unittest.TestCase):
    cloud = False


class CloudBookOrderTest(OrderContract, unittest.TestCase):
    cloud = True
