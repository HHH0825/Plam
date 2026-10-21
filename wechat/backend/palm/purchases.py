"""Owner scoped wishes, recurring plans and an explicit-payment ledger.

Plans never post spending. A payment keeps its own device and period snapshot.
The same service operates on SQLite documents and CloudBase documents.
"""
import calendar
import hashlib
import json
import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from functools import wraps
from flask import Blueprint, abort, g, jsonify, request
from .cloud_runtime import enabled
from .database import get_db
from .validation import InputError, body, value, cents_value, date_value, money, icon_type_value, warranty_value

bp = Blueprint('purchases', __name__)
TABLES = ('wishlist', 'fixed_expenses', 'expense_payments', 'storage_locations')


def today():
    return datetime.now(timezone(timedelta(hours=8))).date()


def rows(table, user_id=None):
    assert table in TABLES
    owner = g.user_id if user_id is None else user_id
    if enabled():
        from .cloud_repository import query
        return query(table, {'user_id': owner})
    return [json.loads(r['payload']) for r in get_db().execute(
        f'SELECT payload FROM {table} WHERE user_id = ? ORDER BY id DESC', (owner,))]


def owned(table, ident):
    assert table in TABLES
    if enabled():
        from .cloud_repository import get
        row = get(table, ident)
    else:
        raw = get_db().execute(f'SELECT payload FROM {table} WHERE id = ? AND user_id = ?', (ident, g.user_id)).fetchone()
        row = json.loads(raw['payload']) if raw else None
    if not row or row['user_id'] != g.user_id:
        abort(404)
    return row


def save(table, row):
    assert table in TABLES
    creating = 'id' not in row
    if 'id' not in row:
        if enabled():
            from .cloud_repository import allocate
            row['id'] = allocate(table)
        else:
            row['id'] = get_db().execute(f'INSERT INTO {table}(user_id, payload) VALUES (?, ?)', (g.user_id, '{}')).lastrowid
        row.update(user_id=g.user_id, revision=0, created_on=today().isoformat())
    else:
        row['revision'] = row.get('revision', 0) + 1
    if enabled():
        from .cloud_repository import put, change
        (put if creating else change)(table, row['id'], {k: v for k, v in row.items() if k != '_id'})
    else:
        get_db().execute(f'UPDATE {table} SET payload = ? WHERE id = ? AND user_id = ?',
                         (json.dumps(row, ensure_ascii=False), row['id'], g.user_id))
    g.pop('payment_ledger', None)
    g.pop('fixed_cost_totals', None)
    if table == 'expense_payments':
        from .ledger import sync_payment
        sync_payment(row, new=creating)
        if creating:
            from .membership import assign_payment
            assign_payment(row)
    return row


def remove(table, ident):
    owned(table, ident)
    if enabled():
        from .cloud_repository import remove as cloud_remove
        cloud_remove(table, ident)
    else:
        get_db().execute(f'DELETE FROM {table} WHERE id = ? AND user_id = ?', (ident, g.user_id))


def revision(row):
    from .cloud_versions import require_revision
    require_revision(row)


