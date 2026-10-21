"""Reward/capacity contracts run against SQLite and transactional CloudBase."""
import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
from flask import g
from test_purchases import PurchasesContract
from test_membership import MemberContract
from palm.database import get_db
from palm import rewards


class RewardsContract:
    cloud = False
    setUp = PurchasesContract.setUp
    send = PurchasesContract.send
    item = PurchasesContract.item
    grant = MemberContract.grant

    def at(self, value):
        return patch('palm.rewards.clock', return_value=datetime.fromisoformat(value).replace(tzinfo=timezone(timedelta(hours=8))))

    def seed(self, **values):
        user = self.send('GET', '/auth/me').json['user']['id']
        with self.app.app_context():
            g.user_id = user
            if self.cloud:
                from palm.cloud_runtime import begin
                begin()
            rewards.write('wallet', {**rewards.wallet(), **values})
            if self.cloud:
                self.db.finish_transaction(g.pop('cloud_tx'), commit=True)
            else:
                get_db().commit()

    def test_week_rewards_reset_without_losing_balance_or_slots(self):
        with self.at('2026-10-12T10:00:00'):
            r = self.send('POST', '/rewards/checkin', {'date': '2026-10-12'}, key='checkin-same-key-0001')
            self.assertEqual(r.status_code, 200, r.json)
            self.assertEqual(r.json['balance'], 5)
            self.assertEqual(self.send('POST', '/rewards/checkin', {'date': '2026-10-12'}, key='checkin-same-key-0001').json, r.json)
            again = self.send('POST', '/rewards/checkin', {'date': '2026-10-12'})
            self.assertTrue(again.json['already_claimed'])
            self.assertEqual(again.json['balance'], 5)
            self.assertEqual(self.send('GET', '/rewards', token=self.bob).json['balance'], 0)
            self.assertEqual(self.send('POST', '/rewards/checkin', {'date': '2026-10-11'}).status_code, 400)
        for date in range(13, 19):
            with self.at(f'2026-10-{date}T23:59:59'):
                r = self.send('POST', '/rewards/checkin', {'date': f'2026-10-{date}'})
                self.assertEqual(r.status_code, 200, r.json)
        self.assertEqual(r.json['balance'], 50)
        with self.at('2026-10-19T00:00:00'):
            r = self.send('GET', '/rewards').json
            self.assertEqual(r['balance'], 50)
            self.assertFalse(any(d['claimed'] for d in r['checkin']['days']))

    def test_capacity_twenty_restore_delete_disposed_and_member_expiry(self):
        items = [self.item() for _ in range(20)]
        form = {'name': '超额', 'category': '其他', 'purchase_date': '2025-01-01', 'purchase_price': '0'}
        denied = self.send('POST', '/items', form)
        self.assertEqual(denied.status_code, 409, denied.json)
        self.assertEqual(denied.json['code'], 'ITEM_CAPACITY_REACHED')
        self.assertEqual(denied.json['capacity']['used'], 20)
        first = items[0]
        deleted = self.send('DELETE', f"/items/{first['id']}", revision=first['revision'])
        self.assertEqual(deleted.status_code, 204, deleted.json)
        self.item()
        trashed = self.send('GET', '/trash').json[0]
        denied = self.send('POST', f"/trash/{first['id']}/restore", {}, revision=trashed['revision'])
        self.assertEqual(denied.status_code, 409, denied.json)
        self.grant()
        self.assertIn('unlimited_items', self.send('GET', '/membership').json['entitlements'])
        restored = self.send('POST', f"/trash/{first['id']}/restore", {}, revision=trashed['revision'])
        self.assertEqual(restored.status_code, 200, restored.json)
        self.assertEqual(self.send('GET', '/rewards').json['capacity']['used'], 21)
        self.grant('expired')
        self.assertEqual(self.send('POST', '/items', form).status_code, 409)
        self.assertEqual(len(self.send('GET', '/items').json), 21)
        form = {k:v for k,v in restored.json.items() if k != 'payment_info'}
        edited = self.send('PUT', f"/items/{first['id']}", {**form, 'notes': '超额仍可编辑'}, revision=restored.json['revision'])
        self.assertEqual(edited.status_code, 200, edited.json)

    def test_redemption_cost_boundaries_stale_double_submit_and_limit(self):
        for extra, cost in [(0,60),(4,60),(5,100),(19,100),(20,160),(49,160),(50,200),(99,200),(100,260),(199,260)]:
            self.seed(balance=1000, extra_slots=extra)
            data = {'expected_extra': extra, 'expected_price': cost}
            key = f'redemption-repeat-{extra:04d}'
            first = self.send('POST', '/rewards/redeem', data, key=key)
            self.assertEqual(first.status_code, 200, first.json)
            self.assertEqual(first.json['balance'], 1000-cost)
            self.assertEqual(first.json['capacity']['extra'], extra+1)
            self.assertEqual(self.send('POST', '/rewards/redeem', data, key=key).json, first.json)
            self.assertEqual(self.send('POST', '/rewards/redeem', data).status_code, 400)
        capped = self.send('GET', '/rewards').json
        self.assertEqual(capped['capacity']['free_limit'], 220)
        self.assertIsNone(capped['shop']['next_price'])
        self.assertEqual(self.send('POST', '/rewards/redeem', {'expected_extra':200,'expected_price':260}).status_code, 400)
        self.seed(balance=59, extra_slots=0)
        self.assertEqual(self.send('POST', '/rewards/redeem', {'expected_extra':0,'expected_price':60}).status_code, 400)
        self.assertEqual(self.send('GET', '/rewards').json['balance'], 59)

    def test_new_user_invite_reward_once_only_after_successful_first_item(self):
        invite = self.send('POST', '/rewards/invitation', {}).json
        self.assertEqual(invite, self.send('POST', '/rewards/invitation', {}).json)
        new = self.send('POST', '/auth/login', {'code': 'invited-new', 'invite_code': invite['code']}, anonymous=True).json
        old = self.token
        self.token = new['token']
        self.assertEqual(self.send('POST', '/items', {'name': ''}).status_code, 400)
        failed=self.send('POST','/items',{'name':'事务回滚','category':'其他','purchase_date':'2025-01-01','purchase_price':'0','payment_info':{'mode':'invalid'}})
        self.assertEqual(failed.status_code,400,failed.json)
        self.assertEqual(self.send('GET','/items').json,[])
        self.assertEqual(self.send('GET', '/rewards', token=old).json['balance'], 0)
        self.item()
        self.assertEqual(self.send('GET', '/rewards', token=old).json['balance'], 100)
        self.item()
        self.assertEqual(self.send('GET', '/rewards', token=old).json['balance'], 100)
        self.send('POST', '/auth/login', {'code': 'bob', 'invite_code': invite['code']}, anonymous=True)
        self.token = self.bob
        self.item()
        self.assertEqual(self.send('GET', '/rewards', token=old).json['balance'], 100)

    def test_history_exposes_only_the_owners_reward_records(self):
        with self.at('2026-10-17T10:00:00'):
            self.send('POST','/rewards/checkin',{'date':'2026-10-17'})
        self.assertEqual(self.send('GET','/rewards/transactions',token=self.bob).json['transactions'],[])
        rows=self.send('GET','/rewards/transactions').json['transactions']
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['amount'],5)

    def test_greeting_daily_server_state_account_isolation_and_periods(self):
        with self.at('2026-10-17T19:00:00'):
            data = {'date': '2026-10-17'}
            first = self.send('POST', '/rewards/greeting', data, key='greeting-repeat-0001')
            self.assertTrue(first.json['show'])
            self.assertEqual(first.json['greeting']['period'], 'evening')
            self.assertEqual(self.send('POST', '/rewards/greeting', data, key='greeting-repeat-0001').json, first.json)
            self.assertFalse(self.send('POST', '/rewards/greeting', data).json['show'])
            self.assertTrue(self.send('POST', '/rewards/greeting', data, token=self.bob).json['show'])
            self.assertEqual(self.send('GET', '/rewards', anonymous=True).status_code, 401)
        for hour, period in [(1,'late'),(6,'morning'),(12,'noon'),(15,'afternoon'),(20,'evening')]:
            with self.at(f'2026-10-18T{hour:02}:00:00'):
                self.assertEqual(self.send('GET', '/rewards').json['greeting']['period'], period)

    def test_navigation_before_delivery_can_release_only_its_own_greeting(self):
        with self.at('2026-10-17T19:00:00'):
            first=self.send('POST','/rewards/greeting',{'date':'2026-10-17'}).json
            wrong={'date':'2026-10-17','not_shown':True,'delivery_token':'wrong'}
            self.send('POST','/rewards/greeting',wrong)
            self.assertFalse(self.send('POST','/rewards/greeting',{'date':'2026-10-17'}).json['show'])
            self.send('POST','/rewards/greeting',{**wrong,'delivery_token':first['delivery_token']})
            self.assertTrue(self.send('POST','/rewards/greeting',{'date':'2026-10-17'}).json['show'])

    def test_permanent_capacity_survives_expiry_and_disposed_archive_counts(self):
        self.seed(balance=120)
        self.send('POST', '/rewards/redeem', {'expected_extra':0,'expected_price':60})
        item = self.item()
        disposed = self.send('POST', f"/items/{item['id']}/disposal", {'disposed_on':'2025-02-01','method':'gifted','proceeds':'0','notes':''}, revision=item['revision'])
        self.assertEqual(disposed.status_code, 201, disposed.json)
        self.grant();self.grant('expired')
        state = self.send('GET', '/rewards').json
        self.assertEqual(state['capacity']['used'], 1)
        self.assertEqual(state['capacity']['free_limit'], 21)
        self.assertEqual(state['balance'], 60)

    def test_simultaneous_item_creation_never_exceeds_limit(self):
        for _ in range(19):
            self.item()
        barrier = Barrier(2)
        original = self.db.finish_transaction
        if self.cloud:
            def finish(key, commit=False):
                if commit:
                    barrier.wait(timeout=10)
                return original(key, commit)
            self.db.finish_transaction = finish
        def create(index):
            with self.app.test_client() as client:
                if not self.cloud:
                    barrier.wait(timeout=10)
                return self.send('POST', '/items', {'name':'并发'+str(index),'category':'其他','purchase_date':'2025-01-01','purchase_price':'0'}, key=f'concurrent-item-{index:04d}', client=client)
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(create, (1,2)))
        finally:
            if self.cloud:
                self.db.finish_transaction = original
        self.assertEqual(sorted(r.status_code for r in results), [201,409])
        self.assertEqual(len(self.send('GET', '/items').json), 20)
        self.assertEqual(self.send('GET', '/rewards').json['capacity']['used'], 20)

    def test_concurrent_checkin_or_redemption_only_changes_wallet_once(self):
        self.seed(balance=120)
        for operation, data in [('checkin', {'date':'2026-10-17'}), ('redeem', {'expected_extra':0,'expected_price':60})]:
            barrier=Barrier(2)
            original=self.db.finish_transaction
            if self.cloud:
                def finish(key, commit=False):
                    if commit: barrier.wait(timeout=10)
                    return original(key,commit)
                self.db.finish_transaction=finish
            def submit(index):
                with self.app.test_client() as client:
                    if not self.cloud: barrier.wait(timeout=10)
                    return self.send('POST','/rewards/'+operation,data,key=f'concurrent-{operation}-{index:04d}',client=client)
            try:
                with self.at('2026-10-17T10:00:00'), ThreadPoolExecutor(max_workers=2) as pool:
                    results=list(pool.map(submit,(1,2)))
            finally:
                if self.cloud:self.db.finish_transaction=original
            self.assertIn(200,[r.status_code for r in results])
        state=self.send('GET','/rewards').json
        self.assertEqual(state['balance'],65)
        self.assertEqual(state['capacity']['extra'],1)


