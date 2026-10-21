"""Growth contracts: genuine progress, historical baseline and transactional claims."""
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from threading import Barrier
from flask import g
from test_rewards import RewardsContract
from palm import rewards, growth
from palm.database import get_db


class GrowthContract:
    cloud = False
    setUp = RewardsContract.setUp
    send = RewardsContract.send
    item = RewardsContract.item
    grant = RewardsContract.grant
    at = RewardsContract.at

    def stored(self, callback):
        owner = self.send('GET', '/auth/me').json['user']['id']
        with self.app.app_context():
            g.user_id = owner
            if self.cloud:
                from palm.cloud_runtime import begin
                begin()
            callback()
            if self.cloud:
                self.db.finish_transaction(g.pop('cloud_tx'), commit=True)
            else:
                get_db().commit()

    def remove_growth(self):
        key = rewards.doc_key(g.user_id, 'growth', 'current')
        if self.cloud:
            from palm.cloud_repository import remove
            remove('member_documents', key)
        else:
            get_db().execute('DELETE FROM member_documents WHERE id=?', (key,))

    def entry(self):
        response = self.send('POST', '/ledger/entries', {'kind':'expense', 'category':'food',
            'name':'早餐', 'amount':'6', 'occurred_on':'2026-10-18', 'operation_id':f'growth-entry-{self.counter:05d}'})
        self.assertEqual(response.status_code, 201, response.json)
        return response.json

    def test_midweek_gaps_progress_and_monday_reset(self):
        for date, count, amount in [('2026-10-13',1,5), ('2026-10-15',2,5), ('2026-10-18',3,5)]:
            with self.at(date+'T12:00:00'):
                result=self.send('POST','/rewards/checkin',{'date':date}).json
                self.assertEqual(result['awarded'],amount)
                self.assertEqual(result['checkin']['claimed_count'],count)
                again=self.send('POST','/rewards/checkin',{'date':date}).json
                self.assertTrue(again['already_claimed']); self.assertEqual(again['awarded'],0)
        with self.at('2026-10-19T00:00:00'):
            result=self.send('GET','/rewards').json
            self.assertEqual(result['balance'],15)
            self.assertEqual(result['checkin']['claimed_count'],0)
            self.assertEqual(result['checkin']['next_step'],1)

    def test_legacy_calendar_rewards_are_not_repaid_or_reclaimed(self):
        def legacy():
            rewards.add_reward(g.user_id,10,'每日签到','checkin:2026-10-17')
            rewards.write('checkin',{'date':'2026-10-17','amount':10},'2026-10-17')
        self.stored(legacy)
        with self.at('2026-10-17T20:00:00'):
            model=self.send('GET','/rewards').json
            self.assertEqual(model['checkin']['claimed_count'],1)
            self.assertEqual(model['checkin']['today_reward'],10)
            self.assertEqual(self.send('POST','/rewards/checkin',{'date':'2026-10-17'}).json['balance'],10)
        with self.at('2026-10-18T00:00:00'):
            result=self.send('POST','/rewards/checkin',{'date':'2026-10-18'}).json
            self.assertEqual(result['awarded'],5); self.assertEqual(result['balance'],15)

    def test_visit_is_not_signin_and_distinct_days_only(self):
        for offset in range(3):
            date=(datetime(2026,10,16)+timedelta(days=offset)).isoformat()
            with self.at(date):
                first=self.send('POST','/rewards/visit',{}).json
                again=self.send('POST','/rewards/visit',{}).json
                self.assertFalse(first['already_visited']); self.assertTrue(again['already_visited'])
                self.assertEqual(again['balance'],0)
                self.assertFalse(again['checkin']['today_claimed'])
        catalog=again['achievements']; self.assertEqual(catalog[0]['progress'],3)
        self.assertTrue(catalog[0]['achieved']);self.assertFalse(catalog[0]['claimed'])
        claim=self.send('POST','/rewards/achievements/visits_3/claim',{},key='growth-claim-repeat-0001')
        self.assertEqual(claim.json['balance'],10)
        self.assertEqual(self.send('POST','/rewards/achievements/visits_3/claim',{},key='growth-claim-repeat-0001').json,claim.json)
        self.assertTrue(self.send('POST','/rewards/achievements/visits_3/claim',{}).json['already_claimed'])
        self.assertEqual(self.send('GET','/rewards',token=self.bob).json['achievements'][0]['progress'],0)
        self.assertEqual(self.send('POST','/rewards/achievements/visits_7/claim',{}).status_code,400)
        self.assertEqual(self.send('POST','/rewards/achievements/bogus_1/claim',{}).status_code,400)
        self.assertEqual(self.send('POST','/rewards/visit',{},anonymous=True).status_code,401)

    def test_item_highwater_survives_delete_restore_and_existing_baseline(self):
        items=[self.item() for _ in range(5)]
        self.stored(self.remove_growth)  # simulate a pre-feature account
        self.send('POST','/rewards/visit',{})
        first=items[0]
        self.send('DELETE',f"/items/{first['id']}",revision=first['revision'])
        claim=self.send('POST','/rewards/achievements/items_5/claim',{})
        self.assertEqual(claim.status_code,200,claim.json);self.assertEqual(claim.json['balance'],10)
        for _ in range(2):
            trash=self.send('GET','/trash').json[0]
            restored=self.send('POST',f"/trash/{first['id']}/restore",{},revision=trash['revision']).json
            self.send('DELETE',f"/items/{first['id']}",revision=restored['revision'])
        model=self.send('GET','/rewards').json
        item_rows=[r for r in model['achievements'] if r['category']=='items']
        self.assertEqual(item_rows[0]['progress'],5);self.assertFalse(item_rows[1]['achieved'])
        self.assertEqual(model['balance'],10)

    def test_manual_ledger_highwater_and_exclusions(self):
        self.send('POST','/ledger/settings',{})
        entries=[self.entry() for _ in range(5)]
        self.stored(self.remove_growth)
        self.send('POST','/rewards/visit',{})
        self.send('DELETE','/ledger/entries/'+entries[0]['id'],revision=entries[0]['revision'])
        self.item()  # automated purchase entry must not count
        result=self.send('POST','/rewards/achievements/ledger_5/claim',{}).json
        self.assertEqual(result['balance'],10)
        rows=[r for r in result['achievements'] if r['category']=='ledger']
        self.assertEqual(rows[0]['progress'],5)
        self.assertFalse(rows[1]['achieved'])
        for row in [{'source':'refund','state':'active','kind':'expense'}, {'source':'manual','state':'void','kind':'expense'},
                    {'source':'manual','state':'linked','kind':'expense'}, {'source':'manual','state':'batch','kind':'expense'},
                    {'source':'manual','state':'active','kind':'income','imported':['id']}]:
            self.assertFalse(growth.eligible(row))

    def test_all_fourteen_tiers_claim_once_total_810_and_ads_do_not_pay(self):
        self.stored(lambda:rewards.write('growth',{'visits':90,'items':100,'ledger':300,'ledger_current':300,'claimed':[],'version':1}))
        initial=self.send('GET','/rewards').json
        self.assertEqual(initial['advertisement'],{'enabled':False,'reward':10,'used_today':0,'daily_limit':3})
        self.assertEqual(initial['invitation']['reward'],100)
        self.assertEqual(len(initial['achievements']),14)
        self.assertEqual(sum(r['reward'] for r in initial['achievements']),810)
        for row in initial['achievements']:
            result=self.send('POST','/rewards/achievements/'+row['id']+'/claim',{})
            self.assertEqual(result.status_code,200,result.json)
        self.assertEqual(result.json['balance'],810)
        history=self.send('GET','/rewards/transactions').json['transactions']
        self.assertEqual(len(history),14)
        self.assertEqual(self.send('POST','/rewards/advertisement',{}).status_code,404)

    def test_simultaneous_claim_or_visit_is_exactly_once(self):
        self.stored(lambda:rewards.write('growth',{'visits':3,'items':0,'ledger':0,'ledger_current':0,'claimed':[],'version':1}))
        for route in ('visit','achievements/visits_3/claim'):
            barrier=Barrier(2);original=self.db.finish_transaction
            if self.cloud:
                def finish(key,commit=False):
                    if commit:barrier.wait(timeout=10)
                    return original(key,commit)
                self.db.finish_transaction=finish
            def submit(index):
                with self.app.test_client() as client:
                    if not self.cloud:barrier.wait(timeout=10)
                    return self.send('POST','/rewards/'+route,{},key=f'growth-concurrent-{route[:5]}-{index:04}',client=client)
            try:
                with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(submit,(1,2)))
            finally:
                self.db.finish_transaction=original
            self.assertIn(200,[r.status_code for r in results])
        model=self.send('GET','/rewards').json
        self.assertEqual(model['balance'],10);self.assertEqual(model['achievements'][0]['progress'],4)