def mutation(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        if request.method == 'GET':
            return fn(*args, **kwargs)
        if enabled():
            return fn(*args, **kwargs)  # cloud_runtime owns the transaction and receipt
        key = request.headers.get('Idempotency-Key', '')
        if not re.fullmatch(r'[A-Za-z0-9_-]{16,100}', key):
            raise InputError('请提交有效的请求标识')
        fingerprint = hashlib.sha256((request.method + request.full_path + request.headers.get('If-Match', '')).encode() + request.get_data()).hexdigest()
        db = get_db()
        db.execute('BEGIN IMMEDIATE')
        g.workflow_transaction = True
        owns_photos = not hasattr(g, 'cover_removed_photos')
        if owns_photos:
            g.cover_removed_photos = []
        try:
            receipt = db.execute('SELECT * FROM workflow_receipts WHERE user_id=? AND request_key=?', (g.user_id, key)).fetchone()
            if receipt:
                if receipt['fingerprint'] != fingerprint:
                    abort(409, description='请求标识已用于其他操作')
                from flask import current_app
                response = current_app.response_class(receipt['response'], status=receipt['status'], mimetype='application/json')
            else:
                from flask import current_app
                response = current_app.make_response(fn(*args, **kwargs))
                if getattr(g, 'member_operation', False):
                    from .membership import require_member
                    require_member()
                if response.status_code < 400:
                    db.execute('INSERT INTO workflow_receipts VALUES (?, ?, ?, ?, ?)',
                               (g.user_id, key, fingerprint, response.get_data(as_text=True), response.status_code))
            from .rewards import check_admission_commit
            check_admission_commit()
            db.commit()
            if owns_photos:
                from .photo import remove_photo_file
                for photo in g.cover_removed_photos:
                    remove_photo_file(photo)
            return response
        except Exception:
            db.rollback()
            raise
        finally:
            g.pop('workflow_transaction', None)
            if owns_photos:
                g.pop('cover_removed_photos', None)
    return wrapped


def optional_date(data, key, label):
    if not data.get(key):
        return None
    try:
        normalized = date.fromisoformat(data[key]).isoformat()
        if normalized != data[key]:
            raise ValueError()
        return normalized
    except (ValueError, TypeError):
        raise InputError(label + '无效') from None


def past_date(data, key, label):
    result = optional_date(data, key, label)
    if not result or result > today().isoformat():
        raise InputError(label + '必须是不晚于今天的有效日期')
    return result


def detach_device(item_id, owner):
    """Keep expense/payment snapshots when the parent is permanently removed."""
    for table in ('fixed_expenses', 'expense_payments'):
        for row in rows(table, owner):
            if row.get('item_id') != item_id:
                continue
            row.update(item_id=None, item_removed=True, revision=row.get('revision', 0) + 1)
            if enabled():
                from .cloud_repository import change
                change(table, row['id'], {'item_id': None, 'item_removed': True, 'revision': row['revision']})
            else:
                get_db().execute(f'UPDATE {table} SET payload=? WHERE id=? AND user_id=?',
                                 (json.dumps(row, ensure_ascii=False), row['id'], owner))
    g.pop('payment_ledger', None)
    g.pop('fixed_cost_totals', None)


def integer(data, key, label, maximum):
    number = data.get(key)
    if isinstance(number, bool) or not isinstance(number, int) or not 1 <= number <= maximum:
        raise InputError(label + '超出有效范围')
    return number


def device(ident):
    if ident in (None, ''):
        return None, ''
    if isinstance(ident, bool) or not isinstance(ident, int):
        raise InputError('关联物品编号无效')
    from .repository import item_row
    row = item_row(ident)
    return row['id'], row['name']


def device_state(ident):
    if not ident:
        return None
    cache = getattr(g, 'expense_devices', None)
    if cache is None:
        if enabled():
            from .cloud_repository import query
            devices = query('items', {'user_id': g.user_id})
        else:
            devices = [dict(r) for r in get_db().execute('SELECT * FROM items WHERE user_id=?', (g.user_id,))]
        cache = {r['id']: r for r in devices}
        g.expense_devices = cache
    row = cache.get(ident)
    if not row or row['user_id'] != g.user_id or row.get('purging'):
        return 'removed'
    return 'deleted' if row.get('deleted_at') else row['status']


def similarity(name, category):
    from .repository import list_item_rows
    def normalize(text):
        return ''.join(c for c in unicodedata.normalize('NFKC', text).casefold() if c.isalnum())
    needle = normalize(name)
    candidates = []
    for row in list_item_rows(g.user_id):
        if row['status'] == 'disposed':
            continue
        other = normalize(row['name'])
        rank = 0 if needle and needle == other else 1 if min(len(needle), len(other)) >= 2 and (needle in other or other in needle) else 2 if category and category == row['category'] else 9
        if rank < 9:
            from .services import item_payload
            candidates.append((rank, row['id'], {**item_payload(row), 'match_reason': ('名称相同', '名称相近', '分类相同')[rank]}))
    return [r[2] for r in sorted(candidates, key=lambda r: (r[0], -r[1]))[:3]]


def wish_payload(row, similar=False):
    result = {k: v for k, v in row.items() if k not in ('user_id', '_id', 'expected_cents')}
    result['expected_price'] = money(row['expected_cents']) if row['expected_cents'] is not None else ''
    result['review_days'] = (date.fromisoformat(row['review_on']) - today()).days if row['review_on'] else None
    result['item_available'] = device_state(row.get('item_id')) in ('active', 'idle', 'disposed')
    if similar:
        result['similar_items'] = similarity(row['name'], row['category'])
    return result


@bp.route('/api/mp/wishlist', methods=['GET', 'POST'])
@mutation
def wishes():
    if request.method == 'GET':
        return jsonify([wish_payload(r) for r in sorted(rows('wishlist'), key=lambda r: -r['id'])])
    return write_wish(None)


def write_wish(row):
    creating = row is None
    data = body()
    state = data.get('status', row['status'] if row else 'considering')
    if state not in ('considering', 'declined') and not (row and row['status'] == state == 'purchased'):
        raise InputError('已购入状态只能通过转为物品设置')
    if row and row['status'] == 'purchased' and state != 'purchased':
        raise InputError('已购入心愿不能再次转换')
    row = {**(row or {}), 'name': value(data, 'name', '名称'),
           'expected_cents': cents_value(data, 'expected_price', '预计价格') if data.get('expected_price') not in (None, '') else None,
           'reason': value(data, 'reason', '购买理由', 1000, False),
           'category': value(data, 'category', '分类', 60, False),
           'review_on': optional_date(data, 'review_on', '重新考虑日期'), 'status': state,
           'item_id': row.get('item_id') if row else None}
    return jsonify(wish_payload(save('wishlist', row), True)), 201 if creating else 200


@bp.route('/api/mp/wishlist/<int:ident>', methods=['GET', 'PUT', 'DELETE'])
@mutation
def wish_detail(ident):
    row = owned('wishlist', ident)
    if request.method == 'GET':
        return jsonify(wish_payload(row, True))
    revision(row)
    if request.method == 'DELETE':
        remove('wishlist', ident)
        return '', 204
    return write_wish(row)


@bp.post('/api/mp/wishlist/<int:ident>/convert')
@mutation
def convert(ident):
    row = owned('wishlist', ident)
    from .repository import create_item, item_row
    from .services import item_payload
    if row.get('item_id'):
        if device_state(row['item_id']) not in ('active', 'idle', 'disposed'):
            abort(410, description='已转换的物品已删除，不能重复创建')
        return jsonify(item_payload(item_row(row['item_id']), True))
    revision(row)
    data = body()
    purchased = past_date(data, 'purchase_date', '购买日期')
    state = data.get('status', 'active')
    if state not in ('active', 'idle'):
        raise InputError('新物品状态只能是使用中或闲置')
    args = (g.user_id, value(data, 'name', '物品名称'), value(data, 'category', '分类', 60),
            icon_type_value(data, 'other'), purchased, warranty_value(data, purchased),
            cents_value(data, 'purchase_price', '购买价格'), value(data, 'notes', '备注', 1000, False), state)
    from .locations import location_value
    location = location_value(data)
    from .covers import cover_fields
    cover = cover_fields(data)
    if enabled():
        item_id = create_item(*args, storage_location_id=location, **cover)
    else:
        item_id = get_db().execute('INSERT INTO items(user_id,name,category,icon_type,purchase_date,warranty_expires_on,purchase_cents,notes,status,storage_location_id,cover_mode,cover_icon_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', (*args, location, cover['cover_mode'], cover['cover_icon_key'])).lastrowid
    save('wishlist', {**row, 'status': 'purchased', 'item_id': item_id})
    from .ledger import sync_purchase
    sync_purchase(item_id, data, new=True)
    return jsonify(item_payload(item_row(item_id), True)), 201


def cycle_date(plan, index):
    origin = date.fromisoformat(plan['anchor_on'])
    if plan['cycle'] == 'days':
        return origin + timedelta(days=plan['cycle_days'] * index)
    count = {'month': 1, 'quarter': 3, 'year': 12}[plan['cycle']] * index
    year, month = divmod(origin.year * 12 + origin.month - 1 + count, 12)
    if year > 9999:
        raise InputError('日期超出有效范围')
    return date(year, month + 1, min(origin.day, calendar.monthrange(year, month + 1)[1]))


def ledger(user_id=None):
    owner = g.user_id if user_id is None else user_id
    cached = getattr(g, 'payment_ledger', None)
    if not cached or cached[0] != owner:
        cached = (owner, [r for r in rows('expense_payments', owner) if not r.get('voided')])
        g.payment_ledger = cached
    return cached[1]


def item_totals(user_id):
    cached = getattr(g, 'fixed_cost_totals', None)
    if cached and cached[0] == user_id:
        return cached[1]
    result = {}
    for row in ledger(user_id):
        ident = row.get('item_id')
        if ident:
            result[ident] = result.get(ident, 0) + row['cost_cents']
    g.fixed_cost_totals = (user_id, result)
    return result


def spending(user_id, start=None, end=None):
    selected = [r for r in ledger(user_id) if (not start or r['paid_on'] >= start) and (not end or r['paid_on'] <= end)]
    return {'count': len(selected), 'cents': sum(r['cost_cents'] for r in selected),
            'principal_cents': sum(r['principal_cents'] for r in selected),
            'unlinked_cents': sum(r['cost_cents'] for r in selected if not r.get('item_id')),
            'linked_cents': sum(r['cost_cents'] for r in selected if r.get('item_id'))}


def payment_payload(row):
    result = {k: v for k, v in row.items() if k not in ('user_id', '_id', 'cost_cents', 'principal_cents')}
    result.update(amount=money(row['cost_cents']), principal=money(row['principal_cents']),
                  item_available=device_state(row.get('item_id')) in ('active', 'idle', 'disposed'))
    return result


def plan_payload(plan, payments=None):
    selected = [r for r in (ledger() if payments is None else payments) if r['expense_id'] == plan['id'] and not r.get('voided')]
    occupied = {r['cycle_index'] for r in selected if r['schedule_version'] == plan['schedule_version']}
    index = 0
    while index in occupied:
        index += 1
    paid_principal = sum(r['principal_cents'] for r in selected)
    complete = plan['kind'] == 'installment' and paid_principal >= plan['principal_total_cents']
    due = None if complete else cycle_date(plan, index).isoformat()
    state = device_state(plan.get('item_id'))
    result = {k: v for k, v in plan.items() if k not in ('user_id', '_id', 'amount_cents', 'principal_total_cents')}
    principal = 0
    if plan['kind'] == 'installment' and not complete:
        principal = min(plan['principal_total_cents'] - paid_principal,
                        plan['principal_total_cents'] // plan['periods'] if index < plan['periods'] - 1 else plan['principal_total_cents'] - paid_principal)
    result.update(amount=money(plan['amount_cents']), principal_total=money(plan['principal_total_cents']),
                  paid_principal=money(paid_principal), remaining_principal=money(max(0, plan['principal_total_cents'] - paid_principal)),
                  suggested_principal=money(principal), paid_periods=len(selected), next_cycle_index=index,
                  planned_payment=money(principal + plan['amount_cents']) if not complete else '0.00',
                  next_due_on=due, due_days=(date.fromisoformat(due) - today()).days if due else None,
                  remaining_days=(date.fromisoformat(plan['service_until']) - today()).days if plan.get('service_until') else None,
                  item_available=state in ('active', 'idle', 'disposed'),
                  check_renewal=bool(plan.get('item_removed') or state in ('disposed', 'deleted', 'removed')),
                  completed=complete, paid_cost=money(sum(r['cost_cents'] for r in selected)))
    return result


def write_plan(row):
    data = body()
    initial = data.get('initial_payment')
    if 'initial_payment' in data and (row or not isinstance(initial, dict)):
        raise InputError('首笔付款仅支持在新增计划时填写')
    if initial is not None:
        if set(initial) - {'paid_on', 'amount', 'principal', 'notes', 'enable_ledger'}:
            raise InputError('首笔付款字段无效')
        if 'enable_ledger' in initial and not isinstance(initial['enable_ledger'], bool):
            raise InputError('请明确确认是否启用记账')
    kind = data.get('kind', 'subscription')
    if kind not in ('subscription', 'installment'):
        raise InputError('费用类型无效')
    if row and row['kind'] != kind:
        raise InputError('费用类型不能更改，请另建费用档案')
    state = data.get('status', 'active')
    if state not in ('active', 'paused', 'ended'):
        raise InputError('费用状态无效')
    cycle = 'month' if kind == 'installment' else data.get('cycle', 'month')
    if cycle not in ('month', 'quarter', 'year', 'days'):
        raise InputError('周期无效')
    cycle_days = integer(data, 'cycle_days', '周期天数', 3650) if cycle == 'days' else 1
    anchor = optional_date(data, 'anchor_on', '首期／下次付款日期')
    if not anchor:
        raise InputError('请选择首期／下次付款日期')
    ident, snapshot = device(data.get('item_id')) if not row or data.get('item_id') != row.get('item_id') else (row.get('item_id'), row.get('item_name', ''))
    total = cents_value(data, 'principal_total', '本金总额') if kind == 'installment' else 0
    periods = integer(data, 'periods', '总期数', 600) if kind == 'installment' else 1
    amount = cents_value(data, 'amount', '计划金额／每期额外费用')
    if kind == 'installment' and (total < periods or total < sum(r['principal_cents'] for r in ledger() if row and r['expense_id'] == row['id'])):
        raise InputError('本金总额不能低于已还本金或总期数（分）')
    service_from = optional_date(data, 'service_from', '服务开始日期')
    service_until = optional_date(data, 'service_until', '服务到期日期')
    if service_from and service_until and service_from > service_until:
        raise InputError('服务到期不能早于开始日期')
    fields = dict(name=value(data, 'name', '费用名称'), kind=kind, status=state, cycle=cycle,
                  cycle_days=cycle_days, anchor_on=anchor, amount_cents=amount,
                  principal_total_cents=total, periods=periods, item_id=ident, item_name=snapshot,
                  service_from=service_from, service_until=service_until,
                  notes=value(data, 'notes', '备注', 1000, False))
    fields['item_removed'] = bool(row and row.get('item_removed') and ident == row.get('item_id'))
    if row and kind == 'subscription' and anchor == row['anchor_on'] and (cycle != row['cycle'] or cycle_days != row['cycle_days']):
        fields['anchor_on'] = plan_payload(row)['next_due_on']
    schedule_change = row and any(fields[k] != row[k] for k in ('anchor_on', 'cycle', 'cycle_days'))
    if row and kind == 'installment' and schedule_change and any(r['expense_id'] == row['id'] for r in ledger()):
        raise InputError('已有还款的分期不能更改首期日期，请调整未付款记录的实际金额')
    saved = save('fixed_expenses', {**(row or {}), **fields,
                 'schedule_version': (row.get('schedule_version', 0) + int(bool(schedule_change))) if row else 0})
    payment = None
    if initial is not None:
        from .ledger import settings, enable_ledger
        if not settings()['enabled']:
            if initial.get('enable_ledger') is not True:
                raise InputError('请先确认启用记账，或仅保存计划')
            enable_ledger()
        payment = record_payment(saved, {**initial, 'cycle_index': 0})
    result = plan_payload(saved)
    result.update(initial_payment_created=payment is not None,
                  initial_payment_id=payment['id'] if payment else None)
    return jsonify(result), 200 if row else 201


@bp.route('/api/mp/fixed-expenses', methods=['GET', 'POST'])
@mutation
def plans():
    if request.method == 'GET':
        payments = ledger()
        return jsonify(plans=[plan_payload(r, payments) for r in sorted(rows('fixed_expenses'), key=lambda r: -r['id'])],
                       totals={k: (money(v) if k != 'count' else v) for k, v in spending(g.user_id).items()})
    return write_plan(None)


@bp.route('/api/mp/fixed-expenses/<int:ident>', methods=['GET', 'PUT', 'DELETE'])
@mutation
def plan_detail(ident):
    row = owned('fixed_expenses', ident)
    if request.method == 'GET':
        return jsonify(**plan_payload(row), payments=[payment_payload(r) for r in sorted(rows('expense_payments'), key=lambda r: (r['paid_on'], r['id']), reverse=True) if r['expense_id'] == ident])
    revision(row)
    if request.method == 'DELETE':
        if any(r['expense_id'] == ident for r in rows('expense_payments')):
            raise InputError('已有付款历史，请结束或归档费用')
        remove('fixed_expenses', ident)
        return '', 204
    return write_plan(row)


def payment_fields(data, plan, old=None):
    paid = past_date(data, 'paid_on', '付款日期')
    if paid > today().isoformat():
        raise InputError('付款日期不能晚于今天')
    principal = cents_value(data, 'principal', '本金') if plan['kind'] == 'installment' else 0
    cost = cents_value(data, 'amount', '服务费／利息手续费')
    if principal + cost == 0:
        raise InputError('付款金额必须大于零')
    previous = sum(r['principal_cents'] for r in ledger() if r['expense_id'] == plan['id'] and (not old or r['id'] != old['id']))
    if previous + principal > plan['principal_total_cents'] and plan['kind'] == 'installment':
        raise InputError('累计已还本金不能超过本金总额')
    source = old or plan
    if 'item_id' not in data or data['item_id'] == source.get('item_id'):
        ident, snapshot = source.get('item_id'), source.get('item_name', '')
        if device_state(ident) == 'removed':
            ident = None
    else:
        ident, snapshot = device(data['item_id'])
    return dict(paid_on=paid, principal_cents=principal, cost_cents=cost, item_id=ident, item_name=snapshot,
                notes=value(data, 'notes', '付款备注', 1000, False))


def invalidate_item(ident):
    if enabled() and ident:
        from .cloud_repository import get, touch
        row = get('items', ident)
        if row and row['user_id'] == g.user_id and not row.get('purging'):
            touch(row)


@bp.post('/api/mp/fixed-expenses/<int:ident>/payments')
@mutation
def pay(ident):
    plan = owned('fixed_expenses', ident)
    revision(plan)
    return jsonify(payment_payload(record_payment(plan, body()))), 201


def record_payment(plan, data):
    """The plan and its ledger entry are committed by the caller's transaction."""
    if plan['status'] != 'active':
        raise InputError('请先恢复费用管理再确认付款')
    index = data.get('cycle_index')
    current = plan_payload(plan)
    if isinstance(index, bool) or not isinstance(index, int) or index != current['next_cycle_index'] or current['completed']:
        abort(409, description='付款周期已更新，请刷新核对')
    fields = payment_fields(data, plan)
    paid = save('expense_payments', {**fields, 'expense_id': plan['id'], 'cycle_index': index,
                'schedule_version': plan['schedule_version'], 'due_on': cycle_date(plan, index).isoformat(),
                'cycle': plan['cycle'], 'cycle_days': plan['cycle_days'], 'kind': plan['kind'],
                'expense_name': plan['name'], 'planned_amount': money(plan['amount_cents']),
                'service_until': optional_date(data, 'service_until', '新服务到期日期') or plan.get('service_until'), 'voided': False})
    if plan['kind'] == 'subscription' and data.get('service_until'):
        until = optional_date(data, 'service_until', '新服务到期日期')
        if plan.get('service_from') and until < plan['service_from']:
            raise InputError('服务到期不能早于开始日期')
        plan['service_until'] = until
    save('fixed_expenses', plan)
    invalidate_item(fields['item_id'])
    return paid


def void_payment(plan, payment):
    """Shared by both the payment history and the cash-ledger delete action."""
    if payment['expense_id'] != plan['id'] or payment['user_id'] != plan['user_id']:
        abort(404)
    if payment['voided']:
        abort(409, description='付款已作废，请刷新核对')
    saved = save('expense_payments', {**payment, 'voided': True})
    save('fixed_expenses', plan)
    invalidate_item(payment.get('item_id'))
    return saved


@bp.route('/api/mp/fixed-expenses/<int:ident>/payments/<int:payment_id>', methods=['PUT', 'DELETE'])
@mutation
def change_payment(ident, payment_id):
    plan = owned('fixed_expenses', ident)
    revision(plan)
    old = owned('expense_payments', payment_id)
    if old['expense_id'] != ident:
        abort(404)
    if old['voided']:
        abort(409, description='付款已作废，请刷新核对')
    if request.method == 'DELETE':
        return jsonify(payment_payload(void_payment(plan, old)))
    fields = payment_fields(body(), plan, old)
    saved = save('expense_payments', {**old, **fields})
    save('fixed_expenses', plan)
    invalidate_item(old.get('item_id'))
    invalidate_item(saved.get('item_id'))
    return jsonify(payment_payload(saved))
