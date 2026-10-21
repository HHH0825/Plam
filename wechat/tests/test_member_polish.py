"""Purchase restrictions and launch offer; isolated accounts, no network calls."""
import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from types import SimpleNamespace
from unittest.mock import patch
from flask import g
from test_virtual_payment import PaymentContract
from test_purchases import PurchasesContract
from palm import payments as p, membership as m


class PolishContract:
    setUp = PaymentContract.setUp
    send = PaymentContract.send
    order = PaymentContract.order
    remote = PaymentContract.remote
    sync = PaymentContract.sync
    reset_throttle = PaymentContract.reset_throttle

    def active(self, expiry=None):
        with self.app.app_context(), p.transaction():
            g.user_id = 1
            m.put('membership', 'status', {'starts_at':1, 'expires_at':expiry or 4102444800})

    def test_active_all_plans_and_platforms_block_before_wechat_or_creation(self):
        self.active()
        self.app.config.update(PAY_IOS_ENABLED=True, PAY_IOS_PRODUCTS={'month':'im','quarter':'iq','year':'iy'})
        exchanger = self.app.config['WECHAT_CODE_EXCHANGER']
        with patch.dict(self.app.config, WECHAT_CODE_EXCHANGER=lambda _: self.fail('must not exchange login')):
            for terminal, prices in [('android',[390,990]), ('ios',[450,1150])]:
                state=self.send('GET','/membership?platform='+terminal).json
                self.assertTrue(state['active']);self.assertFalse(state['purchase_allowed'])
                self.assertEqual(state['purchase_block_reason'],'active_membership')
                for plan,price in zip(('month','quarter'),prices):
                    r=self.send('POST','/pay/order',{'plan_id':plan,'platform':terminal,'expected_price_cents':price,'code':'alice'})
                    self.assertEqual((r.status_code,r.json['code']),(409,'MEMBERSHIP_ALREADY_OWNED'))
            legacy=PurchasesContract.send(self,'POST','/pay/order',{'plan_id':'month','code':'alice'})
            self.assertEqual(legacy.json['code'],'MEMBERSHIP_ALREADY_OWNED')
        self.assertEqual(self.send('GET','/pay/orders').json['orders'],[])
        self.provider.query_order.assert_not_called()

    def test_pending_guard_blocks_second_device_before_login_exchange(self):
        order=self.order('month')['order']
        with patch.dict(self.app.config, WECHAT_CODE_EXCHANGER=lambda _: self.fail('must not exchange login')):
            r=self.send('POST','/pay/order',{'plan_id':'quarter','code':'alice'})
        self.assertEqual((r.status_code,r.json['code']),(409,'PAYMENT_ORDER_PENDING'))
        self.assertEqual(r.json['order']['id'],order['id'])
        self.sync(order,status=6)
        self.assertNotEqual(self.order('quarter')['order']['id'],order['id'])

    def test_membership_changed_during_login_is_rechecked_in_transaction(self):
        original=self.app.config['WECHAT_CODE_EXCHANGER']
        def exchange(code):
            self.active()
            return original(code)
        with patch.dict(self.app.config, WECHAT_CODE_EXCHANGER=exchange):
            r=self.send('POST','/pay/order',{'plan_id':'month','code':'alice'})
        self.assertEqual(r.json['code'],'MEMBERSHIP_ALREADY_OWNED')
        self.assertEqual(self.send('GET','/pay/orders').json['orders'],[])

    def test_expiry_and_full_refund_restore_purchase_eligibility(self):
        self.active(expiry=2)
        self.assertTrue(self.send('GET','/membership').json['purchase_allowed'])
        order=self.order('month')['order'];self.sync(order)
        self.assertFalse(self.send('GET','/membership').json['purchase_allowed'])
        self.reset_throttle(order);self.sync(order,left_fee=0)
        self.assertTrue(self.send('GET','/membership').json['purchase_allowed'])
        self.assertEqual(self.order('quarter')['order']['price_cents'],990)

    def test_retired_promotion_has_no_deadline_and_never_reprices_catalog(self):
        for at in (1798732799, 1798732800, 1798732801):
            with patch('palm.membership.time',SimpleNamespace(time=lambda:at)):
                r=self.send('GET','/membership').json
            self.assertFalse(r['promotion']['active'])
            self.assertEqual(r['server_time'],at)
            self.assertNotIn('ends_at', r['promotion'])
            self.assertNotIn('description', r['promotion'])
            self.assertEqual([p['price_cents'] for p in r['plans']],[390,990])
            self.assertNotIn('ends_text', r['promotion'])


class SQLitePolish(PolishContract,unittest.TestCase):
    cloud=False

    def test_two_simultaneous_empty_account_checkouts_create_only_one_order(self):
        rendezvous=Barrier(2)
        def exchange(code):
            rendezvous.wait(timeout=5)
            return {'openid':'owner-alice','session_key':'isolated'}
        def checkout(_):
            with self.app.test_client() as client:
                return self.send('POST','/pay/order',{'plan_id':'month','code':'alice'},client=client).status_code
        with patch.dict(self.app.config, WECHAT_CODE_EXCHANGER=exchange),ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(checkout,range(2))),[201,409])
        self.assertEqual(len(self.send('GET','/pay/orders').json['orders']),1)


class CloudPolish(PolishContract,unittest.TestCase):
    cloud=True

    def test_competing_checkout_at_commit_rolls_back_first_order(self):
        original=self.db.finish_transaction;first=[True];winner=[]
        def commit(key,commit=False):
            if commit and first[0]:
                first[0]=False
                with self.app.app_context(),self.app.test_client() as client:
                    r=self.send('POST','/pay/order',{'plan_id':'month','code':'alice'},client=client)
                    self.assertEqual(r.status_code,201,r.json);winner.append(r.json['order']['id'])
            return original(key,commit)
        with patch.object(self.db,'finish_transaction',side_effect=commit):
            result=self.send('POST','/pay/order',{'plan_id':'quarter','code':'alice'})
        self.assertEqual(result.status_code,409)
        self.assertEqual([r['id'] for r in self.send('GET','/pay/orders').json['orders']],winner)
