"""Member accounting and access contracts on both persistence providers."""
import time
import unittest
from unittest.mock import patch
from flask import g
from test_purchases import PurchasesContract
from test_cash_ledger import LedgerContract
from palm.membership import grant_test_membership, put
from palm.database import get_db


class MemberContract:
    setUp = PurchasesContract.setUp
    send = PurchasesContract.send
    manual = LedgerContract.manual
    enable = LedgerContract.enable
    plan = PurchasesContract.plan
    latest = PurchasesContract.latest
    item = LedgerContract.item

    def test_retired_stickers_are_hidden_without_rewriting_legacy_appearance(self):
        from palm.membership import get
        user=self.send('GET','/auth/me').json['user']['id']
        with self.app.app_context():
            g.user_id=user
            if self.cloud:
                from palm.cloud_runtime import begin
                begin()
            put('appearance','current',{'theme':'sage','template':'journal','sticker':'cat'})
            if self.cloud:self.db.finish_transaction(g.pop('cloud_tx'),commit=True)
            else:get_db().commit()
        value=self.send('GET','/member/appearance').json
        self.assertEqual(value['saved']['sticker'],'')
        self.assertEqual(value['effective']['sticker'],'')
        self.assertEqual(value['saved']['revision'],1)
        self.assertEqual(self.send('GET','/membership').json['catalog']['stickers'],[])
        with self.app.app_context():
            g.user_id=user
            self.assertEqual(get('appearance','current')['sticker'],'cat')
        changed=self.send('PUT','/member/appearance',{'theme':'blue','template':'simple','sticker':{'ignored':'legacy'}},revision=1)
        self.assertEqual(changed.status_code,200,changed.json)
        self.assertEqual(changed.json['effective']['sticker'],'')
        with self.app.app_context():
            g.user_id=user
            self.assertNotIn('sticker',get('appearance','current'))

    def test_free_appearance_preserves_all_options_after_expiry_and_isolates_accounts(self):
        values={'theme':'blue','template':'simple','sticker':'fish'}
        first=self.send('PUT','/member/appearance',values,revision=0,key='free-appearance-repeat')
        self.assertEqual(first.status_code,200,first.json)
        repeat=self.send('PUT','/member/appearance',values,revision=0,key='free-appearance-repeat')
        self.assertEqual(first.json,repeat.json)
        self.assertEqual(self.send('PUT','/member/appearance',values,revision=0).status_code,409)
        self.assertEqual(self.send('GET','/member/appearance',token=self.bob).json['effective']['theme'],'default')
        for status in ('active','expired'):
            self.grant(status)
            result=self.send('GET','/membership').json
            self.assertEqual(result['appearance']['effective']['theme'],'blue')
            self.assertNotIn('appearance',result['entitlements'])
        self.assertEqual(self.send('PUT','/member/appearance',{**values,'theme':'invalid'},revision=1).status_code,400)
        self.assertEqual(self.send('GET','/member/appearance',anonymous=True).status_code,401)
        self.assertEqual(self.send('PUT','/member/appearance',values,revision=1,anonymous=True).status_code,401)
        self.assertEqual(self.send('PUT','/member/budget',{'month':'2026-10','total':'100'},revision=0).status_code,403)

    def test_expiry_during_transaction_rolls_back_and_offline_tool_rejects_production(self):
        self.grant()
        with patch('palm.membership.state', side_effect=[{'active': True}, {'active': False}]):
            r = self.send('POST', '/member/books', {'name': '操作途中到期'})
        self.assertEqual(r.status_code, 403, r.json)
        self.assertEqual(len(self.send('GET', '/member/books').json['books']), 1)
        with self.app.app_context():
            self.app.testing = False
            try:
                with self.assertRaises(RuntimeError):
                    grant_test_membership(1)
            finally:
                self.app.testing = True

    def test_atomic_move_invalid_inputs_and_source_updates_preserve_metadata(self):
        self.grant(); self.enable(); b = self.new_book(); a = self.manual(); c = self.manual(amount='4')
        r = self.send('POST', '/member/entries/move', {'book_id': b['id'], 'entries': [{'id':a['id'],'revision':0},{'id':c['id'],'revision':5}]})
        self.assertEqual(r.status_code,409)
        self.assertEqual(self.send('GET','/ledger/entries/'+a['id']).json['book_id'],'default')
        for invalid in [None, 25, [], {}]:
            self.assertEqual(self.send('POST','/member/entries/move',{'book_id':b['id'],'entries':[{'id':invalid,'revision':0}]}).status_code,400)
        item=self.item(payment_info={'mode':'paid','amount':'100','paid_on':'2025-01-01'})
        row=next(r for r in self.send('GET','/member/entries').json['entries'] if r['source']=='purchase')
        self.assertEqual(self.send('POST','/member/entries/move',{'book_id':b['id'],'entries':[{'id':row['id'],'revision':0}]}).status_code,200)
        updated=self.send('PUT','/items/'+str(item['id']),{**item,'purchase_price':'120','payment_info':{'mode':'paid','amount':'120','paid_on':'2025-01-01'}},revision=item['revision'])
        self.assertEqual(updated.status_code,200,updated.json)
        row=self.send('GET','/ledger/entries/'+row['id']).json
        self.assertEqual(row['amount'],'120.00');self.assertEqual(row['book_id'],b['id'])

    def test_removed_calendar_routes_are_unavailable_without_mutating_subscriptions(self):
        self.grant();plan=self.plan()
        for method,path,data in [('GET','/member/bills?month=2025-01',None),('POST',f"/member/bills/{plan['id']}/confirm",{'amount':'10','paid_on':'2025-01-31','cycle_index':0}),('PUT',f"/member/plans/{plan['id']}/book",{'book_id':'default'})]:
            self.assertEqual(self.send(method,path,data).status_code,404)
        self.assertEqual(len(self.latest(plan)['payments']),0)
        self.assertEqual(self.send('GET','/membership').json['entitlements'],['ad_free','unlimited_items','books','budgets'])

    def legacy_routing(self, plan, target):
        # Existing routing written by a previous release must survive retirement.
        with self.app.app_context():
            g.user_id=1
            if self.cloud:
                from palm.cloud_runtime import begin
                begin()
            put('plan',plan['id'],{'book_id':target})
            if self.cloud:self.db.finish_transaction(g.pop('cloud_tx'),commit=True)
            else:get_db().commit()

    def test_budget_boundary_validation_and_archived_books(self):
        self.grant();self.enable();b=self.new_book();self.manual(book_id=b['id'],amount='80')
        r=self.send('PUT','/member/budget',{'month':'2025-01','book_id':b['id'],'total':'100','categories':{'food':'50'}},revision=0)
        self.assertEqual(r.json['total']['status'],'near');self.assertEqual(r.json['categories'][0]['over_cents'],3000)
        self.assertEqual(self.send('PUT','/member/budget',{'month':'2025-01','book_id':b['id'],'total':'-1'},revision=r.json['revision']).status_code,400)
        self.send('PUT','/member/books/'+b['id'],{**b,'archived':True},revision=0)
        report=self.send('GET','/member/budget?month=2025-01&book_id='+b['id'])
        self.assertEqual(report.json['total']['used_cents'],8000)
        self.grant('expired')
        self.assertEqual(self.send('GET','/member/budget?month=2025-01&book_id='+b['id']).json['total']['limit_cents'],10000)

    def grant(self, status='active'):
        user = self.send('GET', '/auth/me').json['user']['id']
        with self.app.app_context():
            if self.cloud:
                from palm.cloud_runtime import begin
                begin()
            grant_test_membership(user, status)
            if self.cloud:
                self.db.finish_transaction(g.pop('cloud_tx'), commit=True)
            else:
                get_db().commit()

    def new_book(self):
        result = self.send('POST', '/member/books', {'name': '旅行', 'cover': 'travel'})
        self.assertEqual(result.status_code, 201, result.json)
        return result.json

    def test_free_paid_expired_and_no_grant_route(self):
        r = self.send('GET', '/membership').json
        self.assertEqual([p['price_cents'] for p in r['plans']], [390, 990])
        self.assertFalse(r['active']); self.assertFalse(r['payment_open'])
        self.assertEqual(self.send('POST', '/member/books', {'name': '私有'}).status_code, 403)
        self.assertEqual(self.send('POST', '/membership/grant', {}).status_code, 404)
        self.grant(); self.assertTrue(self.send('GET', '/membership').json['active'])
        b = self.new_book()
        self.enable()
        row = self.manual(book_id=b['id'])
        self.assertEqual(row['book_id'], b['id'])
        self.grant('expired')
        self.assertEqual(self.send('GET', '/membership').json['status'], 'expired')
        self.assertEqual(self.send('GET', '/ledger/entries/' + row['id']).json['book_id'], b['id'])
        self.assertEqual(self.send('POST', '/member/entries/move', {'book_id': 'default', 'entries': [{'id': row['id'], 'revision': 0}]}).status_code, 403)
        self.assertEqual(self.manual()['book_id'], 'default')
        self.assertEqual(self.send('POST', '/ledger/entries', {'kind': 'expense','category':'food','amount':'1','occurred_on':'2025-01-13','book_id':b['id']}).status_code,403)

    def test_deleted_plan_routing_does_not_lock_empty_book_or_orphan_payment_metadata(self):
        self.grant(); b = self.new_book(); plan = self.plan()
        self.legacy_routing(plan,b['id'])
        self.assertEqual(self.send('DELETE', f"/fixed-expenses/{plan['id']}", revision=0).status_code, 204)
        self.assertEqual(self.send('DELETE', '/member/books/' + b['id'], revision=0).status_code, 204)
        b = self.new_book(); plan = self.plan()
        self.legacy_routing(plan,b['id'])
        # Actual payment made before the user has enabled the cash ledger.
        paid = self.send('POST', f"/fixed-expenses/{plan['id']}/payments", {'amount':'10','paid_on':'2025-01-31','cycle_index':0}, revision=0)
        self.assertEqual(paid.status_code, 201, paid.json)
        self.legacy_routing(plan,'default')
        self.assertEqual(self.send('DELETE', '/member/books/' + b['id'], revision=0).status_code, 409)

    def test_book_refund_routing_move_and_isolation(self):
        self.grant(); self.enable(); b = self.new_book(); row = self.manual()
        route = '/ledger/entries/' + row['id']
        refund = self.send('POST', route + '/refunds', {'amount':'8','occurred_on':'2025-02-01'}, revision=row['revision']).json
        moved = self.send('POST','/member/entries/move',{'book_id':b['id'],'entries':[{'id':row['id'],'revision':0}]})
        self.assertEqual(moved.status_code,200,moved.json)
        self.assertEqual(self.send('GET','/ledger/entries/'+refund['id']).json['book_id'],b['id'])
        stats=self.send('GET','/ledger/statistics?month=2025-01&book_id='+b['id']).json
        self.assertEqual(stats['summary']['expense'],'28.00')
        self.assertEqual(self.send('GET','/ledger/statistics?month=2025-01&book_id=default').json['summary']['count'],0)
        self.assertEqual(self.send('GET','/ledger/statistics?month=2025-01').json['summary']['count'],1)
        self.assertEqual(self.send('POST','/member/entries/move',{'book_id':b['id'],'entries':[{'id':row['id'],'revision':0}]}).status_code,409)
        self.assertEqual(self.send('GET','/member/books',token=self.bob).json['books'][0]['count'],0)
        self.assertEqual(self.send('PUT','/member/books/'+b['id'],{'name':'盗取'},revision=0,token=self.bob).status_code,403)
        self.assertEqual(self.send('DELETE','/member/books/'+b['id'],revision=0).status_code,409)
        self.assertEqual(self.send('PUT','/member/books/'+b['id'],{**b,'archived':True},revision=0).status_code,200)

    def test_budget_refund_zero_and_base_statistics(self):
        self.grant();self.enable();row=self.manual(amount='100')
        r=self.send('PUT','/member/budget',{'month':'2025-01','book_id':'all','total':'100','categories':{'food':'120'}},revision=0)
        self.assertEqual(r.status_code,200,r.json)
        self.assertEqual(r.json['total']['status'],'over');self.assertTrue(r.json['category_over_total'])
        self.send('POST','/ledger/entries/'+row['id']+'/refunds',{'amount':'60','occurred_on':'2025-02-01'},revision=row['revision'])
        feb=self.send('PUT','/member/budget',{'month':'2025-02','book_id':'all','copy_previous':True},revision=0)
        self.assertEqual(feb.json['total']['used_cents'],-6000)
        self.assertEqual(feb.json['total']['status'],'refund_surplus')
        self.assertEqual(feb.json['total']['remaining_cents'],16000)
        result=self.send('GET','/ledger/statistics?month=2025-02')
        self.assertEqual(result.status_code,200,result.json)
        self.assertEqual(result.json['summary']['expense'],'60.00')
        self.assertEqual(result.json['summary']['expense_label'],'本月退款结余')
        self.assertEqual(self.send('PUT','/member/budget',{'month':'2025-01','total':'-1'},revision=0).status_code,409)

    def test_removed_tag_analysis_routes_preserve_history_and_appearance(self):
        self.grant();self.enable();row=self.manual()
        user=self.send('GET','/auth/me').json['user']['id']
        with self.app.app_context():
            g.user_id=user
            if self.cloud:
                from palm.cloud_runtime import begin
                begin()
            put('tag','legacy',{'name':'历史标签'})
            put('preset','legacy',{'name':'历史方案','filters':{'tags':['legacy']}})
            put('entry',row['id'],{'book_id':'default','tags':['legacy']})
            if self.cloud:self.db.finish_transaction(g.pop('cloud_tx'),commit=True)
            else:get_db().commit()
        for method,path,data in [('GET','/member/tags',None),('POST','/member/tags',{'name':'新标签'}),('PUT','/member/tags/legacy',{'name':'改名'}),('PUT','/member/entries/'+row['id']+'/tags',{'tags':[]}),('POST','/member/analysis/run',{}),('GET','/member/analysis-presets',None),('POST','/member/analysis-presets',{}),('DELETE','/member/analysis-presets/legacy',None)]:
            self.assertEqual(self.send(method,path,data).status_code,404,path)
        entry=self.send('GET','/ledger/entries/'+row['id']).json
        self.assertNotIn('tags',entry);self.assertEqual(entry['book_id'],'default');self.assertEqual(entry['member_revision'],1)
        from palm.membership import get
        with self.app.app_context():
            g.user_id=user
            self.assertEqual(get('tag','legacy')['name'],'历史标签')
            self.assertEqual(get('preset','legacy')['name'],'历史方案')
            self.assertEqual(get('entry',row['id'])['tags'],['legacy'])
        a=self.send('PUT','/member/appearance',{'theme':'sage','template':'journal','sticker':'cat'},revision=0)
        self.assertEqual(a.status_code,200,a.json)
        self.grant('expired');a=self.send('GET','/member/appearance').json
        self.assertEqual(a['effective']['theme'],'sage');self.assertEqual(a['saved']['theme'],'sage')

    def test_free_single_payment_receipts_and_legacy_routing_survive_calendar_removal(self):
        self.grant();self.enable();b=self.new_book();p=self.plan(anchor_on='2025-01-31')
        self.legacy_routing(p,b['id'])
        data={'amount':'10','paid_on':'2025-01-31','cycle_index':0}
        route=f"/fixed-expenses/{p['id']}/payments"
        first=self.send('POST',route,data,revision=p['revision'],key='free-payment-repeat-0001')
        second=self.send('POST',route,data,revision=p['revision'],key='free-payment-repeat-0001')
        self.assertEqual(first.status_code,201,first.json);self.assertEqual(first.json,second.json)
        self.assertEqual(self.send('GET','/ledger/statistics?month=2025-01&book_id='+b['id']).json['summary']['expense'],'10.00')
        self.grant('expired');latest=self.latest(p)
        paid=self.send('POST',route,{'amount':'10','paid_on':'2025-02-28','cycle_index':1},revision=latest['revision'])
        self.assertEqual(paid.status_code,201,paid.json)
        self.assertEqual(self.send('GET','/ledger/statistics?month=2025-02&book_id=default').json['summary']['expense'],'10.00')
        self.assertEqual(len(self.latest(p)['payments']),2)


class SQLiteMemberTest(MemberContract,unittest.TestCase):
    cloud=False


class CloudMemberTest(MemberContract,unittest.TestCase):
    cloud=True


if __name__=='__main__':
    unittest.main()
