"""Generate visual fixtures from an isolated SQLite API; never connects to Tencent."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tests'))
from test_membership import SQLiteMemberTest

t = SQLiteMemberTest()
t.setUp()
try:
    t.grant(); t.enable()
    book = t.new_book()
    t.send('POST','/member/books',{'name':'温暖小家','cover':'home'})
    t.send('POST','/member/books',{'name':'兴趣收藏','cover':'hobby'})
    row = t.manual(amount='128.00', occurred_on='2026-10-10', book_id=book['id'])
    t.manual(kind='income', category='salary', amount='2600.00', occurred_on='2026-10-01')
    t.manual(category='home', amount='320.00', occurred_on='2026-10-12')
    t.send('POST', '/ledger/entries/' + row['id'] + '/refunds', {'amount': '28', 'occurred_on': '2026-10-13'}, revision=row['revision'])
    tag = t.send('POST', '/member/tags', {'name': '旅行'}).json
    t.send('PUT', '/member/entries/' + row['id'] + '/tags', {'tags': [tag['id']]}, revision=row['member_revision'])
    t.send('PUT', '/member/budget', {'month': '2026-10', 'total': '2000', 'categories': {'food': '600', 'home': '1000'}}, revision=0)
    filters = {'start': '2026-10-01', 'end': '2026-10-15', 'compare': 'previous'}
    t.send('POST', '/member/analysis-presets', {'name': '这个月的生活', 'filters': filters})
    t.plan(anchor_on='2026-10-15', name='手机套餐', amount='39')
    t.plan(kind='installment', anchor_on='2026-10-01', name='相机分期', amount='9.9', principal_total='3000', periods=12)
    # A legacy item remains outside actual cash until explicitly confirmed;
    # the collection report must still exercise its non-empty layout.
    t.item(purchase_date='2026-10-09')
    routes = ['/membership', '/member/books', '/member/tags', '/member/entries', '/member/budget?month=2026-10&book_id=all',
              '/member/appearance', '/member/analysis-presets',
              '/ledger/statistics?month=2026-10', '/ledger/entries?month=2026-10', '/stats', '/insights', '/auth/me',
              '/reports/monthly?month=2026-10']
    responses = {r: t.send('GET', r).json for r in routes}
    responses['/member/budget'] = responses['/member/budget?month=2026-10&book_id=all']
    responses['/ledger/statistics'] = responses['/ledger/statistics?month=2026-10']
    responses['/ledger/entries'] = responses['/ledger/entries?month=2026-10']
    responses['/reports/monthly'] = responses['/reports/monthly?month=2026-10']
    responses['/member/analysis/run'] = t.send('POST', '/member/analysis/run', filters).json
    responses['/items'] = []
    responses['/ledger/settings'] = {'enabled': True}
    output = json.dumps({'responses': responses, 'filters': filters}, ensure_ascii=False)
    if len(sys.argv) > 1:
        Path(sys.argv[1]).write_text(output, encoding='utf-8')
    else:
        print(output)
finally:
    t.doCleanups()
