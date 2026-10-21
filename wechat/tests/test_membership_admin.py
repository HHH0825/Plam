"""Isolated entitlement, maintainer security and dual-platform purchase contracts."""
import importlib.util
import io
import json
import secrets
import time
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from flask import g
from test_virtual_payment import PaymentContract
from test_purchases import PurchasesContract
from palm import entitlements as e, payments as p
from palm.membership import get, put
from palm.payment_budget import budget, remaining, read_response, BudgetExceeded


class GiftContract:
    setUp = PaymentContract.setUp
    send = PaymentContract.send
    order = PaymentContract.order
    sync = PaymentContract.sync
    remote = PaymentContract.remote
    reset_throttle = PaymentContract.reset_throttle

    def gift(self, months=12, days=0, ident=None):
        action = {'type':'grant','months':months,'days':days,'reason':'isolated test'}
        with self.app.app_context():
            g.user_id = 1
            planned = e.preview(action)
            ident = ident or secrets.token_hex(16)
            result = e.apply_action(action, ident, planned['fingerprint'], 'test-maintainer', planned['action_at'])
            return ident, result

    def revoke(self, ident):
        action = {'type':'revoke','gift_id':ident,'reason':'test revoke'}
        with self.app.app_context():
            g.user_id = 1
            planned=e.preview(action)
            return e.apply_action(action,secrets.token_hex(16),planned['fingerprint'],'test-maintainer',planned['action_at'])

    def test_active_gift_disables_checkout_and_revoke_reopens_it(self):
        ident,_=self.gift(months=1)
        status=self.send('GET','/membership').json
        self.assertTrue(status['active']);self.assertFalse(status['purchase_allowed'])
        r=self.send('POST','/pay/order',{'plan_id':'month','code':'alice'})
        self.assertEqual(r.json['code'],'MEMBERSHIP_ALREADY_OWNED')
        self.assertEqual(self.send('GET','/pay/orders').json['orders'],[])
        self.revoke(ident)
        self.assertTrue(self.send('GET','/membership').json['purchase_allowed'])
        self.assertEqual(self.order('month')['order']['price_cents'],390)

    def test_gift_after_payment_refund_only_removes_paid_months(self):
        order=self.order('month')['order'];self.sync(order)
        paid=self.send('GET','/membership').json['expires_at']
        ident,result=self.gift()
        self.assertEqual(result['expires_at'],p.add_months(paid,12))
        self.reset_throttle(order);self.sync(order,left_fee=0)
        with self.app.app_context():
            g.user_id=1;gift=get('membership_gift',ident)
            self.assertEqual(e.overview()['expires_at'],p.add_months(gift['created_at'],12))
            self.assertIsNone(gift['revoked_at'])
        self.revoke(ident)
        self.assertFalse(self.send('GET','/membership').json['active'])

    def test_gift_before_payment_revoke_keeps_paid_entitlement(self):
        order=self.order('month')['order']  # issued before the gift, paid afterwards
        ident,first=self.gift(months=3)
        self.sync(order)
        combined=self.send('GET','/membership').json['expires_at']
        self.assertEqual(combined,p.add_months(first['expires_at'],1))
        result=self.revoke(ident)
        with self.app.app_context():
            row=p.read_order(order['id'])
            self.assertEqual(row['status'],'fulfilled')
            self.assertEqual(result['expires_at'],p.add_months(row['fulfilled_at'],1))

    def test_multiple_gifts_independent_revoke_and_idempotent_response_loss(self):
        first,_=self.gift(months=1);second,result=self.gift(months=0,days=7)
        result=self.revoke(first)
        with self.app.app_context():
            g.user_id=1
            self.assertIsNotNone(get('membership_gift',first)['revoked_at'])
            self.assertIsNone(get('membership_gift',second)['revoked_at'])
            self.assertEqual(result['expires_at'],get('membership_gift',second)['created_at']+7*86400)
        self.revoke(second)
        self.assertFalse(self.send('GET','/membership').json['active'])

    def test_same_request_replays_once_and_stale_preview_is_rejected(self):
        action={'type':'grant','months':12,'days':0,'reason':'one gift'}
        with self.app.app_context():
            g.user_id=1;planned=e.preview(action);ident=secrets.token_hex(16)
            result=e.apply_action(action,ident,planned['fingerprint'],'tester',planned['action_at'])
            for _ in range(3):
                self.assertEqual(e.apply_action(action,ident,planned['fingerprint'],'tester',planned['action_at']),result)
            self.assertEqual(len(e.gift_events()),1)
            with self.assertRaisesRegex(ValueError,'已更新'):
                e.apply_action(action,secrets.token_hex(16),planned['fingerprint'],'tester',planned['action_at'])

    def test_old_paid_membership_import_matches_and_bad_baseline_blocks_all_writes(self):
        order=self.order('month')['order'];self.sync(order)
        with self.app.app_context(),p.transaction():
            g.user_id=1;row=get('membership','status');row.pop('entitlement_version',None);row.pop('ledger_revision',None)
            put('membership','status',row)
        _,result=self.gift(months=1)
        self.assertTrue(result['expires_at']>result['paid_expires_at'])
        with self.app.app_context(),p.transaction():
            g.user_id=1;row=get('membership','status');row['expires_at']+=100;put('membership','status',row)
        with self.assertRaisesRegex(ValueError,'不一致'):
            self.gift(months=1)

    def test_validation_partial_refund_and_month_end(self):
        for action in [{'type':'grant','months':12,'days':0,'reason':''},
                       {'type':'grant','months':0,'days':3651,'reason':'bad'},
                       {'type':'grant','months':True,'days':0,'reason':'bad'}]:
            with self.assertRaises(ValueError):e.validate_action(action)
        at=int(datetime(2024,1,31,12,tzinfo=p.BEIJING).timestamp())
        result=e.calculate({},[{'index':1,'at':at,'months':1,'active':True}])
        self.assertEqual(datetime.fromtimestamp(result['expires_at'],p.BEIJING).strftime('%Y-%m-%d'),'2024-02-29')
        order=self.order('month')['order'];gift,_=self.gift(months=1);self.sync(order)
        before=self.send('GET','/membership').json['expires_at'];self.reset_throttle(order)
        self.sync(order,left_fee=100)
        self.assertEqual(self.send('GET','/membership').json['expires_at'],before)

    def test_ios_catalog_protocol_and_price_preconditions(self):
        self.app.config.update(PAY_IOS_ENABLED=True,PAY_IOS_PRODUCTS={'month':'ios_month','quarter':'ios_quarter','year':'ios_year'})
        ios=self.send('GET','/membership?platform=ios').json
        self.assertEqual([x['price_cents'] for x in ios['plans']],[450,1150])
        for plan,price in [('month',450),('quarter',1150)]:
            response=self.send('POST','/pay/order',{'plan_id':plan,'code':'alice','platform':'ios','expected_price_cents':price})
            self.assertEqual(response.status_code,201,response.json)
            signed=json.loads(response.json['payData']['signData'])
            self.assertEqual(signed['productId'],'ios_'+plan);self.assertEqual(signed['goodsPrice'],price)
            self.assertEqual(response.json['order']['platform'],'ios')
            self.sync(response.json['order'],status=6)
        self.assertEqual(self.send('POST','/pay/order',{'plan_id':'month','code':'alice','platform':'ios','expected_price_cents':390}).status_code,409)
        old=PurchasesContract.send(self,'POST','/pay/order',{'plan_id':'month','code':'alice'})
        self.assertEqual(old.status_code,428)
        self.assertFalse(PurchasesContract.send(self,'GET','/membership').json['payment_open'])
        self.app.config['PAY_IOS_ENABLED']=False
        self.assertFalse(self.send('GET','/membership?platform=ios').json['payment_open'])

    def test_local_admin_origin_csrf_and_confirm_only_writes(self):
        spec=importlib.util.spec_from_file_location('local_member_admin',Path(__file__).resolve().parents[1]/'tools/member_admin/server.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        app=module.create_admin_app(self.app);app.config['TESTING']=True
        client=app.test_client();host={'Host':'127.0.0.1:8787'}
        self.assertEqual(client.get('/',headers={'Host':'evil.test'}).status_code,403)
        self.assertEqual(client.get('/',headers=host).status_code,200)
        context=next(iter(app.extensions['maintainer_sessions'].values()))
        headers={**host,'Origin':'http://127.0.0.1:8787','X-CSRF-Token':context['csrf']}
        config={'env_id':'cloud1-test','api_key':'not-a-real-key'}
        self.assertEqual(client.post('/connect',json=config,headers={**headers,'Origin':'https://evil.test'}).status_code,403)
        self.assertEqual(client.post('/connect',json=config,headers={**headers,'X-CSRF-Token':'wrong'}).status_code,403)
        self.assertEqual(client.post('/connect',json=config,headers=headers).status_code,200)
        self.assertEqual(client.post('/apply',json={'operation':[]},headers=headers).status_code,409)
        action={'type':'grant','months':1,'days':0,'reason':'preview only'}
        planned=client.post('/preview',json={'user_id':'1','action':action},headers=headers).json
        self.assertIn('operation',planned)
        self.assertFalse(self.send('GET','/membership').json['active'])
        for _ in range(2):
            response=client.post('/apply',json={'operation':planned['operation']},headers=headers)
            self.assertEqual(response.status_code,200,response.json)
        self.assertEqual(len(response.json['gifts']),1)
        self.assertEqual(client.post('/lookup',json={'user_id':9999},headers=headers).status_code,409)
        self.assertEqual(client.post('/disconnect',json={},headers=headers).status_code,200)
        self.assertEqual(client.post('/lookup',json={'user_id':1},headers=headers).status_code,403)


class SQLiteGifts(GiftContract,unittest.TestCase):cloud=False
class CloudGifts(GiftContract,unittest.TestCase):
    cloud=True

    def test_committed_gift_with_lost_response_replays_without_second_grant(self):
        from palm.cloud_client import CloudBaseError
        action={'type':'grant','months':1,'days':0,'reason':'lost response'}
        with self.app.app_context():
            g.user_id=1;planned=e.preview(action);ident=secrets.token_hex(16)
            original=self.db.finish_transaction;lost=[True]
            def uncertain(key,commit=False):
                original(key,commit)
                if commit and lost[0]:
                    lost[0]=False
                    raise CloudBaseError(503,'RESPONSE_LOST')
            with patch.object(self.db,'finish_transaction',side_effect=uncertain):
                with self.assertRaises(CloudBaseError):
                    e.apply_action(action,ident,planned['fingerprint'],'tester',planned['action_at'])
                replay=e.apply_action(action,ident,planned['fingerprint'],'tester',planned['action_at'])
            self.assertEqual(len(e.gift_events()),1)
            self.assertEqual(e.overview()['expires_at'],replay['expires_at'])

    def test_payment_committing_during_gift_causes_conflict_without_losing_paid_time(self):
        from palm.cloud_client import CloudBaseError
        order=self.order('month')['order']
        with self.app.app_context():
            row=p.read_order(order['id'])
            proof=p.VerifiedPayment(row['id'],'WX-'+row['id'],row['openid'],row['product_id'],1,row['attach'],row['price_cents'])
            g.user_id=1;action={'type':'grant','months':12,'days':0,'reason':'concurrent'}
            planned=e.preview(action);original=self.db.finish_transaction;first=[True]
            def commit(key,commit=False):
                if commit and first[0]:
                    first[0]=False
                    with self.app.app_context():p.fulfill_verified_payment(proof)
                return original(key,commit)
            with patch.object(self.db,'finish_transaction',side_effect=commit):
                with self.assertRaises(CloudBaseError):
                    e.apply_action(action,secrets.token_hex(16),planned['fingerprint'],'tester',planned['action_at'])
            self.assertEqual(p.read_order(order['id'])['status'],'fulfilled')
            self.assertEqual(len(e.gift_events()),0)
        _,result=self.gift(months=12)
        self.assertEqual(result['expires_at'],p.add_months(result['paid_expires_at'],12))


class DeadlineTests(unittest.TestCase):
    def test_deadline_bounds_read_and_rejects_trickle_response(self):
        with patch('palm.payment_budget.time.monotonic',side_effect=[0,.5,1,2.01]):
            with budget(2):
                self.assertEqual(remaining(),1.5)
                with self.assertRaises(BudgetExceeded):read_response(io.BytesIO(b'hello'),100)
