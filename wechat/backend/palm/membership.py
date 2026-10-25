"""Member tools share the existing cash ledger; no payment or public grant route."""
import hashlib
import json
import re
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from flask import Blueprint, abort, current_app, g, jsonify, request
from .cloud_runtime import enabled
from .database import get_db
from .validation import InputError, body, cents_value, money, natural_today, value
from .purchases import mutation
from .cloud_versions import require_revision

bp = Blueprint('membership', __name__)
ENTITLEMENTS = ['ad_free', 'unlimited_items']
FREE_ENTITLEMENTS = ['books', 'budgets']
PLANS = [{'id': 'month', 'name': '月会员', 'price_cents': 290, 'months': 1}]
IOS_PLANS = [dict(p) for p in PLANS]
DEFAULT_BOOK = {'id': 'default', 'name': '日常账本', 'cover': 'daily', 'sticker': '', 'order': 0, 'archived': False, 'revision': 0}
THEMES = ['default', 'sage', 'pink', 'blue']
COVERS = ['daily', 'travel', 'home', 'hobby']
STICKERS = ['paw', 'cat', 'sleep', 'book', 'heart', 'fish']
TEMPLATES = ['default', 'simple', 'journal']
ANNOUNCEMENT_ID = 'free-tools-month-290-v1'
ANNOUNCEMENT_TITLE = '整理工具免费啦，喵～'
FEEDBACK_MESSAGE = ('目前使用猫爪的朋友还不多，也希望大家能更轻松地开始记录，所以这次把「多账本与流水整理」'
                    '「月度与分类预算」都开放免费使用啦。\n\n'
                    '会员调整为每月2.9元，仅保留月会员，享有免小程序内广告和会员有效期内无限物品容量。\n\n'
                    '大家按自己的需要选择就好。如果猫爪帮到了你，也欢迎支持开发者，让这只小猫慢慢长大。'
                    '愿意来记录、提建议，就已经很感谢啦，喵～')


def key(kind, ident):
    return hashlib.sha256(f'{g.user_id}:{kind}:{ident}'.encode()).hexdigest()


def documents(kind):
    if enabled():
        from .cloud_repository import query
        rows = query('member_documents', {'user_id': g.user_id, 'kind': kind})
    else:
        rows = [json.loads(r['payload']) for r in get_db().execute(
            'SELECT payload FROM member_documents WHERE user_id=? AND kind=?', (g.user_id, kind))]
    return [r['value'] for r in rows]


def get(kind, ident):
    ident = str(ident)
    if enabled():
        from .cloud_repository import get as cloud_get
        row = cloud_get('member_documents', key(kind, ident))
    else:
        raw = get_db().execute('SELECT payload FROM member_documents WHERE id=? AND user_id=?', (key(kind, ident), g.user_id)).fetchone()
        row = json.loads(raw['payload']) if raw else None
    return row['value'] if row and row['user_id'] == g.user_id and row['kind'] == kind else None


def put(kind, ident, data):
    old = get(kind, ident)
    result = {**data, 'id': str(ident), 'revision': (old['revision'] + 1 if old else 1 if kind in ('entry', 'budget', 'appearance', 'plan', 'book_order') else 0)}
    row = {'user_id': g.user_id, 'kind': kind, 'value': result}
    if enabled():
        from .cloud_repository import put as insert, change
        (change if old else insert)('member_documents', key(kind, ident), row)
    else:
        get_db().execute('INSERT INTO member_documents VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
                         (key(kind, ident), g.user_id, kind, json.dumps(row, ensure_ascii=False)))
    g.pop('member_metadata', None)
    return result


def delete(kind, ident):
    if enabled():
        from .cloud_repository import remove
        remove('member_documents', key(kind, ident))
    else:
        get_db().execute('DELETE FROM member_documents WHERE id=? AND user_id=?', (key(kind, ident), g.user_id))


def state():
    row = get('membership', 'status') or {}
    now = int(time.time())
    active = (row.get('starts_at') or 0) <= now < (row.get('expires_at') or 0)
    return {'status': 'active' if active else 'expired' if row.get('expires_at') else 'free',
            'active': active, 'starts_at': row.get('starts_at'), 'expires_at': row.get('expires_at'),
            'entitlements': ENTITLEMENTS if active else [], 'server_time': now}


def require_member():
    if not state()['active']:
        abort(403, description='此功能需要猫爪会员，已有记录仍可继续使用')
    g.member_operation = True


