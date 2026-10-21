"""Both storage providers must preserve conversion and explicit-payment semantics."""
import sys
import tempfile
import unittest
from pathlib import Path
from datetime import date
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from palm import create_app, initialize_app
from palm.purchases import cycle_date
from test_cloud_backend import MemoryDocuments


class PurchasesContract:
    cloud = False
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='palm-purchases-')
        self.addCleanup(self.temp.cleanup)
        self.counter = 0
        self.db = MemoryDocuments()
        config = {'TESTING': True, 'DATABASE': str(Path(self.temp.name) / 'test.db'),
                  'PHOTO_DIR': str(Path(self.temp.name) / 'photos'),
                  'WECHAT_CODE_EXCHANGER': lambda code: 'owner-' + code}
        if self.cloud:
            config.update(STORAGE_BACKEND='cloudbase', BRIDGE_SECRET='x' * 48, CLOUDBASE_CLIENT=self.db)
        self.app = initialize_app(create_app(config))
        self.client = self.app.test_client()
        self.token = self.send('POST', '/auth/login', {'code': 'alice'}, anonymous=True).json['token']
        self.bob = self.send('POST', '/auth/login', {'code': 'bob'}, anonymous=True).json['token']

    def send(self, method, path, data=None, revision=None, key=None, token=None, anonymous=False, client=None):
        self.counter += 1
        headers = {'X-Palm-Bridge': 'x' * 48}
        if not anonymous:
            headers['Authorization'] = 'Bearer ' + (token or self.token)
        if method != 'GET': headers['Idempotency-Key'] = key or f'purchase-request-{self.counter:08d}'
        if revision is not None: headers['If-Match'] = '"' + str(revision) + '"'
        return (client or self.client).open('/api/mp' + path, method=method, json=data, headers=headers)

    def item(self, name='耳机', price='100.00'):
        r = self.send('POST', '/items', {'name':name,'category':'数码','icon_type':'digital',
                      'purchase_date':'2025-01-01','purchase_price':price,'status':'active'})
        self.assertEqual(r.status_code, 201, r.json)
        return r.json

    def wish(self, **extra):
        r = self.send('POST', '/wishlist', {'name':'耳机','category':'数码','reason':'降噪',**extra})
        self.assertEqual(r.status_code,201,r.json)
        return r.json

    def plan(self, **extra):
        r = self.send('POST','/fixed-expenses',{'name':'AI 会员','kind':'subscription','amount':'10.00',
                     'cycle':'month','anchor_on':'2025-01-31','status':'active',**extra})
        self.assertEqual(r.status_code,201,r.json)
        return r.json

    def pay(self, plan, **extra):
        r = self.send('POST',f"/fixed-expenses/{plan['id']}/payments",{'paid_on':'2025-02-01','amount':'10.00',
                      'principal':'0','cycle_index':plan['next_cycle_index'],**extra},revision=plan['revision'])
        self.assertEqual(r.status_code,201,r.json)
        return r.json

    def latest(self, plan):
        return self.send('GET',f"/fixed-expenses/{plan['id']}").json

    def test_wish_similarity_optional_date_and_isolation(self):
        item = self.item()
        self.item(' 耳 机！')
        wish = self.wish()
        self.assertIsNone(wish['review_days'])
        self.assertEqual(wish['expected_price'],'')
        self.assertEqual(wish['similar_items'][0]['match_reason'],'名称相同')
        self.assertEqual(len(wish['similar_items']),2)
        self.assertEqual(self.send('GET','/wishlist',token=self.bob).json,[])
        self.assertEqual(self.send('GET',f"/wishlist/{wish['id']}",token=self.bob).status_code,404)
        self.assertEqual(self.send('POST','/fixed-expenses',{'name':'跨账号','amount':'1','anchor_on':'2025-01-01','item_id':item['id']},token=self.bob).status_code,404)

    def test_conversion_is_durable_and_not_repeated_even_with_new_key(self):
        wish=self.wish(expected_price='80.00')
        form={'name':'耳机','category':'数码','purchase_date':'2025-02-01','purchase_price':'90.00','notes':'降噪'}
        a=self.send('POST',f"/wishlist/{wish['id']}/convert",form,revision=wish['revision'],key='same-conversion-0001')
        b=self.send('POST',f"/wishlist/{wish['id']}/convert",form,revision=wish['revision'],key='same-conversion-0001')
        c=self.send('POST',f"/wishlist/{wish['id']}/convert",form,revision=wish['revision'])
        self.assertEqual(a.status_code,201,a.json)
        self.assertEqual(a.json,b.json)
        self.assertEqual(a.json['id'],c.json['id'])
        self.assertEqual(len(self.send('GET','/items').json),1)
        saved=self.send('GET',f"/wishlist/{wish['id']}").json
        self.assertEqual(saved['status'],'purchased')
        self.assertEqual(a.json['purchase_price'],'90.00')
        self.assertEqual(self.send('DELETE',f"/wishlist/{wish['id']}",revision=saved['revision']).status_code,204)
        self.assertEqual(len(self.send('GET','/items').json),1)

    def test_wish_version_and_decline(self):
        wish=self.wish(review_on='2026-10-10')
        changed=self.send('PUT',f"/wishlist/{wish['id']}",{'name':'相机','status':'declined'},revision=wish['revision'])
        self.assertEqual(changed.status_code,200,changed.json)
        stale=self.send('PUT',f"/wishlist/{wish['id']}",{'name':'旧名称'},revision=wish['revision'])
        self.assertEqual(stale.status_code,409,stale.json)
        self.assertEqual(self.send('GET',f"/wishlist/{wish['id']}").json['status'],'declined')

    def test_plan_alone_is_not_cost_and_paid_cost_flows_through_all_totals(self):
        item=self.item()
        plan=self.plan(item_id=item['id'])
        self.assertEqual(self.send('GET',f"/items/{item['id']}").json['net_cost'],'100.00')
        self.pay(plan)
        result=self.send('GET',f"/items/{item['id']}").json
        self.assertEqual(result['fixed_expense_total'],'10.00')
        self.assertEqual(result['net_cost'],'110.00')
        self.assertEqual(self.send('GET','/stats').json['net_cost_total'],'110.00')
        report=self.send('GET','/reports/monthly?month=2025-02').json
        self.assertEqual(report['totals']['fixed_expense_total'],'10.00')
        self.assertEqual(report['totals']['cashflow_net'],'10.00')
        self.assertEqual(report['memories'],[])
        self.assertEqual(self.latest(plan)['next_due_on'],'2025-02-28')

    def test_payment_duplicate_edit_void_and_rollback(self):
        item=self.item();plan=self.plan(item_id=item['id'])
        payment=self.pay(plan)
        duplicate=self.send('POST',f"/fixed-expenses/{plan['id']}/payments",{'paid_on':'2025-02-01','amount':'10','principal':'0','cycle_index':0},revision=plan['revision'])
        self.assertEqual(duplicate.status_code,409)
        plan=self.latest(plan)
        updated=self.send('PUT',f"/fixed-expenses/{plan['id']}/payments/{payment['id']}",{'paid_on':'2025-02-02','amount':'15'},revision=plan['revision'])
        self.assertEqual(updated.status_code,200,updated.json)
        self.assertEqual(self.send('GET',f"/items/{item['id']}").json['net_cost'],'115.00')
        plan=self.latest(plan)
        voided=self.send('DELETE',f"/fixed-expenses/{plan['id']}/payments/{payment['id']}",revision=plan['revision'])
        self.assertEqual(voided.status_code,200)
        self.assertEqual(self.send('GET',f"/items/{item['id']}").json['net_cost'],'100.00')
        self.assertEqual(self.latest(plan)['next_cycle_index'],0)
        plan=self.latest(plan)
        invalid=self.send('POST',f"/fixed-expenses/{plan['id']}/payments",{'paid_on':'2025-02-01','amount':'10','principal':'0','cycle_index':0,'service_until':'bad-date'},revision=plan['revision'])
        self.assertEqual(invalid.status_code,400)
        self.assertEqual(len(self.latest(plan)['payments']),1)
        self.assertEqual(self.latest(plan)['paid_cost'],'0.00')

    def test_installment_principal_remainder_fee_and_overpayment(self):
        item=self.item(price='100.01')
        plan=self.plan(kind='installment',amount='2.00',principal_total='100.01',periods=3,item_id=item['id'])
        for principal in ('33.33','33.33','33.35'):
            self.assertEqual(plan['suggested_principal'],principal)
            self.pay(plan,principal=principal,amount='2.00')
            plan=self.latest(plan)
        self.assertTrue(plan['completed'])
        self.assertEqual(plan['remaining_principal'],'0.00')
        self.assertEqual(self.send('GET',f"/items/{item['id']}").json['net_cost'],'106.01')
        report=self.send('GET','/reports/monthly?month=2025-02').json
        self.assertEqual(report['totals']['installment_principal_total'],'100.01')
        self.assertEqual(report['totals']['cashflow_net'],'6.00')
        plan2=self.plan(kind='installment',principal_total='9',periods=3)
        bad=self.send('POST',f"/fixed-expenses/{plan2['id']}/payments",{'paid_on':'2025-02-01','amount':'0','principal':'10','cycle_index':0},revision=plan2['revision'])
        self.assertEqual(bad.status_code,400)

    def test_future_plan_edits_do_not_reassign_old_payments(self):
        first=self.item('电脑');second=self.item('手机')
        plan=self.plan(item_id=first['id']);self.pay(plan)
        plan=self.latest(plan)
        update=self.send('PUT',f"/fixed-expenses/{plan['id']}",{**plan,'item_id':second['id'],'amount':'20.00'},revision=plan['revision'])
        self.assertEqual(update.status_code,200,update.json)
        self.pay(update.json,amount='20.00')
        self.assertEqual(self.send('GET',f"/items/{first['id']}").json['fixed_expense_total'],'10.00')
        self.assertEqual(self.send('GET',f"/items/{second['id']}").json['fixed_expense_total'],'20.00')
        self.assertEqual(self.latest(plan)['paid_cost'],'30.00')

    def test_deleted_device_preserves_payment_and_restore_then_purge(self):
        item=self.item();plan=self.plan(item_id=item['id']);self.pay(plan)
        item=self.send('GET',f"/items/{item['id']}").json
        removed=self.send('DELETE',f"/items/{item['id']}",revision=item.get('revision'))
        self.assertEqual(removed.status_code,204)
        plan=self.latest(plan)
        self.assertTrue(plan['check_renewal']);self.assertFalse(plan['item_available'])
        self.pay(plan)
        itemrev=None
        if self.cloud:itemrev=self.db.get('palm_items',item['id'])['revision']
        restore=self.send('POST',f"/trash/{item['id']}/restore",revision=itemrev)
        self.assertEqual(restore.status_code,200,restore.json)
        self.assertEqual(restore.json['fixed_expense_total'],'20.00')
        self.send('DELETE',f"/items/{item['id']}",revision=restore.json.get('revision'))
        if self.cloud:itemrev=self.db.get('palm_items',item['id'])['revision']
        self.assertEqual(self.send('DELETE',f"/trash/{item['id']}",revision=itemrev).status_code,204)
        self.assertEqual(self.latest(plan)['paid_cost'],'20.00')
        self.assertEqual(self.send('GET','/fixed-expenses').json['totals']['cents'],'20.00')

    def test_pause_archive_and_foreign_payments(self):
        plan=self.plan();payment=self.pay(plan);plan=self.latest(plan)
        self.assertEqual(self.send('DELETE',f"/fixed-expenses/{plan['id']}",revision=plan['revision']).status_code,400)
        ended=self.send('PUT',f"/fixed-expenses/{plan['id']}",{**plan,'status':'ended'},revision=plan['revision'])
        self.assertEqual(ended.status_code,200,ended.json)
        self.assertEqual(self.send('POST',f"/fixed-expenses/{plan['id']}/payments",{},revision=ended.json['revision']).status_code,400)
        self.assertEqual(self.send('GET',f"/fixed-expenses/{plan['id']}",token=self.bob).status_code,404)
        self.assertEqual(self.send('DELETE',f"/fixed-expenses/{plan['id']}/payments/{payment['id']}",revision=ended.json['revision'],token=self.bob).status_code,404)

    def test_target_is_retired_and_read_fields_are_empty(self):
        item=self.item()
        self.assertEqual(item['milestones'],{'earned':[],'next':None})
        self.assertIsNone(item['daily_target'])
        self.assertEqual(self.send('PUT',f"/items/{item['id']}/daily-target",{'amount':'1'},revision=item.get('revision')).status_code,410)

    def test_invalid_dates_and_underpaid_installment_can_be_completed(self):
        self.assertEqual(self.send('POST','/wishlist',{'name':'测试','review_on':'20251010'}).status_code,400)
        plan=self.plan(kind='installment',principal_total='100.01',periods=3,amount='0')
        for amount in ['10','10','10']:
            self.pay(plan,principal=amount,amount='0');plan=self.latest(plan)
        self.assertFalse(plan['completed']);self.assertEqual(plan['remaining_principal'],'70.01')
        self.pay(plan,principal='70.01',amount='0');self.assertTrue(self.latest(plan)['completed'])

    def test_void_opens_original_cycle_and_keeps_snapshots(self):
        plan=self.plan();payment=self.pay(plan);plan=self.latest(plan)
        self.assertEqual(payment['cycle'],'month');self.assertEqual(payment['planned_amount'],'10.00')
        self.send('DELETE',f"/fixed-expenses/{plan['id']}/payments/{payment['id']}",revision=plan['revision'])
        fresh=self.latest(plan);self.assertEqual(fresh['next_cycle_index'],0)
        self.assertEqual(len(fresh['payments']),1);self.assertTrue(fresh['payments'][0]['voided'])

    def test_cycle_change_starts_at_next_unpaid_date_and_keeps_past_cycle(self):
        plan=self.plan();self.pay(plan);plan=self.latest(plan)
        changed=self.send('PUT',f"/fixed-expenses/{plan['id']}",{**plan,'cycle':'year'},revision=plan['revision'])
        self.assertEqual(changed.status_code,200,changed.json)
        self.assertEqual(changed.json['next_due_on'],'2025-02-28')
        self.assertEqual(self.latest(plan)['payments'][0]['cycle'],'month')


