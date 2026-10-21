"""Cash receipts, source-linked spending and refunds. Item cost rules stay separate."""
import calendar
import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from functools import wraps
from flask import Blueprint, abort, g, jsonify, request
from .cloud_runtime import enabled
from .database import get_db
from .validation import InputError, body, cents_value, date_value, money, natural_today, value

bp = Blueprint('ledger', __name__)
EXPENSE = {'food': '餐饮', 'transport': '交通', 'shopping': '购物', 'home': '居家', 'fun': '娱乐',
           'health': '健康', 'study': '学习', 'other': '其他'}
INCOME = {'salary': '工资', 'parttime': '兼职', 'gift': '红包礼金', 'investment': '投资收益',
          'bonus': '奖金补贴', 'business': '经营收入', 'reimbursement': '报销回款', 'other': '其他'}
AUTO = {'purchase': '物品购置', 'maintenance': '维修', 'subscription': '订阅', 'installment': '分期', 'disposal': '处置回收'}
SOURCES = {'manual': '手动记账', 'purchase': '物品购置', 'maintenance': '维修支出',
           'subscription': '订阅付款', 'installment': '分期付款', 'disposal': '处置回收', 'refund': '关联退款'}


def now():
    return datetime.now(timezone.utc).isoformat(timespec='microseconds')


def entry_key(source, ident):
    return hashlib.sha256(f'{g.user_id}:{source}:{ident}'.encode()).hexdigest()[:32]


def read(table, key):
    if enabled():
        from .cloud_repository import get
        row = get(table, key)
        return row if row and row['user_id'] == g.user_id else None
    row = get_db().execute(f'SELECT payload FROM {table} WHERE id=? AND user_id=?', (str(key), g.user_id)).fetchone()
    return json.loads(row['payload']) if row else None


def rows():
    cached = getattr(g, 'cash_ledger_rows', None)
    if cached is not None:
        return cached
    if enabled():
        from .cloud_repository import query
        selected = query('ledger_entries', {'user_id': g.user_id})
    else:
        selected = [json.loads(r['payload']) for r in get_db().execute('SELECT payload FROM ledger_entries WHERE user_id=?', (g.user_id,))]
    g.cash_ledger_rows = selected
    return selected


def write(table, key, row):
    if table == 'ledger_entries':
        from .growth import track_ledger
        track_ledger(read(table, key), row)
    g.pop('cash_ledger_rows', None)
    saved = {k: v for k, v in row.items() if k != '_id'}
    saved.update(id=str(key), user_id=g.user_id)
    if enabled():
        from .cloud_repository import put, change
        (change if read(table, key) else put)(table, str(key), saved)
    else:
        get_db().execute(f'INSERT INTO {table}(id,user_id,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
                         (str(key), g.user_id, json.dumps(saved, ensure_ascii=False)))
    return saved


def settings():
    return read('ledger_settings', str(g.user_id)) or {'enabled': False}


def enable_ledger():
    row = settings()
    if not row['enabled']:
        row = write('ledger_settings', str(g.user_id), {'enabled': True, 'enabled_at': now(), 'revision': 0})
    return row


def require_enabled():
    if not settings()['enabled']:
        abort(409, description='请先启用记账')


def owned(ident):
    row = read('ledger_entries', ident) if re.fullmatch(r'[a-f0-9]{32}', ident) else None
    if not row:
        abort(404)
    return row


def revision(row):
    from .cloud_versions import require_revision, VersionError
    try:
        require_revision(row)
    except VersionError as error:
        raise VersionError(error.status, error.code, error.message.replace('物品', '账目')) from error


def mutation(fn):
    """Wrap legacy source routes too; legacy requests remain atomic without a receipt."""
    @wraps(fn)
    def wrapped(*args, **kwargs):
        if request.method == 'GET' or enabled() or getattr(g, 'workflow_transaction', False):
            return fn(*args, **kwargs)
        if request.headers.get('Idempotency-Key'):
            from .purchases import mutation as workflow
            return workflow(fn)(*args, **kwargs)
        db = get_db()
        db.execute('BEGIN IMMEDIATE')
        g.workflow_transaction = True
        g.cover_removed_photos = []
        try:
            result = fn(*args, **kwargs)
            if getattr(g, 'member_operation', False):
                from .membership import require_member
                require_member()
            from .rewards import check_admission_commit
            check_admission_commit()
            db.commit()
            from .photo import remove_photo_file
            for photo in g.cover_removed_photos:
                remove_photo_file(photo)
            return result
        except Exception:
            db.rollback()
            raise
        finally:
            g.pop('workflow_transaction', None)
            g.pop('cover_removed_photos', None)
    return wrapped