def grant_test_membership(user_id, status='active', months=12):
    """Only invoked by an offline CLI or isolated test, never via HTTP."""
    if not current_app.testing and not (current_app.config.get('DEV_LOGIN') and not enabled()):
        raise RuntimeError('测试会员仅允许在本地开发环境授予')
    if status not in ('active', 'expired', 'expiring') or months not in (1, 3, 12):
        raise ValueError('Invalid test membership')
    from .repository import user_by_id
    if not user_by_id(user_id):
        raise ValueError('用户不存在，请先通过本地开发登录创建账户')
    g.user_id = user_id
    now = int(time.time())
    expires = now - 1 if status == 'expired' else now + 120 if status == 'expiring' else now + months * 31 * 86400
    return put('membership', 'status', {'starts_at': now - 86400, 'expires_at': expires, 'test_only': True, 'entitlements': ENTITLEMENTS})


@bp.get('/api/mp/membership')
def membership():
    from .payments import payment_open, checkout_plans, test_offer
    platform = request.args.get('platform')
    identity = state()
    from .rewards import capacity
    identity['capacity'] = capacity()
    opened = payment_open(platform)
    return jsonify(**identity, free_entitlements=FREE_ENTITLEMENTS, plans=checkout_plans(platform), payment_open=opened, platform=platform,
                   purchase_allowed=opened and not identity['active'],
                   purchase_block_reason='active_membership' if identity['active'] else '' if opened else 'payment_unavailable',
                   promotion={'active': False, 'feedback_message': FEEDBACK_MESSAGE,
                              'announcement_id': ANNOUNCEMENT_ID, 'announcement_title': ANNOUNCEMENT_TITLE},
                   payment_test_mode=bool(current_app.config.get('PAY_TEST_ENABLED')), payment_test=bool(test_offer()),
                   ios_payment_open=payment_open('ios'), appearance=appearance_value(),
                   catalog={'themes': THEMES, 'covers': COVERS, 'stickers': [], 'templates': TEMPLATES})


def books(order=None):
    legacy = [dict(DEFAULT_BOOK), *sorted(documents('book'), key=lambda r: (r.get('order', 0), r['id']))]
    order = (get('book_order', 'current') or {}) if order is None else order
    positions = {ident: i for i, ident in enumerate(order.get('book_ids', []))}
    fallback = {row['id']: i for i, row in enumerate(legacy)}
    return sorted(legacy, key=lambda r: (bool(r.get('archived')), positions.get(r['id'], len(positions) + fallback[r['id']])))


def active_book_ids():
    return [r['id'] for r in books() if not r.get('archived')]


def save_book_order(ids):
    return put('book_order', 'current', {'book_ids': ids})


@bp.put('/api/mp/member/books/order')
@mutation
def book_order_change():
    from .cloud_versions import VersionError
    try:
        require_revision(get('book_order', 'current') or {'revision': 0})
    except VersionError as error:
        raise VersionError(error.status, error.code, '账本列表已变化，请重新读取后核对排序' if error.status == 409 else '请更新小程序并重新读取账本排序')
    ids = body().get('book_ids')
    current = active_book_ids()
    if (not isinstance(ids, list) or len(ids) != len(current)
            or any(not isinstance(i, str) for i in ids)
            or len(set(ids)) != len(ids) or set(ids) != set(current)):
        raise InputError('请提交完整且不重复的正在使用账本顺序')
    order = save_book_order(ids)
    return jsonify(book_ids=order['book_ids'], order_revision=order['revision'])


def book(ident, writable=False):
    if not isinstance(ident, str):
        raise InputError('账本选择无效')
    row = dict(DEFAULT_BOOK) if ident == 'default' else get('book', ident)
    if not row:
        abort(404)
    if writable and row.get('archived'):
        raise InputError('归档账本不能接收新流水，请先取消归档')
    return row


def metadata(row):
    owner_id = row.get('parent_id') if row.get('kind') == 'refund' else row['id']
    cache = getattr(g, 'member_metadata', None)
    if cache is None:
        cache = {r['id']: r for r in documents('entry')}
        g.member_metadata = cache
    return cache.get(owner_id) or {'id': owner_id, 'book_id': 'default', 'revision': 0}


def decorate(row):
    meta = metadata(row)
    return {'book_id': meta.get('book_id', 'default'), 'member_revision': meta.get('revision', 0)}


def filter_book(rows):
    ident = request.args.get('book_id')
    if not ident or ident == 'all':
        return rows
    book(ident)
    return [r for r in rows if metadata(r).get('book_id', 'default') == ident]


def assign_new(row, data):
    ident = data.get('book_id', 'default')
    if ident != 'default':
        book(ident, True)
        put('entry', row['id'], {'book_id': ident})