class SQLiteRewardsTest(RewardsContract, unittest.TestCase):
    pass


class CloudRewardsTest(RewardsContract, unittest.TestCase):
    cloud = True

    def test_legacy_count_exhausts_pages_and_does_not_rewrite_item_documents(self):
        original=self.item()
        for n in range(2,206):
            self.db.rows[('palm_items',str(n))]={**self.db.rows[('palm_items',str(original['id']))], 'id':n,'_id':str(n),'status':'disposed' if n%2 else 'idle'}
        owner=self.send('GET','/auth/me').json['user']['id']
        self.db.rows.pop(('palm_member_documents',rewards.doc_key(owner,'wallet','current')))
        self.db.rows.pop(('palm_member_documents',rewards.doc_key(owner,'growth','current')))
        before=__import__('copy').deepcopy(self.db.rows)
        state=self.send('GET','/rewards').json
        self.assertEqual(state['capacity']['used'],205)
        self.assertEqual(next(r for r in state['achievements'] if r['id']=='items_100')['progress'],205)
        self.assertFalse(state['capacity']['can_add'])
        self.assertEqual(self.db.rows,before)

    def test_lost_commit_response_replays_reward_without_double_credit(self):
        from palm.cloud_client import CloudBaseError
        original=self.db.finish_transaction
        def lost(key,commit=False):
            original(key,commit)
            if commit:raise CloudBaseError(503,'NETWORK_ERROR')
        with self.at('2026-10-17T10:00:00'):
            self.db.finish_transaction=lost
            try:r=self.send('POST','/rewards/checkin',{'date':'2026-10-17'},key='lost-commit-response-0001')
            finally:self.db.finish_transaction=original
            self.assertEqual(r.status_code,503,r.json)
            replay=self.send('POST','/rewards/checkin',{'date':'2026-10-17'},key='lost-commit-response-0001')
            self.assertEqual(replay.status_code,200,replay.json)
            self.assertEqual(replay.json['balance'],5)
            self.assertEqual(self.send('POST','/rewards/checkin',{'date':'2026-10-17'}).json['balance'],5)
