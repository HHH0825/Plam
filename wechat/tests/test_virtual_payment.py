"""Payment contracts with no real WeChat calls or money movement."""
import hashlib
import hmac
import json
import secrets
import time
import unittest
from contextlib import closing
from datetime import datetime
from unittest.mock import Mock, patch
from flask import g
from test_purchases import PurchasesContract
from palm import payments as p
from palm.database import get_db
from palm.membership import get as member_get, put as member_put
from palm.wechat_pay_client import PaymentProviderError, WeChatPayClient


class PaymentContract:
    cloud = False
    def send(self, method, path, data=None, **kwargs):
        # Existing contract cases now exercise the current purchase protocol.
        # Legacy-client rejection is tested separately with the raw sender.
        if method == 'GET' and path == '/membership':
            path += '?platform=android'
        if method == 'POST' and path == '/pay/order' and isinstance(data, dict):
            try:
                price = int(self.app.config.get('PAY_TEST_PRICE_CENTS', '1')) if self.app.config.get('PAY_TEST_ENABLED') and data.get('plan_id') == 'month' else {'month':290,'quarter':990,'year':2990}.get(data.get('plan_id'),0)
            except (ValueError, TypeError):
                price = 0
            data = {'platform':'android','expected_price_cents':price,**data}
        return PurchasesContract.send(self, method, path, data, **kwargs)

    def setUp(self):
        PurchasesContract.setUp(self)
        self.app.config.update(PAY_ENABLED=True, PAY_TEST_ENABLED=False, PAY_IOS_ENABLED=False, PAY_OFFER_ID='12345', PAY_APP_KEY='formal-test-key',
                               PAY_NOTIFY_SECRET='n' * 48, WECHAT_APP_ID='wx-test', WECHAT_APP_SECRET='secret-test',
                               PAY_PRODUCTS={'month':'cat-month','quarter':'cat-quarter','year':'cat-year'},
                               WECHAT_CODE_EXCHANGER=lambda code: {'openid':'owner-' + code, 'session_key':'session-test-key'})
        self.provider = Mock()
        self.app.extensions['wechat_payment_client'] = self.provider

    def order(self, plan='month', **extra):
        result = self.send('POST', '/pay/order', {'plan_id': plan, 'code': 'alice', **extra})
        self.assertEqual(result.status_code, 201, result.json)
        return result.json

    def legacy_order(self, seed, plan=None):
        """Fixture of an order already issued before the no-repurchase rule.

        Only used to verify late payment and refund of existing orders, never
        to bypass the production checkout route in new-purchase tests.
        """
        with self.app.app_context(), p.transaction():
            row = dict(p.read_order(seed['id']))
            row.update(id='P'+secrets.token_hex(15), attach=secrets.token_hex(16),
                       status='pending', wx_order_id=None, next_query_at=1, last_query_at=0)
            for key in ('fulfilled_at','grant_index','refunded_at','can_purchase_again'):
                row.pop(key, None)
            if plan:
                catalog={'year':{'months':12,'price_cents':2990},'quarter':{'months':3,'price_cents':990}}.get(plan) or next(x for x in p.checkout_plans('android') if x['id']==plan)
                row.update(plan_id=plan, months=catalog['months'],price_cents=catalog['price_cents'],product_id='cat-year' if plan=='year' else self.app.config['PAY_PRODUCTS'].get(plan, 'retired-' + plan))
            p.save_order(row, new=True)
            return p.public_order(row)

    def remote(self, order, **extra):
        return {'order_id':order['id'], 'wx_order_id':'WX-' + order['id'], 'env_type':1,
                'order_type':0, 'status':2, 'order_fee':order['price_cents'],
                'paid_fee':order['price_cents'], 'left_fee':order['price_cents'], 'paid_time':int(time.time()), **extra}

    def sync(self, order, **extra):
        self.provider.query_order.return_value = self.remote(order, **extra)
        return self.send('POST', '/pay/query', {'out_trade_no':order['id']})

    def reset_throttle(self, order):
        with self.app.app_context(), p.transaction():
            row = p.read_order(order['id']); row['last_query_at'] = 0; p.save_order(row)

    def test_retired_year_rejected_without_login_order_or_payment_on_both_platforms(self):
        for platform in ('android','ios'):
            with patch.dict(self.app.config, WECHAT_CODE_EXCHANGER=lambda _: self.fail('no login exchange')):
                r=self.send('POST','/pay/order',{'plan_id':'year','code':'alice','platform':platform,'expected_price_cents':2990})
            self.assertEqual((r.status_code,r.json['code']),(410,'PLAN_RETIRED'))
            self.assertIn('已停售',r.json['error'])
        self.assertEqual(self.send('GET','/pay/orders').json['orders'],[])
        self.provider.query_order.assert_not_called()

    def test_retired_year_snapshots_still_deliver_deduplicate_and_refund_without_year_config(self):
        seed=self.order('month')['order'];self.sync(seed,status=6)
        old=self.legacy_order(seed,plan='year')
        self.app.config.update(PAY_PRODUCTS={'month':'cat-month','quarter':'cat-quarter'},PAY_IOS_ENABLED=True,PAY_IOS_PRODUCTS={'month':'im','quarter':'iq'})
        for terminal,amount in [('android',2990),('ios',3390)]:
            with self.app.app_context(),p.transaction():
                row=p.read_order(old['id']);row.update(platform=terminal,price_cents=amount,product_id='retired-'+terminal);p.save_order(row)
            old={**old,'platform':terminal,'price_cents':amount}
            self.assertTrue(self.send('GET','/membership?platform='+terminal).json['payment_open'])
            self.assertEqual(self.sync(old).json['order']['status'],'fulfilled')
            expiry=self.send('GET','/membership').json['expires_at']
            with self.app.app_context():
                row=p.read_order(old['id']);self.assertEqual(expiry,p.add_months(row['fulfilled_at'],12))
            self.reset_throttle(old);self.sync(old);self.assertEqual(self.send('GET','/membership').json['expires_at'],expiry)
            history=self.send('GET','/pay/orders').json['orders'];self.assertTrue(any(r['plan_id']=='year' and r['price_cents']==amount for r in history))
            self.reset_throttle(old);self.assertEqual(self.sync(old,left_fee=0).json['order']['status'],'refunded')
            self.assertFalse(self.send('GET','/membership').json['active'])
            old=self.legacy_order(seed,plan='year') if terminal=='android' else old

    def test_old_month_and_quarter_snapshots_survive_new_price_and_product_mapping(self):
        seed = self.order('month')['order']; self.sync(seed, status=6)
        self.app.config.update(PAY_PRODUCTS={'month': 'new-month-290'}, PAY_IOS_ENABLED=True, PAY_IOS_PRODUCTS={'month': 'new-ios-290'})
        for platform, plan, price, months in [('android','month',390,1),('ios','month',450,1),('android','quarter',990,3),('ios','quarter',1150,3)]:
            old = self.legacy_order(seed, plan=plan)
            with self.app.app_context(), p.transaction():
                row = p.read_order(old['id']); row.update(platform=platform, price_cents=price, months=months, product_id='retired-' + platform + '-' + plan); p.save_order(row)
            old = {**old, 'price_cents': price}
            result = self.sync(old)
            self.assertEqual(result.json['order']['status'], 'fulfilled')
            with self.app.app_context():
                row = p.read_order(old['id'])
                expected = p.add_months(row['fulfilled_at'], months)
            self.assertEqual(self.send('GET', '/membership').json['expires_at'], expected)
            self.reset_throttle(old); self.sync(old)
            self.assertEqual(self.send('GET', '/pay/orders/' + old['id']).json['order']['price_cents'], price)
            self.reset_throttle(old)
            self.assertEqual(self.sync(old, left_fee=0).json['order']['status'], 'refunded')
            self.assertFalse(self.send('GET', '/membership').json['active'])
        self.assertEqual(self.send('POST','/pay/order',{'plan_id':'quarter','code':'alice'}).status_code,410)
        self.assertEqual(self.send('POST','/pay/order',{'plan_id':'month','code':'alice','expected_price_cents':390}).status_code,409)

    def test_live_checkout_requires_explicit_config_and_keeps_free_features(self):
        self.app.config['PAY_ENABLED'] = False
        self.assertFalse(self.send('GET', '/membership').json['payment_open'])
        self.assertEqual(self.send('POST', '/pay/order', {'plan_id':'month','code':'alice'}).status_code, 503)
        self.assertEqual(self.send('GET', '/items').status_code, 200)
        self.assertEqual(self.send('GET', '/membership').json['status'], 'free')
        for key in ('PAY_NOTIFY_SECRET','PAY_APP_KEY','WECHAT_APP_SECRET'):
            old=self.app.config[key];self.app.config['PAY_ENABLED']=True;self.app.config[key]=''
            self.assertFalse(self.send('GET','/membership').json['payment_open']);self.app.config[key]=old
        self.assertFalse(self.send('GET','/membership').json['ios_payment_open'])

    def test_price_env_fresh_unique_order_and_no_persisted_login_secrets(self):
        ids = set()
        for plan, price in [('month',290)]:
            result = self.order(plan)
            pay = result['payData']; sign = json.loads(pay['signData']); ids.add(sign['outTradeNo'])
            self.assertEqual(sign['goodsPrice'],price);self.assertEqual(sign['env'],0);self.assertEqual(sign['buyQuantity'],1)
            self.assertRegex(sign['outTradeNo'],r'^P[0-9a-f]{30}$');self.assertEqual(pay['mode'],'short_series_goods')
            self.assertEqual(pay['paySig'],hmac.new(b'formal-test-key',('requestVirtualPayment&'+pay['signData']).encode(),hashlib.sha256).hexdigest())
            self.assertEqual(pay['signature'],hmac.new(b'session-test-key',pay['signData'].encode(),hashlib.sha256).hexdigest())
            self.assertEqual(self.sync(result['order'],status=6).json['order']['status'],'closed')
        self.assertEqual(len(ids),1)
        a=self.send('POST','/pay/order',{'plan_id':'month','code':'alice'},key='payment-request-unique-01')
        b=self.send('POST','/pay/order',{'plan_id':'month','code':'alice'},key='payment-request-unique-01')
        self.assertEqual(a.status_code,201)
        self.assertEqual(b.status_code,409)
        self.assertEqual(b.json['code'],'PAYMENT_ORDER_PENDING')
        self.sync(a.json['order'],status=6)
        c=self.send('POST','/pay/order',{'plan_id':'month','code':'alice'},key='payment-request-unique-01')
        self.assertNotEqual(a.json['order']['id'],c.json['order']['id'])
        with self.app.app_context():
            stored = str(self.db.rows) if self.cloud else '\n'.join(r['payload'] for r in get_db().execute('SELECT payload FROM pay_orders'))
            self.assertNotIn('session-test-key',stored);self.assertNotIn('formal-test-key',stored);self.assertNotIn('signData',stored)

    def test_client_cannot_choose_price_owner_quantity_or_payment_state(self):
        for extra in ({'goodsPrice':1},{'openid':'owner-bob'},{'status':'fulfilled'},{'buyQuantity':50},{'env':1}):
            self.assertEqual(self.send('POST','/pay/order',{'plan_id':'month','code':'alice',**extra}).status_code,400)
        self.assertEqual(self.send('POST','/pay/order',{'plan_id':'month','code':'bob'}).status_code,403)
        self.assertEqual(self.send('POST','/pay/order',{'plan_id':'month','code':'dev:alice'}).status_code,400)
        self.assertEqual(self.send('GET','/membership').json['status'],'free')

    def enable_small_payment(self):
        self.app.config.update(PAY_TEST_ENABLED=True, PAY_TEST_USER_IDS='1',
                               PAY_TEST_PRODUCT='cat_test_month', PAY_TEST_PRICE_CENTS='1')

    def test_small_real_payment_is_server_scoped_and_never_charges_other_users(self):
        self.enable_small_payment()
        member = self.send('GET', '/membership').json
        self.assertTrue(member['payment_open'])
        self.assertTrue(member['payment_test'])
        self.assertEqual([(v['id'], v['price_cents'], v['months']) for v in member['plans']], [('month', 1, 1)])
        other = self.send('GET', '/membership', token=self.bob).json
        self.assertFalse(other['payment_open'])
        self.assertFalse(other['payment_test'])
        self.assertEqual([v['price_cents'] for v in other['plans']], [290])
        self.assertEqual(self.send('POST', '/pay/order', {'plan_id':'month','code':'bob'}, token=self.bob).status_code, 503)
        self.assertEqual(self.send('POST', '/pay/order', {'plan_id':'quarter','code':'alice'}).status_code, 410)
        response = self.order('month')
        signed = json.loads(response['payData']['signData'])
        self.assertEqual((signed['goodsPrice'], signed['productId'], signed['env']), (1, 'cat_test_month', 0))
        self.assertEqual(response['order']['price_cents'], 1)
        self.assertTrue(response['order']['test_payment'])
        for extra in ({'price_cents':1}, {'test_payment':True}, {'product_id':'cat_test_month'}):
            self.assertEqual(self.send('POST', '/pay/order', {'plan_id':'month','code':'alice', **extra}).status_code, 400)

    def test_invalid_small_payment_config_fails_closed_instead_of_using_formal_price(self):
        self.enable_small_payment()
        for key, value in [('PAY_TEST_USER_IDS',''), ('PAY_TEST_USER_IDS','*'), ('PAY_TEST_USER_IDS','1, 2'),
                           ('PAY_TEST_PRODUCT',''), ('PAY_TEST_PRODUCT','cat-month'), ('PAY_TEST_PRODUCT','cat_month'*3),
                           ('PAY_TEST_PRICE_CENTS','0'), ('PAY_TEST_PRICE_CENTS','0.01'), ('PAY_TEST_PRICE_CENTS','101'),
                           ('PAY_TEST_PRICE_CENTS',True), ('PAY_TEST_PRICE_CENTS','-1')]:
            with self.subTest(key=key, value=value):
                old = self.app.config[key]
                self.app.config[key] = value
                self.assertFalse(self.send('GET', '/membership').json['payment_open'])
                self.assertEqual(self.send('POST', '/pay/order', {'plan_id':'month','code':'alice'}).status_code, 503)
                self.app.config[key] = old
        self.app.config['PAY_TEST_PRODUCT'] = 'cat-month'
        self.app.config['PAY_PRODUCTS']['month'] = 'cat-month'
        self.assertFalse(self.send('GET', '/membership').json['payment_open'])

    def test_small_order_keeps_price_after_switch_off_and_supports_delivery_and_refund(self):
        self.enable_small_payment()
        order = self.order('month')['order']
        self.app.config.update(PAY_TEST_ENABLED=False, PAY_ENABLED=False, PAY_TEST_PRICE_CENTS='100')
        result = self.sync(order)
        self.assertEqual(result.json['order']['status'], 'fulfilled')
        expiry = self.send('GET', '/membership').json['expires_at']
        self.reset_throttle(order)
        self.sync(order)
        self.assertEqual(self.send('GET', '/membership').json['expires_at'], expiry)
        self.reset_throttle(order)
        self.assertEqual(self.sync(order, left_fee=0).json['order']['status'], 'refunded')
        self.assertFalse(self.send('GET', '/membership').json['active'])
        self.app.config['PAY_ENABLED'] = True
        self.assertEqual(self.order('month')['order']['price_cents'], 290)

    def test_small_order_rejects_wrong_provider_amount_and_accepts_configured_fen(self):
        self.enable_small_payment()
        self.app.config['PAY_TEST_PRICE_CENTS'] = '10'
        order = self.order('month')['order']
        self.assertEqual(order['price_cents'], 10)
        self.assertEqual(self.sync(order, order_fee=390, paid_fee=390, left_fee=390).status_code, 503)
        self.assertFalse(self.send('GET', '/membership').json['active'])
        self.reset_throttle(order)
        self.assertEqual(self.sync(order).json['order']['status'], 'fulfilled')

    def test_old_missing_small_order_allows_manual_retry_after_separated_observations_and_still_delivers_later(self):
        self.enable_small_payment()
        order = self.order('month')['order']
        now = int(time.time())
        with self.app.app_context(), p.transaction():
            row = p.read_order(order['id']); row['created_at'] = now - 120; p.save_order(row)
        self.provider.query_order.side_effect = PaymentProviderError('WeChat rejected request',268490002,
            stage='query_order', detail='数据不存在', order_not_found=True)
        with patch('palm.payments.time.time',return_value=now):
            first = self.send('POST','/pay/query',{'out_trade_no':order['id']})
            self.assertEqual(first.status_code,200,first.json)
            self.assertEqual(first.json['order']['lookup_state'],'not_found')
            self.assertFalse(first.json['order']['can_purchase_again'])
            # Throttled duplicate does not count as a second observation.
            again = self.send('POST','/pay/query',{'out_trade_no':order['id']})
            self.assertFalse(again.json['order']['can_purchase_again'])
        with patch('palm.payments.time.time',return_value=now+6):
            second = self.send('POST','/pay/query',{'out_trade_no':order['id']})
            self.assertTrue(second.json['order']['can_purchase_again'])
            self.assertEqual(second.json['order']['status'],'pending')
            new = self.order('month')['order']
            self.assertNotEqual(new['id'],order['id'])
        with self.app.app_context():
            self.assertGreater(p.read_order(order['id'])['next_query_at'],0)
        self.provider.query_order.side_effect = None
        with patch('palm.payments.time.time',return_value=now+12):
            self.assertEqual(self.sync(order).json['order']['status'],'fulfilled')
            self.assertTrue(self.send('GET','/membership').json['active'])

    def test_recent_test_order_cannot_retry_even_after_two_absent_queries(self):
        self.enable_small_payment()
        now = int(time.time())
        with patch('palm.payments.time.time',return_value=now):
            order = self.order('month')['order']
        self.provider.query_order.side_effect = PaymentProviderError('WeChat rejected request',268490002,
            stage='query_order',order_not_found=True)
        for delta in (0,6):
            with patch('palm.payments.time.time',return_value=now+delta):
                result = self.send('POST','/pay/query',{'out_trade_no':order['id']})
                self.assertFalse(result.json['order']['can_purchase_again'])
                self.assertEqual(result.json['order']['status'],'pending')

    def test_missing_formal_order_or_ambiguous_error_never_unlocks_retry(self):
        order = self.order('month')['order']
        self.provider.query_order.side_effect = PaymentProviderError('WeChat rejected request',268490002,
            stage='query_order',order_not_found=True)
        self.assertEqual(self.send('POST','/pay/query',{'out_trade_no':order['id']}).status_code,503)
        self.assertFalse(self.send('GET','/pay/orders/'+order['id']).json['order']['can_purchase_again'])
        self.provider.query_order.side_effect=None
        self.reset_throttle(order);self.sync(order,status=6)
        self.enable_small_payment()
        small=self.order('month')['order']
        for code, stage, absent in [(268490002,'query_order',False),(268490003,'query_order',True),
                                    (268490002,'access_token',True)]:
            self.reset_throttle(small)
            self.provider.query_order.side_effect = PaymentProviderError('WeChat rejected request',code,
                stage=stage,order_not_found=absent)
            self.assertEqual(self.send('POST','/pay/query',{'out_trade_no':small['id']}).status_code,503)
            self.assertFalse(self.send('GET','/pay/orders/'+small['id']).json['order']['can_purchase_again'])

    def test_missing_test_order_recovery_requires_current_account_allowlist(self):
        self.enable_small_payment()
        order = self.order('month')['order']
        self.app.config['PAY_TEST_USER_IDS']='2'
        self.provider.query_order.side_effect = PaymentProviderError('WeChat rejected request',268490002,
            stage='query_order',order_not_found=True)
        self.assertEqual(self.send('POST','/pay/query',{'out_trade_no':order['id']}).status_code,503)
        self.assertEqual(self.send('POST','/pay/query',{'out_trade_no':order['id']},token=self.bob).status_code,404)

    def test_cross_account_orders_query_history_and_status_are_isolated(self):
        order=self.order()['order']
        self.assertEqual(self.send('GET','/pay/orders/'+order['id'],token=self.bob).status_code,404)
        self.assertEqual(self.send('POST','/pay/query',{'out_trade_no':order['id']},token=self.bob).status_code,404)
        self.assertEqual(self.send('GET','/pay/orders',token=self.bob).json['orders'],[])
        self.assertNotIn('openid',self.send('GET','/pay/orders').json['orders'][0])
        self.provider.query_order.assert_not_called()

    def test_provider_diagnostics_expose_only_safe_stage_and_numeric_code(self):
        order = self.order('month')['order']
        self.provider.query_order.side_effect = PaymentProviderError('secret provider payload', 268490003, stage='query_order')
        with self.assertLogs(self.app.logger, level='WARNING') as logs:
            result = self.send('POST', '/pay/query', {'out_trade_no':order['id']})
        self.assertEqual(result.status_code, 503)
        self.assertEqual(result.json['payment_stage'], 'query_order')
        self.assertEqual(result.json['wechat_error_code'], 268490003)
        self.assertIn('查询微信订单', result.json['error'])
        self.assertIn('268490003', result.json['error'])
        for private in ('secret provider payload', 'owner-alice', 'formal-test-key', 'session-test-key'):
            self.assertNotIn(private, result.get_data(as_text=True) + str(logs.output))
        self.assertFalse(self.send('GET', '/membership').json['active'])

    def test_network_diagnostic_identifies_token_stage_without_exposing_request(self):
        order = self.order('month')['order']
        self.provider.query_order.side_effect = PaymentProviderError('WeChat service unavailable', stage='access_token')
        with self.assertLogs(self.app.logger, level='WARNING'):
            result = self.send('POST', '/pay/query', {'out_trade_no':order['id']})
        self.assertEqual(result.json['payment_stage'], 'access_token')
        self.assertEqual(result.json['payment_reason'], 'network')
        self.assertIsNone(result.json['wechat_error_code'])
        self.assertIn('获取微信接口凭证', result.json['error'])

    def test_only_paid_statuses_deliver_and_both_terminal_types_work(self):
        seed=self.order('month')['order']
        for status in (2,3,4):
            for order_type in (0,7):
                order=self.legacy_order(seed)
                result=self.sync(order,status=status,order_type=order_type)
                self.assertEqual(result.status_code,200,result.json);self.assertEqual(result.json['order']['status'],'fulfilled')
        self.assertTrue(self.send('GET','/membership').json['active'])

    def test_unpaid_closed_refunding_and_failed_refund_never_grant(self):
        seed=self.order()['order']
        for status in (0,1,5,6,7,9,10):
            order=self.legacy_order(seed);result=self.sync(order,status=status)
            self.assertEqual(result.status_code,200,result.json)
            self.assertEqual(result.json['order']['status'],'closed' if status==6 else 'pending')
            self.assertFalse(self.send('GET','/membership').json['active'])

    def test_reject_mismatched_or_malformed_provider_proofs_without_grant(self):
        invalid=[{'order_id':'someone-else'},{'env_type':2},{'order_type':1},{'order_fee':1},{'paid_fee':1},
                 {'paid_fee':True},{'status':'2'},{'status':True},{'status':99},{'left_fee':-1},{'left_fee':'2990'},
                 {'wx_order_id':''},{'paid_time':0}]
        order=self.order()['order']
        for fields in invalid:
            self.reset_throttle(order);result=self.sync(order,**fields)
            self.assertEqual(result.status_code,503,(fields,result.json))
            self.assertFalse(self.send('GET','/membership').json['active'])

    def test_duplicate_platform_receipt_never_extends_twice(self):
        order=self.order()['order'];self.sync(order)
        expiry=self.send('GET','/membership').json['expires_at']
        self.reset_throttle(order);self.sync(order)
        self.assertEqual(self.send('GET','/membership').json['expires_at'],expiry)
        with self.app.app_context():
            row=p.read_order(order['id'])
            proof=p.VerifiedPayment(row['id'],row['wx_order_id'],row['openid'],row['product_id'],1,row['attach'],row['price_cents'])
            p.fulfill_verified_payment(proof);p.fulfill_verified_payment(proof)
        self.assertEqual(self.send('GET','/membership').json['expires_at'],expiry)
        other=self.legacy_order(order);result=self.sync(other,wx_order_id='WX-'+order['id'])
        self.assertEqual(result.status_code,503,result.json)

    def test_delivery_failure_rolls_back_membership_receipt_and_order(self):
        order=self.order()['order']
        real_save=p.save_order
        def fail(row,new=False):
            if row['status']=='fulfilled':raise RuntimeError('test storage failure')
            return real_save(row,new)
        with patch('palm.payments.save_order',side_effect=fail),self.assertRaises(RuntimeError):self.sync(order)
        self.assertFalse(self.send('GET','/membership').json['active'])
        self.assertEqual(self.send('GET','/pay/orders/'+order['id']).json['order']['status'],'pending')
        self.reset_throttle(order)
        self.assertEqual(self.sync(order).json['order']['status'],'fulfilled')

    def test_signed_notification_is_not_payment_evidence_and_unsigned_is_denied(self):
        order=self.order()['order']
        event={'Event':'xpay_goods_deliver_notify','Env':0,'OpenId':'owner-alice','OutTradeNo':order['id']}
        raw=p.raw_json(event).encode();timestamp=str(int(time.time()))
        self.assertEqual(self.client.post('/payments/wechat/notify',data=raw,content_type='application/json').status_code,403)
        headers={'X-Palm-Pay-Time':timestamp,'X-Palm-Pay-Signature':p.internal_signature(raw,timestamp,'n'*48)}
        self.provider.query_order.return_value=self.remote(order,status=1)
        result=self.client.post('/payments/wechat/notify',data=raw,content_type='application/json',headers=headers)
        self.assertEqual(result.status_code,503);self.assertFalse(self.send('GET','/membership').json['active'])
        self.reset_throttle(order);self.provider.query_order.return_value=self.remote(order)
        result=self.client.post('/payments/wechat/notify',data=raw,content_type='application/json',headers=headers)
        self.assertEqual(result.json['ErrCode'],0);self.assertTrue(self.send('GET','/membership').json['active'])
        expiry=self.send('GET','/membership').json['expires_at']
        self.assertEqual(self.client.post('/payments/wechat/notify',data=raw,content_type='application/json',headers=headers).json['ErrCode'],0)
        self.assertEqual(self.send('GET','/membership').json['expires_at'],expiry)
        old=str(int(timestamp)-301);headers={'X-Palm-Pay-Time':old,'X-Palm-Pay-Signature':p.internal_signature(raw,old,'n'*48)}
        self.assertEqual(self.client.post('/payments/wechat/notify',data=raw,content_type='application/json',headers=headers).status_code,403)

    def test_full_refund_removes_only_this_grant_and_duplicates_do_not_revoke_twice(self):
        one=self.order('month')['order'];two=self.legacy_order(one,plan='year')
        self.sync(one);self.sync(two)
        old=self.send('GET','/membership').json['expires_at']
        self.reset_throttle(one);self.assertEqual(self.sync(one,left_fee=0).json['order']['status'],'refunded')
        after=self.send('GET','/membership').json
        self.assertTrue(after['active']);self.assertLess(after['expires_at'],old)
        self.reset_throttle(one);self.sync(one,left_fee=0)
        self.assertEqual(self.send('GET','/membership').json['expires_at'],after['expires_at'])
        self.reset_throttle(two);self.sync(two,left_fee=0)
        self.assertFalse(self.send('GET','/membership').json['active'])

    def test_partial_refund_is_visible_and_does_not_remove_other_entitlements(self):
        order=self.order()['order'];self.sync(order);expiry=self.send('GET','/membership').json['expires_at']
        self.reset_throttle(order);result=self.sync(order,left_fee=200)
        self.assertEqual(result.json['order']['status'],'partial_refund')
        self.assertEqual(self.send('GET','/membership').json['expires_at'],expiry)

    def test_refund_before_delivery_never_grants_and_reserves_platform_id(self):
        order=self.order()['order']
        self.assertEqual(self.sync(order,left_fee=0).json['order']['status'],'refunded')
        self.assertFalse(self.send('GET','/membership').json['active'])
        other=self.order()['order']
        self.assertEqual(self.sync(other,wx_order_id='WX-'+order['id']).status_code,503)
        self.assertFalse(self.send('GET','/membership').json['active'])

    def test_refund_preserves_legacy_membership_baseline(self):
        order=self.order('month')['order']
        old=int(time.time())+40*86400
        with self.app.app_context(),p.transaction():
            g.user_id=1;member_put('membership','status',{'starts_at':int(time.time())-86400,'expires_at':old})
        self.sync(order)
        self.assertGreater(self.send('GET','/membership').json['expires_at'],old)
        self.reset_throttle(order);self.sync(order,left_fee=0)
        self.assertEqual(self.send('GET','/membership').json['expires_at'],old)

    def test_sqlite_upgrade_backs_up_version14_and_preserves_accounts(self):
        if self.cloud:return
        from palm.database import initialize_database
        import sqlite3
        with self.app.app_context():
            db=get_db();db.execute('DROP TABLE pay_orders');db.execute('DROP TABLE pay_deliveries')
            db.execute('PRAGMA user_version=14');db.commit()
        initialize_database(self.app)
        with self.app.app_context():
            self.assertEqual(get_db().execute('PRAGMA user_version').fetchone()[0],15)
            self.assertEqual(get_db().execute('SELECT count(*) FROM users').fetchone()[0],2)
        with closing(sqlite3.connect(self.app.config['DATABASE']+'.pre-payments.bak')) as backup:
            self.assertEqual(backup.execute('PRAGMA user_version').fetchone()[0],14)
            self.assertIsNone(backup.execute("SELECT 1 FROM sqlite_master WHERE name='pay_orders'").fetchone())

    def test_reconciliation_catches_lost_push_and_moves_failures_to_avoid_starvation(self):
        seed=self.order('month')['order']
        orders=[seed,self.legacy_order(seed),self.legacy_order(seed)]
        def query(row):
            if row['id']==orders[0]['id']:raise PaymentProviderError('simulated network failure')
            return self.remote(row)
        self.provider.query_order.side_effect=query
        with self.app.app_context():
            with p.transaction():
                for item in orders:
                    row=p.read_order(item['id']);row['next_query_at']=1;p.save_order(row)
            failed = 0
            from palm.payment_budget import BudgetExceeded
            for _ in range(3):
                try:
                    self.assertEqual(p.reconcile_due(),{'checked':1,'failed':0})
                except BudgetExceeded:
                    failed += 1
            self.assertEqual(failed,1)
            self.assertGreater(p.read_order(orders[0]['id'])['next_query_at'],int(time.time()))
            self.assertEqual(p.read_order(orders[1]['id'])['status'],'fulfilled')

    def test_direct_http_paydata_is_carried_in_header_not_logged_json(self):
        if not self.cloud:return
        self.app.config['REQUEST_MODE']='direct_http'
        response=self.send('POST','/pay/order',{'plan_id':'month','code':'alice'})
        self.assertEqual(response.json['statusCode'],201)
        self.assertNotIn('payData',response.json['data'])
        self.assertEqual(json.loads(response.headers['X-Palm-Pay-Data'])['mode'],'short_series_goods')