def remember(row, changes, reason):
    old = dict(row or {})
    history = old.get('changes', [])[-39:]
    if old:
        history = [*history, {'at': now(), 'reason': reason, 'before': {k: old.get(k) for k in
                   ('amount_cents', 'occurred_on', 'category', 'name', 'notes', 'state', 'parent_id', 'item_id')}}]
    return {**old, **changes, 'revision': old.get('revision', -1) + 1,
            'created_at': old.get('created_at') or now(), 'updated_at': now(), 'changes': history}


def item_raw(ident):
    if not ident:
        return None
    if enabled():
        from .cloud_repository import get
        row = get('items', ident)
        return row if row and row['user_id'] == g.user_id else None
    row = get_db().execute('SELECT * FROM items WHERE id=? AND user_id=?', (ident, g.user_id)).fetchone()
    return dict(row) if row else None


def item_reference(data, default=None):
    ident = data.get('item_id', default)
    if ident is None:
        return None, ''
    if isinstance(ident, bool) or not isinstance(ident, int):
        raise InputError('关联物品无效')
    item = item_raw(ident)
    if not item or item.get('deleted_at') or item.get('purging'):
        abort(404)
    return ident, item['name']


def refunds(parent_id, exclude=None):
    return [r for r in rows() if r.get('parent_id') == parent_id and r['state'] == 'active' and r['id'] != exclude]


def protect_refunds(row, amount, state='active', occurred_on=None):
    linked = refunds(row['id']) if row else []
    if linked and (state != 'active' or sum(r['amount_cents'] for r in linked) > amount or
                   occurred_on and any(r['occurred_on'] < occurred_on for r in linked)):
        abort(409, description='请先核对关联退款，原支出不能作废、超过退款总额减少或晚于退款日期')


def payment_info(item):
    info = item.get('payment_info')
    return json.loads(info) if isinstance(info, str) and info else info


def save_payment_info(item_id, info):
    if enabled():
        from .cloud_repository import touch
        touch(item_raw(item_id), {'payment_info': info})
    else:
        get_db().execute('UPDATE items SET payment_info=?,revision=revision+1 WHERE id=? AND user_id=?',
                         (json.dumps(info, ensure_ascii=False), item_id, g.user_id))


def settlement(data):
    if not isinstance(data, dict) or data.get('mode') not in ('paid', 'installment', 'archive'):
        raise InputError('请确认已付款、分期或仅建档')
    info = {'mode': data['mode']}
    if data['mode'] != 'archive':
        amount = decimal_amount(data, '实际付款金额' if data['mode'] == 'paid' else '首付金额')
        if data['mode'] == 'paid' and amount <= 0:
            raise InputError('已付款金额必须大于零；免费物品请选择仅建档')
        info.update(amount=money(amount), paid_on=date_value(data, 'paid_on', '付款日期'))
        if data.get('existing_entry_id'):
            info['existing_entry_id'] = value(data, 'existing_entry_id', '已有账目', 32)
    return info


def decimal_amount(data, label='金额'):
    raw = data.get('amount')
    if not isinstance(raw, str) or not re.fullmatch(r'[0-9]+(?:\.[0-9]{1,2})?', raw):
        raise InputError(label + '请使用最多两位小数的金额字符串')
    return cents_value(data, 'amount', label)


def source_entry(source, ident, fields, new=False, force=False):
    key = entry_key(source, ident)
    old = read('ledger_entries', key)
    if not force and (not settings()['enabled'] or not old and not new):
        return None
    amount = fields['amount_cents']
    state = fields.get('state', 'active' if amount else 'zero')
    protect_refunds(old, amount, state, fields.get('occurred_on'))
    saved = remember(old, {'kind': 'expense', 'parent_id': None, **fields, 'state': state,
                          'source': source, 'source_id': ident}, 'source_sync')
    return write('ledger_entries', key, saved)


