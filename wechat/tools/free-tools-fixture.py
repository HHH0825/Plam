"""Build screenshot data from an isolated SQLite account; never use live data."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tests'))
from test_membership import SQLiteMemberTest

t = SQLiteMemberTest()
t.setUp()
try:
    t.enable()
    b = t.new_book()
    t.manual(amount='28.00', occurred_on='2026-10-10', book_id=b['id'])
    t.manual(kind='income', category='salary', amount='2600.00', occurred_on='2026-10-01')
    r = t.send('PUT', '/member/budget', {'month': '2026-10', 'total': '2000', 'categories': {'food': '600'}}, revision=0)
    assert r.status_code == 200, r.json
    routes = ['/membership', '/member/books', '/member/entries', '/member/appearance',
              '/member/budget?month=2026-10&book_id=all', '/auth/me', '/stats']
    responses = {}
    for route in routes:
        result = t.send('GET', route)
        assert result.status_code == 200, (route, result.json)
        responses[route] = result.json
    assert not responses['/membership']['active']
    Path('test-results/free-tools-fixture.json').write_text(json.dumps({'responses': responses}, ensure_ascii=False), encoding='utf-8')
finally:
    t.doCleanups()
