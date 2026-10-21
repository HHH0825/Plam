"""Permanent, owner-scoped achievement high-water marks and manual claims."""
from flask import g
from . import rewards

TIERS = {
    'visits': ((3, 10), (7, 20), (30, 60), (90, 150)),
    'items': ((5, 10), (10, 20), (20, 40), (50, 80), (100, 120)),
    'ledger': ((5, 10), (20, 20), (50, 40), (100, 80), (300, 150)),
}
NAMES = {'visits': '常来看看', 'items': '物品收藏', 'ledger': '认真记账'}


def eligible(row):
    return bool(row and row.get('state') == 'active' and row.get('source') == 'manual'
                and row.get('kind') in ('income', 'expense') and not row.get('parent_id')
                and not row.get('imported') and not row.get('linked_entry_id'))


def progress():
    saved = rewards.read('growth')
    if saved:
        return saved
    from .ledger import rows
    count = sum(eligible(row) for row in rows())
    return {'visits': 0, 'items': rewards.wallet()['used'], 'ledger': count,
            'ledger_current': count, 'claimed': [], 'version': 1}


def track_items(count):
    saved = progress()
    if count > saved['items'] or not rewards.read('growth'):
        rewards.write('growth', {**saved, 'items': max(saved['items'], count)})


def track_ledger(old, new):
    if not (eligible(old) or eligible(new)):
        return
    saved = progress()
    count = max(0, saved['ledger_current'] + int(eligible(new)) - int(eligible(old)))
    rewards.write('growth', {**saved, 'ledger_current': count, 'ledger': max(saved['ledger'], count)})


def catalog():
    saved = progress()
    return [{'id': f'{kind}_{target}', 'category': kind, 'name': NAMES[kind],
             'target': target, 'reward': amount, 'progress': saved[kind],
             'achieved': saved[kind] >= target, 'claimed': f'{kind}_{target}' in saved['claimed']}
            for kind, tiers in TIERS.items() for target, amount in tiers]


def visit(today):
    saved = progress()
    seen = bool(rewards.read('visit', today))
    if not seen:
        rewards.write('visit', {'date': today}, today)
        saved = rewards.write('growth', {**saved, 'visits': saved['visits'] + 1})
    return seen


def claim(ident):
    from .validation import InputError
    entry = next((row for row in catalog() if row['id'] == ident), None)
    if entry is None:
        raise InputError('成就不存在，请刷新后重试')
    if not entry['achieved']:
        raise InputError('还没有达成这个小目标，继续慢慢记录吧')
    saved = progress()
    if ident in saved['claimed']:
        return True, 0
    rewards.add_reward(g.user_id, entry['reward'], '成长成就 · ' + entry['name'] + str(entry['target']), 'achievement:' + ident)
    rewards.write('growth', {**saved, 'claimed': [*saved['claimed'], ident]})
    return False, entry['reward']