class SQLitePurchasesTest(PurchasesContract, unittest.TestCase):
    def test_two_clients_convert_concurrently(self):
        wish=self.wish()
        data={'name':'耳机','category':'数码','purchase_date':'2025-02-01','purchase_price':'90'}
        def worker(n):
            return self.send('POST',f"/wishlist/{wish['id']}/convert",data,revision=0,key=f'concurrent-convert-{n:03d}',client=self.app.test_client())
        with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(worker,range(2)))
        self.assertTrue(all(r.status_code in (200,201) for r in results),[r.json for r in results])
        self.assertEqual(results[0].json['id'],results[1].json['id'])
        self.assertEqual(len(self.send('GET','/items').json),1)


class CloudPurchasesTest(PurchasesContract, unittest.TestCase):
    cloud=True

    def test_conversion_and_payment_rollback_on_commit_failure(self):
        from palm.cloud_client import CloudBaseError
        wish=self.wish();finish=self.db.finish_transaction
        def failed(key,commit=False):
            if commit:
                finish(key,False)
                raise CloudBaseError(503,'INJECTED_FAILURE')
            return finish(key,False)
        with patch.object(self.db,'finish_transaction',side_effect=failed):
            result=self.send('POST',f"/wishlist/{wish['id']}/convert",{'name':'耳机','category':'数码','purchase_date':'2025-02-01','purchase_price':'90'},revision=0)
        self.assertEqual(result.status_code,503)
        self.assertEqual(self.send('GET','/items').json,[])
        self.assertEqual(self.send('GET',f"/wishlist/{wish['id']}").json['status'],'considering')
        plan=self.plan()
        with patch.object(self.db,'finish_transaction',side_effect=failed):
            result=self.send('POST',f"/fixed-expenses/{plan['id']}/payments",{'paid_on':'2025-02-01','amount':'10','cycle_index':0},revision=0)
        self.assertEqual(result.status_code,503);self.assertEqual(self.latest(plan)['paid_cost'],'0.00')

    def test_maintenance_detaches_history_in_bounded_batches(self):
        from palm.cloud_maintenance import run
        item=self.item();plan=self.plan(item_id=item['id']);self.pay(plan)
        item=self.send('GET',f"/items/{item['id']}").json
        self.send('DELETE',f"/items/{item['id']}",revision=item['revision'])
        revision=self.db.get('palm_items',item['id'])['revision']
        self.send('DELETE',f"/trash/{item['id']}",revision=revision)
        with self.app.app_context():
            self.assertLessEqual(run(max_operations=2),2)
        saved=self.latest(plan)
        self.assertIsNone(saved['item_id']);self.assertTrue(saved['check_renewal']);self.assertEqual(saved['item_name'],'耳机')
        self.assertIsNone(saved['payments'][0]['item_id']);self.assertEqual(saved['paid_cost'],'10.00')


class CalendarTest(unittest.TestCase):
    def test_month_end_keeps_original_anchor(self):
        plan={'anchor_on':'2024-01-31','cycle':'month'}
        self.assertEqual(cycle_date(plan,1),date(2024,2,29))
        self.assertEqual(cycle_date(plan,2),date(2024,3,31))
        self.assertEqual(cycle_date({'anchor_on':'2024-02-29','cycle':'year'},1),date(2025,2,28))
        self.assertEqual(cycle_date({'anchor_on':'2024-01-31','cycle':'quarter'},1),date(2024,4,30))
        self.assertEqual(cycle_date({'anchor_on':'2024-01-31','cycle':'days','cycle_days':10},1),date(2024,2,10))


if __name__=='__main__':unittest.main()