def sync_purchase(item_id, data=None, new=False, force=False):
    item = item_raw(item_id)
    explicit = data is not None and 'payment_info' in data
    info = settlement(data['payment_info']) if explicit else payment_info(item)
    if explicit:
        save_payment_info(item_id, info)
    amount = cents_value(info, 'amount', '付款金额') if info and info['mode'] != 'archive' else 0
    fields = {'amount_cents': amount, 'occurred_on': info.get('paid_on', item['purchase_date']) if info else item['purchase_date'],
              'category': 'purchase', 'name': item['name'], 'notes': item['notes'], 'item_id': item_id,
              'item_name': item['name'], 'principal_cents': 0, 'cost_cents': amount,
              'state': ('active' if amount else 'zero') if info else 'pending',
              'settlement_mode': info['mode'] if info else None}
    old = read('ledger_entries', entry_key('purchase', item_id))
    linked = info.get('existing_entry_id') if info else None
    if linked and not (old and old.get('manual_entry_id') == linked):
        manual = owned(linked)
        if manual['source'] != 'manual' or manual['kind'] != 'expense' or manual['state'] != 'active' or refunds(linked):
            raise InputError('请选择尚未关联来源、没有退款的有效手动支出')
        if manual['amount_cents'] != amount or manual['occurred_on'] != fields['occurred_on'] or manual.get('item_id') not in (None, item_id):
            raise InputError('已有账目的金额、日期或关联物品不一致，请核对')
        if old and old['state'] == 'active':
            raise InputError('该物品已经入账，请先核对，不能再次选用手动支出')
        auto_id = entry_key('purchase', item_id)
        write('ledger_entries', linked, remember(manual, {'state': 'linked', 'linked_entry_id': auto_id}, 'bind_purchase'))
        fields['manual_entry_id'] = linked
        force = True
    return source_entry('purchase', item_id, fields, new=new or explicit, force=force)


def sync_event(kind, record, new=False, void=False, force=False):
    record = dict(record)
    item = item_raw(record['item_id'])
    is_repair = kind == 'maintenance'
    fields = {'amount_cents': record['cost_cents' if is_repair else 'proceeds_cents'],
              'occurred_on': record['maintained_on' if is_repair else 'disposed_on'],
              'kind': 'expense' if is_repair else 'income', 'category': kind,
              'name': (item['name'] if item else '物品') + ('维修' if is_repair else '回收'),
              'notes': record['description' if is_repair else 'notes'], 'item_id': record['item_id'],
              'item_name': item['name'] if item else '物品', 'cost_cents': 0, 'principal_cents': 0}
    if void:
        fields['state'] = 'void'
    return source_entry(kind, record['id'], fields, new=new, force=force)


def sync_payment(record, new=False, force=False):
    fields = {'amount_cents': record['principal_cents'] + record['cost_cents'], 'occurred_on': record['paid_on'],
              'category': record['kind'], 'name': record['expense_name'], 'notes': record.get('notes', ''),
              'item_id': record.get('item_id'), 'item_name': record.get('item_name', ''),
              'principal_cents': record['principal_cents'], 'cost_cents': record['cost_cents'],
              'expense_id': record['expense_id']}
    if record['voided']:
        fields['state'] = 'void'
    return source_entry(record['kind'], record['id'], fields, new=new, force=force)


def source_available(row):
    source, ident = row['source'], row.get('source_id')
    if source in ('manual', 'refund'):
        return False
    if source == 'purchase':
        item = item_raw(ident)
        return bool(item and not item.get('purging'))
    if source in ('subscription', 'installment'):
        return bool(read('expense_payments', ident))
    if enabled():
        from .cloud_repository import get
        record = get(source + '_records', ident)
    else:
        record = get_db().execute(f'SELECT * FROM {source}_records WHERE id=?', (ident,)).fetchone()
    if not record:
        return False
    item = item_raw(record['item_id'])
    return bool(item and not item.get('purging'))