@bp.route('/api/mp/member/books', methods=['GET', 'POST'])
@mutation
def book_list():
    if request.method == 'GET':
        from .ledger import rows
        counts = {}
        for row in rows():
            if row['state'] == 'active':
                ident = metadata(row)['book_id']
                counts[ident] = counts.get(ident, 0) + 1
        order = get('book_order', 'current') or {}
        return jsonify(books=[{**r, 'count': counts.get(r['id'], 0)} for r in books(order)],
                       order_revision=order.get('revision', 0))
    data = body()
    ids = active_book_ids()
    result = put('book', uuid.uuid4().hex, book_fields(data))
    save_book_order(ids + ([] if result['archived'] else [result['id']]))
    return jsonify(result), 201


def book_fields(data, old=None):
    old = old or {}
    name = value(data, 'name', '账本名称', 32)
    if any(r['name'].casefold() == name.casefold() and r['id'] != old.get('id') for r in books()):
        raise InputError('账本名称已存在')
    cover, sticker = data.get('cover', old.get('cover', 'daily')), data.get('sticker', old.get('sticker', ''))
    order, archived = data.get('order', old.get('order', 0)), data.get('archived', old.get('archived', False))
    if cover not in COVERS or sticker not in ['', *STICKERS] or type(order) is not int or abs(order) > 100000 or type(archived) is not bool:
        raise InputError('账本设置无效')
    return {'name': name, 'cover': cover, 'sticker': sticker, 'order': order, 'archived': archived}


@bp.route('/api/mp/member/books/<ident>', methods=['PUT', 'DELETE'])
@mutation
def book_change(ident):
    if ident == 'default':
        raise InputError('日常账本固定保留')
    old = book(ident)
    require_revision(old)
    ids = active_book_ids()
    if request.method == 'DELETE':
        from .ledger import rows
        if any(metadata(r)['book_id'] == ident for r in rows()) or any(r.get('book_id') == ident for r in documents('entry')):
            abort(409, description='有流水的账本请归档，不能删除')
        # Future subscription routing is a reference too.
        from .purchases import rows as purchase_rows
        existing_plans = {str(r['id']) for r in purchase_rows('fixed_expenses')}
        for meta in documents('plan'):
            if meta.get('book_id') == ident:
                if meta['id'] in existing_plans:
                    abort(409, description='账本仍有关联订阅分期，请归档保留')
                delete('plan', meta['id'])
        delete('book', ident)
        save_book_order([i for i in ids if i != ident])
        return '', 204
    result = put('book', ident, book_fields(body(), old))
    if result['archived'] != old['archived']:
        save_book_order([i for i in ids if i != ident] + ([] if result['archived'] else [ident]))
    return jsonify(result)


@bp.get('/api/mp/member/entries')
def entry_list():
    from .ledger import rows, payload
    selected = filter_book([r for r in rows() if r['state'] == 'active' and r['kind'] != 'refund'])
    selected.sort(key=lambda r: (r['occurred_on'], r['created_at']), reverse=True)
    try:
        offset = max(0, int(request.args.get('offset', 0)))
    except ValueError:
        raise InputError('分页无效') from None
    return jsonify(entries=[payload(r) for r in selected[offset:offset + 50]], next_offset=offset + 50 if len(selected) > offset + 50 else None)


@bp.post('/api/mp/member/entries/move')
@mutation
def move_entries():
    from .ledger import owned
    data = body()
    ids = data.get('entries')
    target = data.get('book_id')
    book(target, True)
    if not isinstance(ids, list) or not 1 <= len(ids) <= 50:
        raise InputError('每次请选择1至50笔流水')
    saved = []
    for spec in ids:
        if not isinstance(spec, dict):
            raise InputError('流水选择无效')
        if not isinstance(spec.get('id'), str) or type(spec.get('revision')) is not int:
            raise InputError('流水选择无效')
        row = owned(spec['id'])
        if row['kind'] == 'refund' or row['state'] != 'active':
            raise InputError('请从有效原支出调整，退款会跟随原支出')
        old = get('entry', row['id']) or {'revision': 0}
        if spec.get('revision') != old['revision']:
            abort(409, description='流水归属已更新，请刷新核对')
        saved.append(put('entry', row['id'], {**metadata(row), 'book_id': target}))
    return jsonify(entries=saved)


def iso_date(text, label):
    try:
        if not isinstance(text, str) or date.fromisoformat(text).isoformat() != text:
            raise ValueError()
        return date.fromisoformat(text)
    except (ValueError, TypeError):
        raise InputError(label + '无效') from None