class SQLiteGrowth(GrowthContract,unittest.TestCase):
    pass


class CloudGrowth(GrowthContract,unittest.TestCase):
    cloud=True

    def test_historical_manual_progress_exhausts_all_pages(self):
        owner=self.send('GET','/auth/me').json['user']['id']
        for index in range(301):
            ident=f'{index:032x}'
            self.db.rows[('palm_ledger_entries',ident)]={'_id':ident,'id':ident,'user_id':owner,
                'source':'manual','kind':'expense','state':'active','amount_cents':100}
        model=self.send('POST','/rewards/visit',{}).json
        row=next(r for r in model['achievements'] if r['id']=='ledger_300')
        self.assertEqual(row['progress'],301);self.assertTrue(row['achieved']);self.assertEqual(model['balance'],0)
        self.assertEqual(self.send('POST','/rewards/achievements/ledger_300/claim',{}).json['balance'],150)

    def test_lost_claim_commit_response_is_recovered(self):
        from palm.cloud_client import CloudBaseError
        self.stored(lambda:rewards.write('growth',{'visits':3,'items':0,'ledger':0,'ledger_current':0,'claimed':[],'version':1}))
        original=self.db.finish_transaction
        def lost(key,commit=False):
            original(key,commit)
            if commit:raise CloudBaseError(503,'NETWORK_ERROR')
        self.db.finish_transaction=lost
        try:result=self.send('POST','/rewards/achievements/visits_3/claim',{},key='growth-lost-response-0001')
        finally:self.db.finish_transaction=original
        self.assertEqual(result.status_code,503)
        replay=self.send('POST','/rewards/achievements/visits_3/claim',{},key='growth-lost-response-0001')
        self.assertEqual(replay.status_code,200);self.assertEqual(replay.json['balance'],10)
        self.assertEqual(self.send('POST','/rewards/achievements/visits_3/claim',{}).json['balance'],10)