def payload(row, detail=False):
    item = item_raw(row.get('item_id'))
    result = {k: v for k, v in row.items() if k not in ('_id', 'user_id', 'amount_cents', 'principal_cents', 'cost_cents', 'changes', 'create_fingerprint')}
    category = (INCOME if row['kind'] == 'income' else EXPENSE).get(row['category'], AUTO.get(row['category'], '其他'))
    result.update(amount=money(row['amount_cents']), principal=money(row.get('principal_cents', 0)),
                  cost=money(row.get('cost_cents', 0)), category_name=category, source_name=SOURCES[row['source']],
                  item_available=bool(item and not item.get('deleted_at') and not item.get('purging')),
                  item_removed=bool(row.get('item_id') and (not item or item.get('purging'))),
                  editable=row['source'] in ('manual', 'refund') or not source_available(row),
                  deletable=row['state'] == 'active' and (row['source'] in ('manual', 'refund', 'subscription', 'installment') or not source_available(row)),
                  refunded=money(sum(r['amount_cents'] for r in refunds(row['id']))))
    from .membership import decorate
    result.update(decorate(row))
    if detail:
        result['refunds'] = [payload(r) for r in sorted(refunds(row['id']), key=lambda r: (r['occurred_on'], r['created_at']), reverse=True)]
        result['changes'] = row.get('changes', [])
    return result


def fields(data, old=None, parent=None):
    kind = parent['kind'] if parent else data.get('kind')
    if kind not in ('expense', 'income'):
        raise InputError('请选择支出或收入')
    category = parent['category'] if parent else data.get('category')
    if not isinstance(category, str) or not parent and category not in (INCOME if kind == 'income' else EXPENSE) and not (old and category == old['category']):
        raise InputError('请选择有效分类')
    amount = decimal_amount(data)
    if not amount:
        raise InputError('金额必须大于零')
    occurred = date_value(data, 'occurred_on', '日期')
    if parent:
        if parent['kind'] != 'expense' or parent['state'] != 'active':
            raise InputError('只能对有效支出添加退款')
        if occurred < parent['occurred_on']:
            raise InputError('退款日期不能早于原支出日期')
        if amount + sum(r['amount_cents'] for r in refunds(parent['id'], old['id'] if old else None)) > parent['amount_cents']:
            raise InputError('累计退款不能超过原支出')
        item_id, item_name = parent.get('item_id'), parent.get('item_name', '')
    else:
        if old and data.get('item_id') == old.get('item_id'):
            item_id, item_name = old.get('item_id'), old.get('item_name', '')
        else:
            item_id, item_name = item_reference(data)
    return {'kind': 'refund' if parent else kind, 'amount_cents': amount, 'occurred_on': occurred,
            'category': category, 'name': value(data, 'name', '名称', 120, False) or
            ((parent['name'] + '退款') if parent else (INCOME if kind == 'income' else EXPENSE).get(category, AUTO.get(category, '其他'))),
            'notes': value(data, 'notes', '备注', 1000, False), 'item_id': item_id, 'item_name': item_name}