def signed_summary(rows):
    from .ledger import totals
    summary = totals(rows)
    gross = sum(r['amount_cents'] for r in rows if r['kind'] == 'expense')
    refund = sum(r['amount_cents'] for r in rows if r['kind'] == 'refund')
    income = sum(r['amount_cents'] for r in rows if r['kind'] == 'income')
    return {**summary, 'net_expense_cents': gross - refund, 'balance_cents': income + refund - gross}


def budget_id(month, scope):
    if not isinstance(month, str) or not re.fullmatch(r'[0-9]{4}-(?:0[1-9]|1[0-2])', month):
        raise InputError('预算月份无效')
    iso_date(month + '-01', '预算月份')
    if scope != 'all':
        book(scope)
    return month + ':' + scope


def budget_result(config, month, scope):
    from .ledger import rows
    selected = [r for r in rows() if r['state'] == 'active' and r['occurred_on'][:7] == month
                and (scope == 'all' or metadata(r)['book_id'] == scope)]
    def progress(limit, entries):
        used = signed_summary(entries)['net_expense_cents']
        return {'limit_cents': limit, 'used_cents': used, 'remaining_cents': limit - used if limit is not None else None,
                'over_cents': max(0, used - limit) if limit is not None else 0,
                'percent': max(0, min(100, used * 100 // limit)) if limit else 0,
                'status': 'refund_surplus' if used < 0 else 'unset' if limit is None else 'over' if used >= limit else 'near' if used * 100 >= limit * 80 else 'normal'}
    return {**config, 'month': month, 'book_id': scope, 'total': progress(config.get('total_cents'), selected),
            'categories': [dict(key=k, **progress(v, [r for r in selected if r['category'] == k])) for k, v in config.get('category_cents', {}).items()],
            'category_over_total': config.get('total_cents') is not None and sum(config.get('category_cents', {}).values()) > config['total_cents']}


@bp.route('/api/mp/member/budget', methods=['GET', 'PUT'])
@mutation
def budget():
    data = request.args if request.method == 'GET' else body()
    month, scope = data.get('month', natural_today().strftime('%Y-%m')), data.get('book_id', 'all')
    ident = budget_id(month, scope)
    old = get('budget', ident)
    if request.method == 'PUT':
        require_revision(old or {'revision': 0})
        if data.get('copy_previous') is True:
            previous = (date.fromisoformat(month + '-01') - timedelta(days=1)).strftime('%Y-%m')
            config = get('budget', budget_id(previous, scope))
            if not config:
                raise InputError('上月尚未设置预算')
        else:
            from .ledger import EXPENSE, AUTO
            total = data.get('total')
            total = cents_value({'amount': total}, 'amount', '总预算') if total not in (None, '') else None
            values = data.get('categories', {})
            if not isinstance(values, dict) or any(k not in {*EXPENSE, *AUTO} - {'disposal'} for k in values):
                raise InputError('支出分类预算无效')
            config = {'total_cents': total, 'category_cents': {k: cents_value({'amount': v}, 'amount', '分类预算') for k, v in values.items() if v not in (None, '')}}
        old = put('budget', ident, {'total_cents': config.get('total_cents'), 'category_cents': config.get('category_cents', {})})
    return jsonify(budget_result(old or {'revision': 0, 'total_cents': None, 'category_cents': {}}, month, scope))


def appearance_value():
    saved = get('appearance', 'current') or {'revision': 0, 'theme': 'default', 'template': 'default', 'sticker': ''}
    # Preserve historical documents; retired sticker choices are never exposed.
    visible = {**saved, 'sticker': ''}
    return {'saved': visible, 'effective': visible}


@bp.route('/api/mp/member/appearance', methods=['GET', 'PUT'])
@mutation
def appearance():
    if request.method == 'PUT':
        old = get('appearance', 'current') or {'revision': 0}
        require_revision(old)
        data = body()
        if data.get('theme') not in THEMES or data.get('template') not in TEMPLATES:
            raise InputError('装扮选择无效')
        put('appearance', 'current', {k: data[k] for k in ('theme', 'template')})
    return jsonify(appearance_value())


def assign_payment(row):
    """Called within the existing payment transaction. Never rewrites old routing."""
    from .ledger import entry_key
    ident = entry_key(row['kind'], row['id'])
    if get('entry', ident):
        return
    target = (get('plan', row['expense_id']) or {}).get('book_id', 'default')
    if target != 'default':
        destination = get('book', target)
        if destination and not destination.get('archived'):
            put('entry', ident, {'book_id': target})
