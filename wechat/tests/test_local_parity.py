"""Compare fixed business fixtures with the current Python implementation."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from palm import create_app, initialize_app
from palm.validation import natural_today


class LocalParityTests(unittest.TestCase):
    def test_snapshot_statistics_reports_and_installments_match_python(self):
        with tempfile.TemporaryDirectory(prefix='palm-local-parity-') as folder:
            root = Path(folder)
            app = initialize_app(create_app({'TESTING': True, 'DATABASE': str(root / 'db.sqlite3'),
                'PHOTO_DIR': str(root / 'photos'), 'WECHAT_CODE_EXCHANGER': lambda code: 'parity-' + code}))
            client, sequence = app.test_client(), 0
            login = client.post('/api/mp/auth/login', json={'code': 'isolated'}).json
            headers = {'Authorization': 'Bearer ' + login['token']}
            def call(method, path, data=None, revision=None):
                nonlocal sequence
                sequence += 1
                extra = {'Idempotency-Key': 'local-parity-' + str(sequence).zfill(16)}
                if revision is not None: extra['If-Match'] = '"' + str(revision) + '"'
                response = client.open('/api/mp' + path, method=method, json=data, headers={**headers, **extra})
                self.assertLess(response.status_code, 300, (path, response.json))
                return response.json
            call('POST', '/ledger/settings', {})
            camera = call('POST', '/items', {'name': '对照相机', 'category': '摄影', 'icon_type': 'digital',
                'purchase_date': '2026-01-31', 'purchase_price': '6000.01', 'status': 'active',
                'payment_info': {'mode': 'paid', 'amount': '6000.01', 'paid_on': '2026-01-31'}})
            cup = call('POST', '/items', {'name': '对照水杯', 'category': '日常', 'icon_type': 'daily',
                'purchase_date': '2025-01-01', 'purchase_price': '50.00', 'status': 'idle', 'warranty_expires_on': '2026-01-01'})
            call('POST', f"/items/{camera['id']}/maintenance", {'maintained_on': '2026-02-01', 'cost': '50.50', 'description': '清洁'})
            call('POST', f"/items/{cup['id']}/maintenance", {'maintained_on': '2026-02-01', 'cost': '50.50', 'description': '修理'})
            call('POST', f"/items/{cup['id']}/disposal", {'disposed_on': '2026-03-01', 'proceeds': '110.00', 'method': 'sold', 'notes': ''})
            plan = call('POST', '/fixed-expenses', {'kind': 'installment', 'name': '三期尾差', 'amount': '2.00',
                'principal_total': '100.00', 'periods': 3, 'anchor_on': '2026-01-31', 'item_id': camera['id'],
                'initial_payment': {'paid_on': '2026-01-30', 'amount': '2.00', 'principal': '33.33', 'enable_ledger': True}})
            call('POST', f"/fixed-expenses/{plan['id']}/payments", {'cycle_index': 1, 'paid_on': '2026-02-28', 'amount': '2.00', 'principal': '33.33'}, plan['revision'])
            purchase = next(e for e in call('GET', '/ledger/entries?month=2026-01')['entries'] if e['source'] == 'purchase')
            call('POST', f"/ledger/entries/{purchase['id']}/refunds", {'amount': '10.00', 'occurred_on': '2026-02-02', 'name': '对照退款', 'notes': ''}, purchase['revision'])
            call('PUT', '/member/budget', {'month': '2026-02', 'book_id': 'all', 'total': '200.00', 'categories': {'maintenance': '100.00'}}, 0)
            snap = call('POST', '/local-migration/snapshots', {})
            tables = {k: [] for k in snap['counts']}
            for p in snap['pages']:
                page = call('GET', f"/local-migration/snapshots/{snap['id']}/pages/{p['index']}")
                tables[page['table']].extend(page['rows'])
            paths = ['/stats', '/insights', '/reports/monthly?month=2026-01', '/reports/monthly?month=2026-02',
                f"/fixed-expenses/{plan['id']}", f"/items/{camera['id']}", f"/items/{cup['id']}", '/ledger/statistics?month=2026-02', '/member/budget?month=2026-02&book_id=all']
            expected = {path: call('GET', path) for path in paths}
            runner = Path(__file__).with_name('local-parity-runner.cjs')
            proc = subprocess.run(['node', str(runner)], input=json.dumps({'today': natural_today().isoformat(), 'tables': tables, 'paths': paths}),
                capture_output=True, text=True, encoding='utf-8', timeout=30)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            actual = json.loads(proc.stdout)
            for key in ('summary', 'days', 'categories'):
                self.assertEqual(actual['/ledger/statistics?month=2026-02'][key], expected['/ledger/statistics?month=2026-02'][key], key)
            for key in ('total', 'categories', 'category_over_total'):
                self.assertEqual(actual['/member/budget?month=2026-02&book_id=all'][key], expected['/member/budget?month=2026-02&book_id=all'][key], key)
            for key in ('total_items', 'held_items', 'held_purchase_total', 'status_counts', 'purchase_total', 'fixed_expense_total',
                        'all_fixed_expense_total', 'maintenance_total', 'disposal_total', 'net_cost_total', 'categories'):
                self.assertEqual(actual['/stats'][key], expected['/stats'][key], key)
            for key in ('months', 'analysis_as_of', 'review_threshold_days', 'analysis_cards'):
                self.assertEqual(actual['/insights'][key], expected['/insights'][key], key)
            for path in paths:
                if path.startswith('/reports/'):
                    for key in ('totals', 'has_activity', 'cutoff_date', 'purchase_leaders'):
                        self.assertEqual(actual[path][key], expected[path][key], (path, key))
                if path.startswith('/items/'):
                    for key in ('holding_days', 'net_cost', 'daily_purchase_cost', 'daily_net_cost', 'maintenance_total', 'fixed_expense_total'):
                        self.assertEqual(actual[path][key], expected[path][key], (path, key))
                if path.startswith('/fixed-expenses/'):
                    for key in ('paid_periods', 'next_cycle_index', 'next_due_on', 'paid_principal', 'remaining_principal', 'suggested_principal', 'paid_cost', 'planned_payment'):
                        self.assertEqual(actual[path][key], expected[path][key], (path, key))
