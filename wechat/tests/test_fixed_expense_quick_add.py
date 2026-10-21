"""Atomic first payment and reversible source cash flow, with both storage providers."""
import unittest
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from test_purchases import PurchasesContract

class QuickAddContract:
    setUp = PurchasesContract.setUp
    send = PurchasesContract.send
    plan = PurchasesContract.plan
    pay = PurchasesContract.pay
    latest = PurchasesContract.latest
    item = PurchasesContract.item

    def initial(self, **extra):
        return {'paid_on':'2025-02-01','amount':'10.00','principal':'0.00','enable_ledger':True,**extra}

    def form(self, **extra):
        return {'name':'云空间','kind':'subscription','amount':'10.00','cycle':'month',
                'anchor_on':'2025-01-31','status':'active',**extra}

    def cash(self, month='2025-02'):
        result=self.send('GET','/ledger/entries?month='+month)
        self.assertEqual(result.status_code,200,result.json)
        return result.json

    def create(self, **extra):
        result=self.send('POST','/fixed-expenses',self.form(initial_payment=extra.pop('initial_payment',self.initial()),**extra))
        self.assertEqual(result.status_code,201,result.json)
        return result.json

    def test_plain_plan_and_explicit_enabling_are_distinct(self):
        self.assertEqual(self.send('GET','/auth/me').json['capabilities']['fixed_expense_quick_add'],1)
        plain=self.plan()
        self.assertFalse(plain['initial_payment_created'])
        self.assertFalse(self.send('GET','/ledger/settings').json['enabled'])
        self.assertEqual(plain['next_cycle_index'],0)
        bad=self.send('POST','/fixed-expenses',self.form(initial_payment=self.initial(enable_ledger=False)))
        self.assertEqual(bad.status_code,400,bad.json)
        self.assertEqual(len(self.send('GET','/fixed-expenses').json['plans']),1)
        self.assertFalse(self.send('GET','/ledger/settings').json['enabled'])
        created=self.create()
        self.assertTrue(created['initial_payment_created'])
        self.assertEqual(created['revision'],1)
        self.assertEqual(created['next_due_on'],'2025-02-28')
        self.assertEqual(created['paid_cost'],'10.00')
        self.assertEqual(len(self.latest(created)['payments']),1)
        entry=self.cash()['entries'][0]
        self.assertEqual(entry['source_id'],created['initial_payment_id'])
        self.assertFalse(entry['editable']);self.assertTrue(entry['deletable'])
        self.assertEqual(entry['amount'],'10.00')

    def test_first_payment_replay_is_one_transaction_and_keeps_actual_date(self):
        form=self.form(anchor_on='2025-12-31',initial_payment=self.initial(paid_on='2025-12-29',amount='9.99'))
        first=self.send('POST','/fixed-expenses',form,key='quick-payment-replay-00001')
        replay=self.send('POST','/fixed-expenses',form,key='quick-payment-replay-00001')
        self.assertEqual(first.status_code,201,first.json);self.assertEqual(first.json,replay.json)
        self.assertEqual(len(self.send('GET','/fixed-expenses').json['plans']),1)
        self.assertEqual(first.json['next_due_on'],'2026-01-31')
        self.assertEqual(self.cash('2025-12')['summary']['expense'],'9.99')
        self.assertEqual(self.latest(first.json)['payments'][0]['paid_on'],'2025-12-29')

    def test_invalid_first_payment_rolls_back_plan_setting_and_all_writes(self):
        for initial in [None,{},self.initial(paid_on='2099-01-01'),self.initial(amount='1.001'),
                        self.initial(amount='0'),self.initial(enable_ledger='true'),self.initial(cycle_index=1)]:
            r=self.send('POST','/fixed-expenses',self.form(initial_payment=initial))
            self.assertEqual(r.status_code,400,r.json)
            self.assertEqual(self.send('GET','/fixed-expenses').json['plans'],[])
            self.assertFalse(self.send('GET','/ledger/settings').json['enabled'])
        item=self.item()
        with patch('palm.membership.assign_payment',side_effect=RuntimeError('injected after ledger write')):
            with self.assertRaises(RuntimeError):
                self.send('POST','/fixed-expenses',self.form(item_id=item['id'],initial_payment=self.initial()))
        self.assertFalse(self.send('GET','/ledger/settings').json['enabled'])
        self.assertEqual(self.send('GET','/fixed-expenses').json['plans'],[])
        self.assertEqual(self.send('GET',f"/items/{item['id']}").json['net_cost'],'100.00')
        self.send('POST','/ledger/settings',{})
        self.assertEqual(self.cash()['entries'],[])

    def test_installment_cash_counts_principal_but_item_cost_does_not_duplicate_it(self):
        item=self.item(price='100.01')
        plan=self.create(kind='installment',principal_total='100.01',periods=3,amount='2.00',item_id=item['id'],initial_payment=self.initial(principal='33.32',amount='2.00'))
        # The actual principal is deliberately different from the suggested equal instalment.
        self.assertEqual(plan['paid_principal'],'33.32')
        self.assertEqual(plan['paid_cost'],'2.00')
        route='/ledger/entries/'+self.cash()['entries'][0]['id']
        entry=self.send('GET',route).json
        self.assertEqual(entry['amount'],'35.32')
        self.assertEqual(self.send('DELETE',route,revision=entry['revision']).status_code,200)
        paid=self.latest(plan)
        self.pay(paid,principal='33.33',amount='2.00')
        self.assertEqual(self.cash()['summary']['expense'],'35.33')
        self.assertEqual(self.send('GET',f"/items/{item['id']}").json['net_cost'],'102.01')
        self.assertEqual(self.latest(plan)['suggested_principal'],'33.33')

    def test_both_delete_routes_recompute_middle_cycle_and_keep_other_payments(self):
        self.send('POST','/ledger/settings',{})
        item=self.item(price='100.01')
        plan=self.plan(kind='installment',principal_total='100.01',periods=3,amount='2.00',item_id=item['id'])
        payments=[]
        for principal in ('33.33','33.33','33.35'):
            payments.append(self.pay(plan,principal=principal,amount='2.00'))
            plan=self.latest(plan)
        self.assertTrue(plan['completed'])
        middle=next(r for r in self.cash()['entries'] if r['source_id']==payments[1]['id'])
        route='/ledger/entries/'+middle['id']
        deleted=self.send('DELETE',route,revision=middle['revision'],key='middle-ledger-delete-0001')
        replay=self.send('DELETE',route,revision=middle['revision'],key='middle-ledger-delete-0001')
        self.assertEqual(deleted.status_code,200,deleted.json);self.assertEqual(deleted.json,replay.json)
        self.assertEqual(deleted.json['state'],'void');self.assertFalse(deleted.json['deletable'])
        changed=self.latest(plan)
        self.assertEqual(len(changed['payments']),3);self.assertFalse(changed['completed'])
        self.assertEqual(changed['next_cycle_index'],1);self.assertEqual(changed['paid_principal'],'66.68')
        self.assertEqual(changed['remaining_principal'],'33.33');self.assertEqual(changed['paid_cost'],'4.00')
        self.assertEqual(self.cash()['summary']['expense'],'70.68')
        self.assertEqual(self.send('GET',f"/items/{item['id']}").json['net_cost'],'104.01')
        self.assertEqual(self.send('DELETE',route,revision=deleted.json['revision']).status_code,409)
        source=self.send('DELETE',f"/fixed-expenses/{plan['id']}/payments/{payments[0]['id']}",revision=changed['revision'])
        self.assertEqual(source.status_code,200,source.json)
        self.assertEqual(self.latest(plan)['paid_principal'],'33.35')
        self.assertEqual(len(self.cash()['entries']),1)

    def test_refunds_block_both_routes_and_allow_delete_after_refund_void(self):
        plan=self.create(service_until='2025-12-31')
        entry=self.cash()['entries'][0];route='/ledger/entries/'+entry['id']
        refund=self.send('POST',route+'/refunds',{'amount':'1.00','occurred_on':'2025-02-02'},revision=entry['revision'])
        self.assertEqual(refund.status_code,201,refund.json)
        latest=self.send('GET',route).json
        self.assertEqual(self.send('DELETE',route,revision=latest['revision']).status_code,409)
        source=f"/fixed-expenses/{plan['id']}/payments/{plan['initial_payment_id']}"
        self.assertEqual(self.send('DELETE',source,revision=self.latest(plan)['revision']).status_code,409)
        self.assertFalse(self.latest(plan)['payments'][0]['voided'])
        self.assertEqual(self.send('DELETE','/ledger/entries/'+refund.json['id'],revision=refund.json['revision']).status_code,200)
        fresh=self.send('GET',route).json
        self.assertEqual(self.send('DELETE',route,revision=fresh['revision']).status_code,200)
        self.assertEqual(self.latest(plan)['service_until'],'2025-12-31')
        self.assertEqual(self.cash()['summary']['expense'],'0.00')

    def test_permissions_versions_and_edit_rejection(self):
        plan=self.create();entry=self.cash()['entries'][0];route='/ledger/entries/'+entry['id']
        self.send('POST','/ledger/settings',{},token=self.bob)
        self.assertEqual(self.send('DELETE',route,revision=entry['revision'],token=self.bob).status_code,404)
        self.assertEqual(self.send('DELETE',route,revision=99).status_code,409)
        self.assertEqual(self.send('PUT',route,{'amount':'1.00'},revision=entry['revision']).status_code,400)
        self.assertEqual(self.send('PUT',f"/fixed-expenses/{plan['id']}",self.form(initial_payment=self.initial()),revision=plan['revision']).status_code,400)
        self.assertEqual(self.latest(plan)['paid_cost'],'10.00')

    def test_concurrent_replay_and_delete_commit_once(self):
        form=self.form(initial_payment=self.initial())
        def create_worker(_):
            return self.send('POST','/fixed-expenses',form,key='parallel-quick-create-0001',client=self.app.test_client())
        with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(create_worker,range(2)))
        self.assertEqual([r.status_code for r in results],[201,201])
        self.assertEqual(results[0].json,results[1].json)
        self.assertEqual(len(self.send('GET','/fixed-expenses').json['plans']),1)
        entry=self.cash()['entries'][0]
        def remove_worker(n):
            return self.send('DELETE','/ledger/entries/'+entry['id'],revision=entry['revision'],key=f'parallel-payment-delete-{n}',client=self.app.test_client())
        with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(remove_worker,range(2)))
        self.assertEqual(sorted(r.status_code for r in results),[200,409])
        self.assertEqual(self.cash()['summary']['expense'],'0.00')
        self.assertEqual(len(self.latest(self.send('GET','/fixed-expenses').json['plans'][0])['payments']),1)

class SQLiteQuickAdd(QuickAddContract,unittest.TestCase):
    cloud=False

class CloudQuickAdd(QuickAddContract,unittest.TestCase):
    cloud=True
