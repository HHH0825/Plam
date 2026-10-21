"""Same cash-flow contract against SQLite and transactional CloudBase documents."""
import unittest
from unittest.mock import patch
from test_purchases import PurchasesContract


class LedgerContract:
    setUp = PurchasesContract.setUp
    send = PurchasesContract.send
    plan = PurchasesContract.plan
    pay = PurchasesContract.pay
    latest = PurchasesContract.latest
    wish = PurchasesContract.wish

    def enable(self):
        result = self.send('POST', '/ledger/settings', {})
        self.assertEqual(result.status_code, 200, result.json)

    def item(self, **extra):
        response = self.send('POST', '/items', {'name': '键盘', 'category': '数码', 'icon_type': 'digital',
            'purchase_price': '399.00', 'purchase_date': '2025-01-01', 'status': 'active', **extra})
        self.assertEqual(response.status_code, 201, response.json)
        return response.json

    def manual(self, **extra):
        response = self.send('POST', '/ledger/entries', {'kind': 'expense', 'category': 'food',
            'amount': '28.00', 'occurred_on': '2025-01-13', **extra})
        self.assertEqual(response.status_code, 201, response.json)
        return response.json

    def listing(self, month='2025-01', query=''):
        result = self.send('GET', '/ledger/entries?month=' + month + query)
        self.assertEqual(result.status_code, 200, result.json)
        return result.json

    def test_added_income_categories_save_edit_filter_and_statistics(self):
        self.enable()
        for key, label in [('bonus', '奖金补贴'), ('business', '经营收入'), ('reimbursement', '报销回款')]:
            row = self.manual(kind='income', category=key, amount='10.00')
            self.assertEqual(row['category_name'], label)
            self.assertEqual(row['name'], label)
            replay = self.send('GET', '/ledger/entries/' + row['id'])
            self.assertEqual(replay.json['category_name'], label)
            updated = self.send('PUT', '/ledger/entries/' + row['id'],
                {'kind': 'income', 'category': key, 'amount': '12.00', 'occurred_on': '2025-01-13'},
                revision=row['revision'])
            self.assertEqual(updated.status_code, 200, updated.json)
            self.assertEqual(updated.json['category_name'], label)
            selected = self.listing(query='&kind=income&category=' + key)
            self.assertEqual(len(selected['entries']), 1)
            self.assertEqual(selected['filtered_summary']['income'], '12.00')
            self.assertEqual(self.send('POST', '/ledger/entries', {'kind': 'expense', 'category': key,
                'amount': '1.00', 'occurred_on': '2025-01-13'}).status_code, 400)
        totals = self.send('GET', '/ledger/statistics?month=2025-01').json['summary']
        self.assertEqual(totals['income'], '36.00')

    def test_capability_enable_manual_precision_isolation_and_receipts(self):
        self.assertEqual(self.send('GET', '/auth/me').json['capabilities']['cash_ledger'], 1)
        self.assertEqual(self.send('GET', '/ledger/entries').status_code, 409)
        self.enable()
        row = self.manual(amount='999999999.00')
        self.assertEqual(row['amount'], '999999999.00')
        self.assertEqual(row['name'], '餐饮')
        self.assertEqual(self.send('GET', '/ledger/entries/' + row['id'], token=self.bob).status_code, 409)
        self.send('POST', '/ledger/settings', {}, token=self.bob)
        self.assertEqual(self.send('GET', '/ledger/entries/' + row['id'], token=self.bob).status_code, 404)
        form = {'kind': 'income', 'category': 'salary', 'amount': '100.01', 'occurred_on': '2025-01-14'}
        a = self.send('POST', '/ledger/entries', form, key='ledger-same-request-0001')
        b = self.send('POST', '/ledger/entries', form, key='ledger-same-request-0001')
        self.assertEqual(a.json, b.json)
        self.assertEqual(self.listing()['summary']['count'], 2)
        self.assertEqual(self.listing(query='&kind=income')['summary']['count'], 2)
        self.assertEqual(self.listing(query='&kind=income')['filtered_summary']['income'], '100.01')
        for amount in ('0', '-1', '1.001', 'NaN', '1000000000'):
            r = self.send('POST', '/ledger/entries', {**form, 'amount': amount})
            self.assertEqual(r.status_code, 400, r.json)

    def test_creation_time_survives_edit_refund_void_and_operation_replay(self):
        self.enable()
        form = {'kind': 'expense', 'category': 'food', 'amount': '28.00',
                'occurred_on': '2025-01-01', 'operation_id': 'recorded-time-create-0001'}
        first_time = '2026-10-15T06:08:36.123456+00:00'
        later_time = '2026-10-16T07:09:37.654321+00:00'
        with patch('palm.ledger.now', return_value=first_time):
            original = self.send('POST', '/ledger/entries', form).json
        route = '/ledger/entries/' + original['id']
        self.assertEqual(original['created_at'], first_time)
        with patch('palm.ledger.now', return_value=later_time):
            replay = self.send('POST', '/ledger/entries', form)
            self.assertEqual(replay.json['created_at'], first_time)
            self.assertEqual(replay.json['id'], original['id'])
            edited = self.send('PUT', route, {**form, 'amount': '30.00'}, revision=original['revision'])
            self.assertEqual(edited.status_code, 200, edited.json)
            self.assertEqual(edited.json['created_at'], first_time)
            self.assertEqual(edited.json['updated_at'], later_time)
            refund = self.send('POST', route + '/refunds', {'amount': '5.00', 'occurred_on': '2025-01-02'}, revision=edited.json['revision'])
            self.assertEqual(refund.status_code, 201, refund.json)
            self.assertEqual(refund.json['created_at'], later_time)
            detail = self.send('GET', route).json
            self.assertEqual(detail['created_at'], first_time)
            self.assertEqual(detail['refunds'][0]['created_at'], later_time)
            self.assertEqual(detail['occurred_on'], '2025-01-01')
            self.assertEqual(self.send('DELETE', '/ledger/entries/' + refund.json['id'], revision=refund.json['revision']).status_code, 200)
            latest = self.send('GET', route).json
            voided = self.send('DELETE', route, revision=latest['revision'])
            self.assertEqual(voided.status_code, 200, voided.json)
            self.assertEqual(voided.json['created_at'], first_time)

    def test_refunds_cross_month_parent_guards_and_void(self):
        self.enable()
        row = self.manual(amount='100.00')
        route = '/ledger/entries/' + row['id']
        refund = self.send('POST', route + '/refunds', {'amount': '60.00', 'occurred_on': '2025-02-01'}, revision=row['revision'])
        self.assertEqual(refund.status_code, 201, refund.json)
        self.assertEqual(self.listing('2025-01')['summary']['expense'], '100.00')
        feb = self.listing('2025-02')['summary']
        self.assertEqual(feb['expense_label'], '本月退款结余')
        self.assertEqual(feb['expense'], '60.00')
        self.assertEqual(feb['income'], '0.00')
        latest = self.send('GET', route).json
        self.assertEqual(self.send('POST', route + '/refunds', {'amount': '41', 'occurred_on': '2025-02-02'}, revision=latest['revision']).status_code, 400)
        self.assertEqual(self.send('DELETE', route, revision=latest['revision']).status_code, 409)
        self.assertEqual(self.send('PUT', route, {'kind': 'expense', 'category': 'food', 'amount': '59', 'occurred_on': '2025-01-13'}, revision=latest['revision']).status_code, 409)
        r = self.send('DELETE', '/ledger/entries/' + refund.json['id'], revision=refund.json['revision'])
        self.assertEqual(r.status_code, 200, r.json)
        self.assertEqual(self.listing('2025-02')['summary']['count'], 0)
        latest = self.send('GET', route).json
        self.assertEqual(self.send('DELETE', route, revision=latest['revision']).status_code, 200)

    def test_purchase_installment_payment_cost_unchanged_and_legacy_preserves(self):
        self.enable()
        item = self.item(payment_info={'mode': 'installment', 'amount': '50.00', 'paid_on': '2025-01-01'})
        self.assertEqual(self.listing()['summary']['expense'], '50.00')
        self.assertEqual(item['net_cost'], '399.00')
        plan = self.plan(kind='installment', principal_total='349.00', periods=2, item_id=item['id'])
        payment = self.pay(plan, principal='100.00', amount='2.00')
        self.assertEqual(self.listing('2025-02')['summary']['expense'], '102.00')
        entry = self.listing('2025-02')['entries'][0]
        self.assertEqual(entry['principal'], '100.00')
        self.assertEqual(self.send('GET', '/items/' + str(item['id'])).json['net_cost'], '401.00')
        changed = self.send('PUT', '/items/' + str(item['id']), {'name': '新名字', 'category': '数码', 'purchase_price': '399.00',
            'purchase_date': '2025-01-01', 'status': 'active'}, revision=item['revision'])
        # Cloud's payment touched its linked item. Reload first when necessary.
        if changed.status_code == 409:
            fresh = self.send('GET', '/items/' + str(item['id'])).json
            changed = self.send('PUT', '/items/' + str(item['id']), {'name': '新名字', 'category': '数码', 'purchase_price': '399.00',
                'purchase_date': '2025-01-01', 'status': 'active'}, revision=fresh['revision'])
        self.assertEqual(changed.status_code, 200, changed.json)
        self.assertEqual(changed.json['payment_info']['amount'], '50.00')
        self.assertEqual(self.listing()['summary']['expense'], '50.00')

    def test_source_edit_refund_blocks_atomic_payment_and_repair(self):
        self.enable()
        item = self.item(payment_info={'mode': 'archive'})
        repair = self.send('POST', f"/items/{item['id']}/maintenance", {'cost': '80', 'maintained_on': '2025-01-20', 'description': '修理'}, revision=item['revision'])
        self.assertEqual(repair.status_code, 201, repair.json)
        entry = self.listing()['entries'][0]
        refund = self.send('POST', '/ledger/entries/' + entry['id'] + '/refunds', {'amount': '60', 'occurred_on': '2025-01-21'}, revision=entry['revision'])
        self.assertEqual(refund.status_code, 201, refund.json)
        current = self.send('GET', f"/items/{item['id']}").json
        result = self.send('PUT', f"/maintenance/{repair.json['id']}", {'cost': '50', 'maintained_on': '2025-01-20', 'description': '改小'}, revision=current['revision'])
        self.assertEqual(result.status_code, 409, result.json)
        self.assertEqual(self.send('GET', f"/items/{item['id']}").json['maintenance_total'], '80.00')
        self.assertEqual(self.listing()['summary']['expense'], '20.00')
        plan = self.plan(item_id=item['id'])
        paid = self.pay(plan)
        original = self.listing('2025-02')['entries'][0]
        self.send('POST', '/ledger/entries/' + original['id'] + '/refunds', {'amount': '5', 'occurred_on': '2025-02-02'}, revision=original['revision'])
        latest = self.latest(plan)
        denied = self.send('DELETE', f"/fixed-expenses/{plan['id']}/payments/{paid['id']}", revision=latest['revision'])
        self.assertEqual(denied.status_code, 409, denied.json)
        self.assertFalse(self.latest(plan)['payments'][0]['voided'])

    def test_history_pending_fingerprint_atomic_batches_and_manual_binding(self):
        item = self.item()
        self.enable()
        self.assertEqual(self.listing()['entries'], [])
        history = self.send('GET', '/ledger/history').json['entries']
        candidate = history[0]
        selected = {**candidate, 'payment_info': {'mode': 'paid', 'amount': '399', 'paid_on': '2025-01-01'}}
        # Any stale selection aborts the entire import batch.
        bad = {**selected, 'fingerprint': 'stale'}
        self.assertEqual(self.send('POST', '/ledger/history/import', {'entries': [bad]}).status_code, 409)
        self.assertEqual(self.listing()['summary']['count'], 0)
        response = self.send('POST', '/ledger/history/import', {'entries': [selected]}, key='history-import-000001')
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(self.send('POST', '/ledger/history/import', {'entries': [selected]}, key='history-import-000001').json, response.json)
        self.assertEqual(self.send('GET', '/ledger/history').json['total'], 0)
        self.assertEqual(self.listing()['summary']['expense'], '399.00')
        manual = self.manual(category='shopping', amount='28.00', occurred_on='2025-01-01')
        another = self.item(purchase_price='28.00', payment_info={'mode': 'paid', 'amount': '28.00', 'paid_on': '2025-01-01', 'existing_entry_id': manual['id']})
        self.assertEqual(self.listing()['summary']['expense'], '427.00')
        self.assertEqual(self.send('GET', '/ledger/entries/' + manual['id']).json['state'], 'linked')
        self.assertEqual(another['payment_info']['existing_entry_id'], manual['id'])

    def test_delete_restore_and_permanent_removal_preserve_cash(self):
        self.enable()
        item = self.item(payment_info={'mode': 'paid', 'amount': '399', 'paid_on': '2025-01-01'})
        route = f"/items/{item['id']}"
        entry = self.listing()['entries'][0]
        self.assertEqual(self.send('DELETE', route, revision=item['revision']).status_code, 204)
        self.assertEqual(self.listing()['summary']['expense'], '399.00')
        latest = self.send('GET', '/trash').json[0]
        self.assertEqual(self.send('POST', f"/trash/{item['id']}/restore", {}, revision=latest['revision']).status_code, 200)
        self.assertEqual(self.listing()['summary']['count'], 1)
        latest = self.send('GET', route).json
        self.send('DELETE', route, revision=latest['revision'])
        latest = self.send('GET', '/trash').json[0]
        self.assertEqual(self.send('DELETE', f"/trash/{item['id']}", revision=latest['revision']).status_code, 204)
        saved = self.send('GET', '/ledger/entries/' + entry['id']).json
        self.assertTrue(saved['item_removed'])
        self.assertTrue(saved['editable'])
        self.assertEqual(self.listing()['summary']['expense'], '399.00')

    def test_pagination_search_statistics_and_zero_net(self):
        self.enable()
        for index in range(32):
            self.manual(name=f'午餐{index}', amount='1.01')
        self.manual(kind='income', category='salary', amount='32.32')
        first = self.listing()
        self.assertEqual(len(first['entries']), 30)
        self.assertEqual(first['next_offset'], 30)
        self.assertEqual(len(self.listing(query='&offset=30')['entries']), 3)
        self.assertEqual(first['summary']['net_label'], '本月收支持平')
        self.assertEqual(first['summary']['net'], '0.00')
        filtered = self.listing(query='&q=午餐31')
        self.assertEqual(filtered['filtered_summary']['count'], 1)
        self.assertEqual(filtered['summary']['count'], 33)
        stats = self.send('GET', '/ledger/statistics?month=2025-01').json
        self.assertEqual(len(stats['days']), 31)
        self.assertEqual(stats['categories'][0]['expense'], '32.32')

    def test_daily_filter_and_full_group_totals_before_pagination(self):
        self.enable()
        for i in range(34):
            self.manual(name=f'午餐{i}', amount='1.01')
        self.manual(amount='50.00', occurred_on='2025-01-12')
        first = self.listing(query='&date=2025-01-13')
        self.assertEqual(first['date'], '2025-01-13')
        self.assertEqual(len(first['entries']), 30)
        self.assertEqual(first['summary']['gross_expense'], '84.34')
        self.assertEqual(first['filtered_summary']['gross_expense'], '34.34')
        self.assertEqual(first['day_summaries']['2025-01-13']['count'], 34)
        second = self.listing(query='&date=2025-01-13&offset=30')
        self.assertEqual(len(second['entries']), 4)
        self.assertEqual(first['day_summaries'], second['day_summaries'])
        self.assertTrue(all(r['occurred_on'] == '2025-01-13' for r in first['entries'] + second['entries']))
        filtered = self.listing(query='&date=2025-01-13&q=午餐33')
        self.assertEqual(filtered['day_summaries']['2025-01-13']['gross_expense'], '1.01')
        self.assertIsNone(self.listing()['date'])
        self.assertEqual(len(self.listing()['day_summaries']), 2)

    def test_daily_validation_empty_and_refund_only_preserve_month(self):
        self.enable()
        parent = self.manual(amount='50.00')
        self.send('POST', '/ledger/entries/' + parent['id'] + '/refunds',
                  {'amount': '20.00', 'occurred_on': '2025-02-01'}, revision=parent['revision'])
        day = self.listing('2025-02', '&date=2025-02-01')
        self.assertEqual(day['filtered_summary']['gross_expense'], '0.00')
        self.assertEqual(day['day_summaries']['2025-02-01']['refund'], '20.00')
        empty = self.listing('2025-02', '&date=2025-02-02')
        self.assertEqual(empty['entries'], [])
        self.assertEqual(empty['day_summaries'], {})
        self.assertEqual(empty['summary']['refund'], '20.00')
        for day in ('2025-02-29', '2025-01-13', '2025-2-1', '', '9999-02-01'):
            self.assertEqual(self.send('GET', '/ledger/entries?month=2025-02&date=' + day).status_code, 400)
        self.assertEqual(self.listing('2024-02', '&date=2024-02-29')['entries'], [])

    def test_operation_survives_new_receipt_and_cannot_change_payload(self):
        self.enable()
        form = {'kind': 'expense', 'category': 'food', 'amount': '1.01', 'occurred_on': '2025-01-01', 'operation_id': 'ledger-durable-operation-0001'}
        first = self.send('POST', '/ledger/entries', form)
        replay = self.send('POST', '/ledger/entries', form)
        self.assertEqual(first.json['id'], replay.json['id'])
        self.assertEqual(self.send('GET', '/ledger/operations/' + form['operation_id']).json['id'], first.json['id'])
        self.assertEqual(self.send('POST', '/ledger/entries', {**form, 'amount': '2.00'}).status_code, 409)
        route = '/ledger/entries/' + first.json['id']
        data = {'amount': '0.50', 'occurred_on': '2025-01-02', 'operation_id': 'ledger-durable-refund-000001'}
        refund = self.send('POST', route + '/refunds', data, revision=first.json['revision'])
        again = self.send('POST', route + '/refunds', data, revision=first.json['revision'])
        self.assertEqual(refund.status_code, 201, refund.json)
        self.assertEqual(again.json['id'], refund.json['id'])
        self.assertEqual(self.listing()['summary']['count'], 2)
        for bad in ('1e2', 1.01, True, '1.000', ' 1.00'):
            self.assertEqual(self.send('POST', '/ledger/entries', {**form, 'operation_id': 'new-invalid-operation-0001', 'amount': bad}).status_code, 400)

    def test_multi_import_rolls_back_first_record_when_second_is_stale(self):
        one, two = self.item(), self.item(name='相机')
        self.enable()
        candidates = self.send('GET', '/ledger/history').json['entries']
        selected = [{**r, 'payment_info': {'mode': 'paid', 'amount': '399.00', 'paid_on': '2025-01-01'}} for r in candidates]
        selected[1]['fingerprint'] = 'stale'
        response = self.send('POST', '/ledger/history/import', {'entries': selected})
        self.assertEqual(response.status_code, 409, response.json)
        self.assertEqual(self.listing()['summary']['count'], 0)
        self.assertIsNone(self.send('GET', f"/items/{one['id']}").json['payment_info'])
        self.assertIsNone(self.send('GET', f"/items/{two['id']}").json['payment_info'])
        self.assertEqual(self.send('GET', '/ledger/history').json['total'], 2)

    def test_history_operation_is_durable_and_readable_after_import(self):
        self.item()
        self.enable()
        candidate = self.send('GET', '/ledger/history').json['entries'][0]
        data = {'operation_id': 'history-durable-operation-0001', 'entries': [{**candidate, 'payment_info': {'mode': 'paid', 'amount': '399.00', 'paid_on': '2025-01-01'}}]}
        first = self.send('POST', '/ledger/history/import', data)
        replay = self.send('POST', '/ledger/history/import', data)
        self.assertEqual(first.status_code, 200, first.json)
        self.assertEqual(first.json, replay.json)
        self.assertEqual(self.send('GET', '/ledger/operations/' + data['operation_id']).json, first.json)
        self.assertEqual(self.listing()['summary']['count'], 1)
        self.assertEqual(self.listing()['summary']['expense'], '399.00')

    def test_refund_version_and_category_propagation(self):
        self.enable()
        parent = self.manual(amount='100.00')
        route = '/ledger/entries/' + parent['id']
        refund = self.send('POST', route + '/refunds', {'amount': '60.00', 'occurred_on': '2025-02-01'}, revision=parent['revision']).json
        self.assertEqual(self.send('POST', route + '/refunds', {'amount': '20', 'occurred_on': '2025-02-01'}, revision=parent['revision']).status_code, 409)
        fresh = self.send('GET', route).json
        changed = self.send('PUT', route, {'kind': 'expense', 'category': 'shopping', 'amount': '100.00', 'occurred_on': parent['occurred_on']}, revision=fresh['revision'])
        self.assertEqual(changed.status_code, 200, changed.json)
        fresh_refund = self.send('GET', '/ledger/entries/' + refund['id']).json
        self.assertEqual(fresh_refund['category'], 'shopping')
        self.assertEqual(self.send('PUT', '/ledger/entries/' + refund['id'], {'amount': '70.00', 'occurred_on': '2025-02-01'}, revision=refund['revision']).status_code, 409)
        before = self.send('GET', route).json['revision']
        updated = self.send('PUT', '/ledger/entries/' + refund['id'], {'amount': '70.00', 'occurred_on': '2025-02-01'}, revision=fresh_refund['revision'])
        self.assertEqual(updated.status_code, 200, updated.json)
        self.assertGreater(self.send('GET', route).json['revision'], before)

    def test_legacy_purchase_pending_and_wish_conversion_cash_confirmed_once(self):
        self.enable()
        pending = self.item()
        self.assertEqual(self.listing()['summary']['count'], 0)
        self.assertEqual(self.send('GET', '/ledger/history').json['total'], 1)
        self.assertIsNone(pending['payment_info'])
        wish = self.wish(name='背包')
        route = f"/wishlist/{wish['id']}/convert"
        form = {'name': '背包', 'category': '衣物', 'icon_type': 'other', 'purchase_price': '99.00', 'purchase_date': '2025-01-01', 'payment_info': {'mode': 'paid', 'amount': '89.00', 'paid_on': '2025-01-02'}}
        result = self.send('POST', route, form, revision=wish['revision'])
        self.assertEqual(result.status_code, 201, result.json)
        replay = self.send('POST', route, form, revision=wish['revision'])
        self.assertEqual(result.json['id'], replay.json['id'])
        self.assertEqual(self.listing()['summary']['expense'], '89.00')
        self.assertEqual(self.listing()['summary']['count'], 1)
        self.assertEqual(result.json['net_cost'], '99.00')