class SQLitePayments(PaymentContract,unittest.TestCase):pass
class CloudPayments(PaymentContract,unittest.TestCase):cloud=True


class SignatureTests(unittest.TestCase):
    def test_only_observed_not_found_response_is_classified_as_absence(self):
        from palm.wechat_pay_client import fetch_json
        for code, message, missing in [(268490002,'数据不存在rid:abcdef',True),
                                       (268490002,'数据不存在',True),
                                       (268490002,'参数错误',False),
                                       (268490002,'数据不存在其他说明',False),
                                       (268490003,'数据不存在rid:abcdef',False)]:
            with patch('palm.wechat_pay_client.urllib.request.build_opener') as opener:
                opener.return_value.open.return_value.__enter__.return_value.read.return_value=json.dumps({'errcode':code,'errmsg':message}).encode()
                with self.assertRaises(PaymentProviderError) as caught:
                    fetch_json('/xpay/query_order')
                self.assertEqual(caught.exception.order_not_found,missing)
    def test_parameter_error_detail_preserves_reason_but_redacts_credentials_and_identifiers(self):
        from palm.wechat_pay_client import fetch_json, payment_error_response
        app = __import__('palm').create_app({'TESTING':True,'WECHAT_APP_SECRET':'private-secret', 'PAY_APP_KEY':'private-key'})
        body = p.raw_json({'openid':'owner-alice', 'env':0, 'order_id':'P'+'a'*30})
        upstream = {'errcode':268490002,'errmsg':'invalid order_id P'+'a'*30+' for owner-alice private-key private-secret access_token=short-token "session_key":"short-key" https://example.test/?secret=hidden'}
        with app.app_context(), patch('palm.wechat_pay_client.urllib.request.build_opener') as opener:
            opener.return_value.open.return_value.__enter__.return_value.read.return_value = json.dumps(upstream).encode()
            with self.assertRaises(PaymentProviderError) as caught:
                fetch_json('/xpay/query_order', {'access_token':'short-token','pay_sig':'query-signature'}, body)
            with self.assertLogs(app.logger, level='WARNING') as logs:
                response, status = payment_error_response(caught.exception)
            self.assertEqual(status,503)
            self.assertIn('invalid order_id', response.json['wechat_error_detail'])
            self.assertLessEqual(len(response.json['wechat_error_detail']),180)
            visible = response.get_data(as_text=True) + str(logs.output)
            for secret in ('owner-alice','P'+'a'*30,'private-key','private-secret','short-token','short-key','query-signature','example.test'):
                self.assertNotIn(secret,visible)
            self.assertNotIn('invalid order_id',str(logs.output))

    def test_provider_error_detail_is_bounded_and_optional(self):
        from palm.wechat_pay_client import safe_provider_detail
        self.assertEqual(safe_provider_detail(None),'')
        self.assertLessEqual(len(safe_provider_detail('参数错误\n'*5000)),180)
        self.assertNotIn('\n',safe_provider_detail('参数错误\n继续'))

    def test_provider_rejection_keeps_stage_and_error_code_without_raw_message(self):
        from palm.wechat_pay_client import fetch_json
        for path, stage in [('/cgi-bin/token','access_token'), ('/xpay/query_order','query_order')]:
            with patch('palm.wechat_pay_client.urllib.request.build_opener') as opener:
                opener.return_value.open.return_value.__enter__.return_value.read.return_value = b'{"errcode":268490003,"errmsg":"private response"}'
                with self.assertRaises(PaymentProviderError) as caught:
                    fetch_json(path)
                self.assertEqual(caught.exception.code, 268490003)
                self.assertEqual(caught.exception.stage, stage)
                self.assertNotIn('private response', str(caught.exception))

    def test_expired_access_token_refreshes_once_without_resigning_or_changing_body(self):
        app=__import__('palm').create_app({'TESTING':True,'PAY_APP_KEY':'key'})
        with app.app_context(),patch('palm.wechat_pay_client.fetch_json') as fetch:
            client=WeChatPayClient();client.access_token=Mock(side_effect=['old','new'])
            fetch.side_effect=[PaymentProviderError('expired',42001),{'errcode':0,'order':{'status':1}}]
            client.query_order({'openid':'owner','id':'P'+'a'*30})
            first,second=[c.args for c in fetch.call_args_list]
            self.assertEqual(first[2],second[2]);self.assertEqual(first[1]['pay_sig'],second[1]['pay_sig'])
            self.assertEqual(second[1]['access_token'],'new')

    def test_natural_months_clamp_and_preserve_beijing_clock(self):
        start=int(datetime(2024,1,31,23,45,tzinfo=p.BEIJING).timestamp())
        self.assertEqual(datetime.fromtimestamp(p.add_months(start,1),p.BEIJING).isoformat(),'2024-02-29T23:45:00+08:00')
        leap=int(datetime(2024,2,29,12,tzinfo=p.BEIJING).timestamp())
        self.assertEqual(datetime.fromtimestamp(p.add_months(leap,12),p.BEIJING).day,28)

    def test_query_signs_the_exact_body_that_is_sent(self):
        app=__import__('palm').create_app({'TESTING':True,'PAY_APP_KEY':'key'})
        with app.app_context(),patch('palm.wechat_pay_client.fetch_json') as fetch:
            client=WeChatPayClient();client.access_token=Mock(return_value='token')
            fetch.return_value={'errcode':0,'order':{'status':1}}
            client.query_order({'openid':'用户','id':'P'+'a'*30})
            path,query,raw=fetch.call_args.args
            self.assertEqual(path,'/xpay/query_order')
            self.assertEqual(query['pay_sig'],hmac.new(b'key',('/xpay/query_order&'+raw).encode(),hashlib.sha256).hexdigest())
            self.assertEqual(json.loads(raw)['env'],0)
            self.assertNotIn(' ',raw)
