"""One transactional timeline for paid and administrator-gifted membership."""
import hashlib
import json
import re
import time
from flask import g
from .membership import ENTITLEMENTS, get, put, documents


def paid_events():
    from .payments import account_orders
    return [{'id': o['id'], 'index': o['grant_index'], 'at': o['fulfilled_at'],
             'months': o['months'], 'active': o['status'] in ('fulfilled', 'partial_refund')}
            for o in account_orders(g.user_id) if o.get('grant_index')]


def calculate(base, events):
    from .payments import add_months
    starts, expiry = base.get('starts_at'), base.get('expires_at') or 0
    seen = set()
    for event in sorted(events, key=lambda e: e['index']):
        if event['index'] in seen:
            raise ValueError('会员授权顺序冲突，请由维护者核对')
        seen.add(event['index'])
        if not event['active']:
            continue
        at = event['at']
        if expiry <= at:
            starts = at
        anchor = max(at, expiry)
        expiry = add_months(anchor, event['months']) if event.get('months') else anchor + event['days'] * 86400
    return {'starts_at': starts, 'expires_at': expiry}


def gift_events():
    return [dict(v, at=v['created_at'], active=not v.get('revoked_at')) for v in documents('membership_gift')]


def ledger():
    """Read/validate legacy baseline without writing; caller owns the transaction."""
    row = get('membership', 'status') or {}
    paid, gifts = paid_events(), gift_events()
    base = row.get('pay_base') or {'starts_at': row.get('starts_at'), 'expires_at': row.get('expires_at') or 0}
    calculated = calculate(base, paid + gifts)
    if (calculated['expires_at'] != (row.get('expires_at') or 0)
            or (calculated['starts_at'] or 0) != (row.get('starts_at') or 0)):
        raise ValueError('旧会员时长与授权记录不一致，已停止写入，请核对原记录')
    if row.get('entitlement_version', 1) != 1:
        raise ValueError('会员计算版本不兼容，请更新维护工具')
    return {**row, 'pay_base': base, 'entitlement_version': 1,
            'pay_grant_index': max([row.get('pay_grant_index', 0)] + [e['index'] for e in paid + gifts]),
            'ledger_revision': row.get('ledger_revision', 0)}, paid, gifts


def recalculate(row):
    calculated = calculate(row['pay_base'], paid_events() + gift_events())
    return put('membership', 'status', {**row, **calculated, 'entitlements': ENTITLEMENTS,
               'ledger_revision': row.get('ledger_revision', 0) + 1})


def overview():
    from .repository import user_by_id
    user = user_by_id(g.user_id)
    if not user:
        raise ValueError('用户ID不存在')
    row, paid, gifts = ledger()
    fingerprint = hashlib.sha256(json.dumps([row, paid, gifts], sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return {'user_id': g.user_id, 'username': user['username'], 'expires_at': row.get('expires_at') or 0,
            'paid_expires_at': calculate(row['pay_base'], paid)['expires_at'],
            'gifts': sorted(gifts, key=lambda e: e['index'], reverse=True), 'fingerprint': fingerprint}


def validate_action(action):
    if not isinstance(action, dict) or action.get('type') not in ('grant', 'revoke'):
        raise ValueError('请选择赠送、延长或撤销')
    reason = action.get('reason', '')
    if not isinstance(reason, str) or not 1 <= len(reason.strip()) <= 200:
        raise ValueError('请填写1—200字的操作原因')
    if action['type'] == 'grant':
        months, days = action.get('months', 0), action.get('days', 0)
        if type(months) is not int or type(days) is not int:
            raise ValueError('时长必须为整数')
        if not ((type(months) is int and months in (1, 3, 12) and days == 0)
                or (months == 0 and type(days) is int and 1 <= days <= 3650)):
            raise ValueError('请选择1、3、12个自然月，或1—3650天')
    elif not isinstance(action.get('gift_id'), str) or not re.fullmatch(r'[a-f0-9]{32}', action['gift_id']):
        raise ValueError('请选择要撤销的赠送记录')


def preview(action, at=None):
    validate_action(action)
    current = overview()
    row, paid, gifts = ledger()
    at = int(time.time()) if at is None else at
    if action['type'] == 'grant':
        gifts.append({'index': row['pay_grant_index'] + 1, 'at': at, 'active': True,
                      'months': action.get('months', 0), 'days': action.get('days', 0)})
    else:
        target = next((e for e in gifts if e['id'] == action['gift_id']), None)
        if not target or not target['active']:
            raise ValueError('赠送记录不存在或已撤销')
        target['active'] = False
    return {**current, 'after_expires_at': calculate(row['pay_base'], paid + gifts)['expires_at'], 'action_at': at}


def apply_action(action, request_id, expected_fingerprint, actor, at):
    """Only the separate local tool invokes this. Never registered as an MP route."""
    from .payments import transaction
    validate_action(action)
    if not re.fullmatch(r'[a-f0-9]{32}', request_id or ''):
        raise ValueError('操作标识无效，请重新预览')
    payload_hash = hashlib.sha256(json.dumps([action, expected_fingerprint, at], sort_keys=True).encode()).hexdigest()
    with transaction():
        receipt = get('membership_admin_audit', request_id)
        if receipt:
            if receipt.get('payload_hash') != payload_hash:
                raise ValueError('同一操作标识不能用于不同内容')
            return receipt['result']
        planned = preview(action, at)
        if planned['fingerprint'] != expected_fingerprint:
            raise ValueError('会员记录已更新，请重新查询并预览后确认')
        row, _, _ = ledger()
        if action['type'] == 'grant':
            row['pay_grant_index'] += 1
            put('membership_gift', request_id, {'index': row['pay_grant_index'], 'created_at': at,
                'months': action.get('months', 0), 'days': action.get('days', 0),
                'reason': action['reason'].strip(), 'source': 'administrator', 'actor': actor, 'revoked_at': None})
        else:
            gift = get('membership_gift', action['gift_id'])
            put('membership_gift', action['gift_id'], {**gift, 'revoked_at': int(time.time()),
                'revoke_reason': action['reason'].strip(), 'revoked_by': actor})
        recalculate(row)
        result = overview()
        put('membership_admin_audit', request_id, {'payload_hash': payload_hash, 'actor': actor,
            'created_at': int(time.time()), 'action': action, 'before_expires_at': planned['expires_at'],
            'after_expires_at': result['expires_at'], 'result': result})
        return result