class SQLiteLedgerTest(LedgerContract, unittest.TestCase):
    cloud = False

    def test_version_twelve_upgrade_backs_up_without_importing_cash(self):
        from pathlib import Path
        from palm.database import get_db, initialize_database
        item = self.item()
        with self.app.app_context():
            db = get_db()
            db.execute('DROP TABLE ledger_entries')
            db.execute('DROP TABLE ledger_settings')
            db.execute('ALTER TABLE items DROP COLUMN payment_info')
            db.execute('PRAGMA user_version=12')
            db.commit()
        initialize_database(self.app)
        self.assertTrue(Path(self.app.config['DATABASE'] + '.pre-ledger.bak').exists())
        restored = self.send('GET', f"/items/{item['id']}").json
        self.assertEqual(restored['purchase_price'], item['purchase_price'])
        self.assertEqual(restored['revision'], item['revision'])
        self.assertIsNone(restored['payment_info'])
        self.enable()
        self.assertEqual(self.listing()['summary']['count'], 0)
        self.assertEqual(self.send('GET', '/ledger/history').json['total'], 1)


class CloudLedgerTest(LedgerContract, unittest.TestCase):
    cloud = True

    def test_commit_failure_rolls_back_entry_and_source(self):
        self.enable()
        from palm.cloud_client import CloudBaseError
        original = self.db.finish_transaction
        def fail(key, commit=False):
            if commit:
                original(key, commit=False)
                raise CloudBaseError('INJECTED_FAILURE')
            return original(key, commit=False)
        with patch.object(self.db, 'finish_transaction', side_effect=fail):
            response = self.send('POST', '/ledger/entries', {'kind': 'expense', 'category': 'food', 'amount': '1', 'occurred_on': '2025-01-01'})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.listing()['summary']['count'], 0)


if __name__ == '__main__':
    unittest.main()