def operation(data, parent_id=None):
    op = data.get('operation_id')
    if op is None:
        return uuid.uuid4().hex, None, None
    if not isinstance(op, str) or not re.fullmatch(r'[A-Za-z0-9_-]{16,100}', op):
        raise InputError('提交编号无效')
    ident = entry_key('operation', op)
    fingerprint = hashlib.sha256(json.dumps([parent_id, data], sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    old = read('ledger_entries', ident)
    if old and old.get('create_fingerprint') != fingerprint:
        abort(409, description='这次提交的内容已变化，请先核对原账目')
    return ident, fingerprint, old


@bp.get('/api/mp/ledger/operations/<op>')
def operation_result(op):
    require_enabled()
    if not re.fullmatch(r'[A-Za-z0-9_-]{16,100}', op):
        abort(404)
    row = owned(entry_key('operation', op))
    if row['state'] == 'batch':
        return jsonify(imported=row['imported'], count=len(row['imported']))
    return jsonify(payload(row, True))


def month_range():
    month = request.args.get('month', natural_today().strftime('%Y-%m'))
    if not re.fullmatch(r'[0-9]{4}-(?:0[1-9]|1[0-2])', month) or not 1 <= int(month[:4]) <= 9999:
        raise InputError('月份无效')
    return month, month + '-01', f'{month}-{calendar.monthrange(int(month[:4]), int(month[5:]))[1]}'


def totals(selected):
    income = sum(r['amount_cents'] for r in selected if r['kind'] == 'income')
    expense = sum(r['amount_cents'] for r in selected if r['kind'] == 'expense')
    refund = sum(r['amount_cents'] for r in selected if r['kind'] == 'refund')
    net_expense, net = expense - refund, income + refund - expense
    return {'income': money(income), 'gross_expense': money(expense), 'refund': money(refund),
            'expense': money(abs(net_expense)), 'expense_label': '本月支出' if net_expense >= 0 else '本月退款结余',
            'net': money(abs(net)), 'net_label': '本月净收入' if net > 0 else '本月净支出' if net < 0 else '本月收支持平', 'count': len(selected)}


@bp.route('/api/mp/ledger/settings', methods=['GET', 'POST'])
@mutation
def configure():
    row = settings()
    if request.method == 'POST' and not row['enabled']:
        row = enable_ledger()
    return jsonify(enabled=row['enabled'], enabled_at=row.get('enabled_at'), categories={'expense': EXPENSE, 'income': INCOME, 'automatic': AUTO}, sources=SOURCES)


@bp.route('/api/mp/ledger/entries', methods=['GET', 'POST'])
@mutation
def entries():
    require_enabled()
    if request.method == 'POST':
        data = body()
        ident, fingerprint, old = operation(data)
        if old:
            return jsonify(payload(old, True)), 201
        row = remember(None, {**fields(data), 'source': 'manual', 'source_id': None, 'parent_id': None,
                             'create_fingerprint': fingerprint, 'state': 'active'}, 'create')
        saved = write('ledger_entries', ident, row)
        from .membership import assign_new
        assign_new(saved, data)
        return jsonify(payload(saved, True)), 201
    month, first, last = month_range()
    from .membership import filter_book
    selected = filter_book([r for r in rows() if r['state'] == 'active' and first <= r['occurred_on'] <= last])
    summary = totals(selected)
    selected_date = None
    if 'date' in request.args:
        selected_date = date_value({'date': request.args['date']}, 'date', '查询日期')
        if selected_date[:7] != month:
            raise InputError('查询日期须属于当前月份')
        selected = [r for r in selected if r['occurred_on'] == selected_date]
    query = request.args.get('q', '').strip()[:120].casefold()
    for key in ('kind', 'category', 'source'):
        choice = request.args.get(key, '')
        if choice:
            selected = [r for r in selected if r[key] == choice]
    if query:
        selected = [r for r in selected if query in ' '.join(str(r.get(k, '')) for k in ('name', 'notes', 'item_name')).casefold()]
    by_day = {}
    for row in selected:
        by_day.setdefault(row['occurred_on'], []).append(row)
    day_summaries = {day: totals(group) for day, group in by_day.items()}
    selected.sort(key=lambda r: (r['occurred_on'], r['created_at'], r['id']), reverse=True)
    try:
        offset = max(0, int(request.args.get('offset', 0)))
    except ValueError:
        raise InputError('分页无效')
    page = selected[offset:offset + 30]
    return jsonify(month=month, date=selected_date, summary=summary, filtered_summary=totals(selected),
                   day_summaries=day_summaries, entries=[payload(r) for r in page],
                   next_offset=offset + len(page) if offset + len(page) < len(selected) else None)


@bp.route('/api/mp/ledger/entries/<ident>', methods=['GET', 'PUT', 'DELETE'])
@mutation
def detail(ident):
    require_enabled()
    row = owned(ident)
    if request.method == 'GET':
        return jsonify(payload(row, True))
    revision(row)
    if row['state'] != 'active':
        abort(409, description='账目已作废或关联，请刷新核对')
    if request.method == 'DELETE' and row['source'] in ('subscription', 'installment') and source_available(row):
        from .purchases import owned as owned_purchase, void_payment
        payment = owned_purchase('expense_payments', row['source_id'])
        if payment['kind'] != row['source'] or payment['expense_id'] != row.get('expense_id'):
            abort(409, description='账目来源已变化，请刷新核对')
        plan = owned_purchase('fixed_expenses', payment['expense_id'])
        if payment['voided']:
            # Repair a legacy stale ledger row without reversing the payment twice.
            sync_payment(payment, force=True)
        else:
            void_payment(plan, payment)
        return jsonify(payload(read('ledger_entries', ident), True))
    if row['source'] not in ('manual', 'refund') and source_available(row):
        raise InputError('自动账目请返回原记录更正或作废')
    if request.method == 'DELETE':
        protect_refunds(row, 0, 'void')
        change = {'state': 'void'}
    else:
        parent = owned(row['parent_id']) if row.get('parent_id') else None
        change = fields(body(), row, parent)
        if not parent:
            protect_refunds(row, change['amount_cents'], occurred_on=change['occurred_on'])
            if refunds(ident) and change['kind'] != 'expense':
                raise InputError('有关联退款的支出不能改为收入')
            for refund in refunds(ident):
                write('ledger_entries', refund['id'], remember(refund, {'category': change['category']}, 'parent_category'))
    if row.get('parent_id'):
        parent = owned(row['parent_id'])
        write('ledger_entries', parent['id'], remember(parent, {}, 'refund_changed'))
    return jsonify(payload(write('ledger_entries', ident, remember(row, change, 'void' if request.method == 'DELETE' else 'edit')), True))


@bp.post('/api/mp/ledger/entries/<ident>/refunds')
@mutation
def add_refund(ident):
    require_enabled()
    parent = owned(ident)
    data = body()
    refund_id, fingerprint, old = operation(data, ident)
    if old:
        return jsonify(payload(old, True)), 201
    revision(parent)
    row = remember(None, {**fields(data, parent=parent), 'parent_id': ident, 'source': 'refund', 'source_id': None,
                         'create_fingerprint': fingerprint, 'state': 'active'}, 'refund')
    saved = write('ledger_entries', refund_id, row)
    write('ledger_entries', ident, remember(parent, {}, 'refund_added'))
    return jsonify(payload(saved, True)), 201


@bp.get('/api/mp/ledger/statistics')
def statistics():
    require_enabled()
    month, first, last = month_range()
    from .membership import filter_book
    selected = filter_book([r for r in rows() if r['state'] == 'active' and first <= r['occurred_on'] <= last])
    categories = []
    for category in sorted({r['category'] for r in selected if r['kind'] != 'income'}):
        group = [r for r in selected if r['category'] == category and r['kind'] != 'income']
        summary = totals(group)
        categories.append({'key': category, 'name': EXPENSE.get(category, AUTO.get(category, '其他')), **summary})
    categories.sort(key=lambda r: int(r['gross_expense'].replace('.', '')) - int(r['refund'].replace('.', '')), reverse=True)
    days = [dict(date=f'{month}-{day:02d}', **totals([r for r in selected if r['occurred_on'] == f'{month}-{day:02d}']))
            for day in range(1, calendar.monthrange(int(month[:4]), int(month[5:]))[1] + 1)]
    return jsonify(month=month, summary=totals(selected), categories=categories, days=days)


def candidates(keys=None):
    from .purchases import rows as documents
    items = []
    if keys is not None:
        result = []
        for source, ident in keys:
            if source == 'purchase':
                record = item_raw(ident)
            elif source in ('maintenance', 'disposal'):
                if enabled():
                    from .cloud_repository import get
                    record = get(source + '_records', ident)
                else:
                    raw = get_db().execute(f'SELECT * FROM {source}_records WHERE id=?', (ident,)).fetchone()
                    record = dict(raw) if raw else None
            elif source in ('subscription', 'installment'):
                record = read('expense_payments', ident)
                if record and (record['kind'] != source or record['voided']):
                    record = None
            else:
                record = None
            if not record:
                continue
            item = record if source == 'purchase' else item_raw(record.get('item_id')) if source in ('maintenance', 'disposal') else None
            if source in ('purchase', 'maintenance', 'disposal') and (not item or item.get('deleted_at') or item.get('purging')):
                continue
            result.append((source, ident, record))
    elif enabled():
        from .cloud_repository import query
        items = query('items', {'user_id': g.user_id})
    else:
        items = [dict(r) for r in get_db().execute('SELECT * FROM items WHERE user_id=?', (g.user_id,))]
    if keys is None:
        result = []
    for item in items:
        if item.get('deleted_at') or item.get('purging'):
            continue
        result.append(('purchase', item['id'], item))
        for kind in ('maintenance', 'disposal'):
            if enabled():
                from .cloud_repository import query
                records = query(kind + '_records', {'user_id': g.user_id, 'item_id': item['id']})
            else:
                records = [dict(r) for r in get_db().execute(f'SELECT * FROM {kind}_records WHERE item_id=?', (item['id'],))]
            result.extend((kind, r['id'], r) for r in records)
    if keys is None:
        result.extend((r['kind'], r['id'], r) for r in documents('expense_payments') if not r['voided'])
    output = []
    for source, ident, record in result:
        old = read('ledger_entries', entry_key(source, ident))
        if old and old['state'] != 'pending':
            continue
        fingerprint = hashlib.sha256(json.dumps({k: v for k, v in record.items() if k != '_id'}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        if source == 'purchase':
            amount, date, name = record['purchase_cents'], record['purchase_date'], record['name']
        elif source in ('maintenance', 'disposal'):
            amount = record['cost_cents' if source == 'maintenance' else 'proceeds_cents']
            date = record['maintained_on' if source == 'maintenance' else 'disposed_on']
            name = (item_raw(record['item_id']) or {}).get('name', '物品') + ('维修' if source == 'maintenance' else '回收')
        else:
            amount, date, name = record['cost_cents'] + record['principal_cents'], record['paid_on'], record['expense_name']
        if amount == 0 and source != 'purchase':
            continue
        output.append({'source': source, 'source_id': ident, 'fingerprint': fingerprint, 'amount': money(amount),
                       'occurred_on': date, 'name': name, 'source_name': SOURCES[source], '_record': record})
    return sorted(output, key=lambda r: (r['occurred_on'], r['source'], r['source_id']), reverse=True)


@bp.get('/api/mp/ledger/history')
def history():
    require_enabled()
    selected = candidates()
    try:
        offset = max(0, int(request.args.get('offset', 0)))
    except ValueError:
        raise InputError('分页无效')
    page = selected[offset:offset + 20]
    return jsonify(entries=[{k: v for k, v in r.items() if k != '_record'} for r in page], total=len(selected),
                   next_offset=offset + len(page) if offset + len(page) < len(selected) else None)


@bp.post('/api/mp/ledger/history/import')
@mutation
def import_history():
    require_enabled()
    data = body()
    op_id, fingerprint, old = operation(data)
    if old:
        return jsonify(imported=old['imported'], count=len(old['imported']))
    chosen = data.get('entries')
    if not isinstance(chosen, list) or not 1 <= len(chosen) <= 20 or not all(isinstance(r, dict) for r in chosen):
        raise InputError('每批请选择1至20条记录')
    keys = []
    for selection in chosen:
        source, ident = selection.get('source'), selection.get('source_id')
        if not isinstance(source, str) or isinstance(ident, bool) or not isinstance(ident, int):
            raise InputError('历史来源无效')
        keys.append((source, ident))
    current = {(r['source'], r['source_id']): r for r in candidates(keys)}
    seen, imported = set(), []
    for selection in chosen:
        source, ident = selection.get('source'), selection.get('source_id')
        if not isinstance(source, str) or isinstance(ident, bool) or not isinstance(ident, int):
            raise InputError('历史来源无效')
        key = source, ident
        if key in seen:
            raise InputError('同一记录不能重复选择')
        seen.add(key)
        candidate = current.get(key)
        if not candidate or candidate['fingerprint'] != selection.get('fingerprint'):
            abort(409, description='历史记录已变化或已经导入，请刷新核对；本批未导入')
        if source == 'purchase':
            saved = sync_purchase(ident, {'payment_info': selection.get('payment_info')}, force=True)
        elif source in ('maintenance', 'disposal'):
            saved = sync_event(source, candidate['_record'], force=True)
        else:
            saved = sync_payment(candidate['_record'], force=True)
        imported.append(saved['id'])
    if data.get('operation_id'):
        # Durable batch receipt shares the owner-scoped store but never enters totals.
        write('ledger_entries', op_id, remember(None, {'state': 'batch', 'kind': 'expense',
              'source': 'manual', 'source_id': None, 'category': 'other', 'name': '历史核对回执',
              'amount_cents': 0, 'occurred_on': natural_today().isoformat(), 'imported': imported,
              'create_fingerprint': fingerprint}, 'history_import'))
    return jsonify(imported=imported, count=len(imported))
