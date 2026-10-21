"""Server-owned seeds, daily rewards and permanent item capacity.

All mutations use the existing request transaction and receipt. Wallet writes
serialize item admission, deletion and redemption within an account.
"""
import hashlib
import json
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from flask import Blueprint, g, jsonify, request
from .cloud_runtime import enabled
from .database import get_db
from .purchases import mutation
from .validation import InputError, body

bp = Blueprint('rewards', __name__)
CHECKIN = (5, 5, 5, 5, 8, 10, 12)
TIERS = ((5, 60), (20, 100), (50, 160), (100, 200), (200, 260))
BASE_CAPACITY = 20
MAX_EXTRA = 200
INVITE_REWARD = 100
TZ = timezone(timedelta(hours=8))


def clock():
    return datetime.fromtimestamp(time.time(), TZ)


def doc_key(owner, kind, ident):
    return hashlib.sha256(f'rewards:{owner}:{kind}:{ident}'.encode()).hexdigest()


def read(kind, ident='current', owner=None):
    owner = g.user_id if owner is None else owner
    key = doc_key(owner, kind, ident)
    if enabled():
        from .cloud_repository import get
        row = get('member_documents', key)
    else:
        raw = get_db().execute('SELECT payload FROM member_documents WHERE id=? AND user_id=?', (key, owner)).fetchone()
        row = json.loads(raw['payload']) if raw else None
    return row['value'] if row and row['user_id'] == owner and row['kind'] == 'rewards_' + kind else None


def write(kind, value, ident='current', owner=None):
    owner = g.user_id if owner is None else owner
    key = doc_key(owner, kind, ident)
    old = read(kind, ident, owner)
    result = {**value, 'revision': (old or {}).get('revision', 0) + 1}
    row = {'user_id': owner, 'kind': 'rewards_' + kind, 'value': result}
    if enabled():
        from .cloud_repository import put, change
        (change if old else put)('member_documents', key, row)
    else:
        get_db().execute('INSERT INTO member_documents VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
                         (key, owner, row['kind'], json.dumps(row, ensure_ascii=False)))
    return result


def actual_count(owner):
    if enabled():
        from .cloud_repository import query
        # query exhausts all pages; disposed records are deliberately included.
        return sum(not row.get('purging') for row in query('items', {'user_id': owner, 'deleted_at': None}))
    return get_db().execute('SELECT COUNT(*) FROM items WHERE user_id=? AND deleted_at IS NULL', (owner,)).fetchone()[0]


def wallet(owner=None):
    owner = g.user_id if owner is None else owner
    row = read('wallet', owner=owner)
    return row or {'balance': 0, 'extra_slots': 0, 'used': actual_count(owner), 'revision': 0}


def price(extra):
    return next((cost for end, cost in TIERS if extra < end), None)


def capacity(row=None):
    from .membership import state
    row = wallet() if row is None else row
    unlimited = state()['active']
    limit = BASE_CAPACITY + row['extra_slots']
    return {'base': BASE_CAPACITY, 'extra': row['extra_slots'], 'used': row['used'],
            'limit': None if unlimited else limit, 'free_limit': limit, 'unlimited': unlimited,
            'can_add': unlimited or row['used'] < limit, 'max_extra': MAX_EXTRA}


class CapacityError(Exception):
    pass


def capacity_error(_error):
    return jsonify(error='小窝暂时住满啦，请扩容或查看会员权益；已有资料仍可查看和编辑',
                   code='ITEM_CAPACITY_REACHED', capacity=capacity(), retry_same_request=False), 409


def admit():
    row = wallet()
    if not capacity(row)['can_add']:
        raise CapacityError()
    write('wallet', {**row, 'used': row['used'] + 1})
    from .growth import track_items
    track_items(row['used'] + 1)
    g.capacity_admission = True


def release():
    row = wallet()
    from .growth import track_items
    track_items(row['used'])
    write('wallet', {**row, 'used': max(0, row['used'] - 1)})


def check_admission_commit():
    if getattr(g, 'capacity_admission', False):
        c = capacity()
        if not c['unlimited'] and c['used'] > c['free_limit']:
            raise CapacityError()


def add_reward(owner, amount, reason, ident):
    if read('transaction', ident, owner):
        return False
    row = wallet(owner)
    write('wallet', {**row, 'balance': row['balance'] + amount}, owner=owner)
    write('transaction', {'amount': amount, 'reason': reason, 'at': int(time.time())}, ident, owner)
    return True


def bind_new_user(user_id, code):
    """Called ONLY in the transaction that creates a new WeChat identity."""
    if not isinstance(code, str) or not re.fullmatch(r'[a-f0-9]{40}', code):
        return
    index = invitation_index(code)
    if not index:
        return
    owner = index['user_id']
    invitation = read('invitation', owner=owner)
    if owner == user_id or not invitation or not secrets.compare_digest(invitation['code'], code):
        return
    write('referral', {'inviter': owner, 'rewarded': False, 'bound_at': int(time.time())}, owner=user_id)


def invitation_index(code, owner=None):
    key = hashlib.sha256(('rewards:invitation-code:' + code).encode()).hexdigest()
    if owner is not None:
        row = {'user_id': owner, 'kind': 'rewards_invitation_index', 'value': {'code': code}}
        if enabled():
            from .cloud_repository import put
            put('member_documents', key, row)
        else:
            get_db().execute('INSERT INTO member_documents VALUES(?,?,?,?)', (key, owner, row['kind'], json.dumps(row)))
        return row
    if enabled():
        from .cloud_repository import get
        row = get('member_documents', key)
    else:
        raw = get_db().execute('SELECT payload FROM member_documents WHERE id=?', (key,)).fetchone()
        row = json.loads(raw['payload']) if raw else None
    return row if row and row['kind'] == 'rewards_invitation_index' else None


def first_item_reward():
    row = read('referral')
    if not row or row.get('rewarded'):
        return
    # Admission and actual item creation have succeeded in the same transaction.
    add_reward(row['inviter'], INVITE_REWARD, '邀请新朋友完成首件物品', 'invite:' + str(g.user_id))
    write('referral', {**row, 'rewarded': True, 'rewarded_at': int(time.time())})


def greeting(now):
    hour = now.hour
    if hour < 5:
        key, title, copy = 'late', '夜深啦，喵～', '把今天的小心事轻轻收好，也别忘了给自己留一点休息。'
    elif hour < 11:
        key, title, copy = 'morning', '早上好呀，喵～', '新的一天，先收下一点小幸运。慢慢记录，让生活有自己的节奏。'
    elif hour < 14:
        key, title, copy = 'noon', '中午好呀，喵～', '忙了半天，记得好好吃饭。领一份小礼物，给下午添一点元气。'
    elif hour < 18:
        key, title, copy = 'afternoon', '下午好呀，喵～', '让小猫陪你歇一小会儿。把喜欢的物品和生活里的小事，慢慢收好。'
    else:
        key, title, copy = 'evening', '晚上好呀，喵～', '今天也辛苦啦。来领一份小小的签到礼物，再把生活慢慢整理好。'
    return {'period': key, 'title': title, 'message': copy}


def week_progress(now):
    day = now.date()
    monday = day - timedelta(days=day.weekday())
    dates = [(monday + timedelta(days=i)).isoformat() for i in range(7)]
    records = [read('checkin', date) for date in dates]
    count = sum(bool(row) for row in records)
    claimed = bool(records[day.weekday()])
    next_step = min(count, 6)
    days = [{'step': i + 1, 'date': dates[i], 'amount': amount, 'claimed': i < count,
             'today': not claimed and i == count, 'past': i < count} for i, amount in enumerate(CHECKIN)]
    return {'days': days, 'claimed_count': count, 'today_claimed': claimed,
            'today_reward': records[day.weekday()]['amount'] if claimed else CHECKIN[next_step],
            'next_step': None if count == 7 else count + 1, 'week_total': sum(CHECKIN)}


def snapshot():
    now = clock()
    day = now.date()
    monday = day - timedelta(days=day.weekday())
    row = wallet()
    invitation = read('invitation') or {}
    from .growth import catalog
    return {'server_time': int(now.timestamp()), 'date': day.isoformat(), 'week_start': monday.isoformat(),
            'balance': row['balance'], 'revision': row['revision'], 'capacity': capacity(row),
            'checkin': week_progress(now), 'achievements': catalog(),
            'shop': {'next_price': price(row['extra_slots']), 'max_extra': MAX_EXTRA,
                     'tiers': [{'from': start, 'to': end, 'price': cost} for start, (end, cost) in zip((1, 6, 21, 51, 101), TIERS)]},
            'invitation': {'code': invitation.get('code', ''), 'reward': INVITE_REWARD},
            'advertisement': {'enabled': False, 'reward': 10, 'used_today': 0, 'daily_limit': 3}, 'greeting': greeting(now)}


@bp.get('/api/mp/rewards')
def overview():
    return jsonify(snapshot())


@bp.get('/api/mp/rewards/transactions')
def history():
    if enabled():
        from .cloud_repository import query
        rows = query('member_documents', {'user_id': g.user_id, 'kind': 'rewards_transaction'})
        rows = [r['value'] for r in rows]
    else:
        rows = [json.loads(r['payload'])['value'] for r in get_db().execute(
            'SELECT payload FROM member_documents WHERE user_id=? AND kind=?', (g.user_id, 'rewards_transaction'))]
    return jsonify(transactions=sorted(rows, key=lambda r:r['at'], reverse=True)[:30])


@bp.post('/api/mp/rewards/checkin')
@mutation
def checkin():
    now = clock()
    today = now.date().isoformat()
    if body().get('date') != today:
        raise InputError('日期已更新，请刷新后领取今天的签到奖励')
    claimed = bool(read('checkin', today))
    amount = 0
    if not claimed:
        amount = week_progress(now)['today_reward']
        add_reward(g.user_id, amount, '每日签到', 'checkin:' + today)
        write('checkin', {'date': today, 'amount': amount}, today)
    return jsonify(**snapshot(), already_claimed=claimed, awarded=amount)


@bp.post('/api/mp/rewards/visit')
@mutation
def visit():
    from .growth import visit as record
    seen = record(clock().date().isoformat())
    return jsonify(**snapshot(), already_visited=seen)


@bp.post('/api/mp/rewards/achievements/<ident>/claim')
@mutation
def claim_achievement(ident):
    from .growth import claim
    claimed, amount = claim(ident)
    return jsonify(**snapshot(), already_claimed=claimed, awarded=amount)


@bp.post('/api/mp/rewards/redeem')
@mutation
def redeem():
    row = wallet()
    cost = price(row['extra_slots'])
    data = body()
    if cost is None:
        raise InputError('已兑换全部容量')
    if type(data.get('expected_extra')) is not int or type(data.get('expected_price')) is not int or data['expected_extra'] != row['extra_slots'] or data['expected_price'] != cost:
        raise InputError('兑换信息已更新，请刷新后重新确认')
    if row['balance'] < cost:
        raise InputError('喵粒还不够，签到攒一点再来吧')
    extra = row['extra_slots'] + 1
    write('wallet', {**row, 'balance': row['balance'] - cost, 'extra_slots': extra})
    write('transaction', {'amount': -cost, 'reason': '永久容量＋1格', 'extra': extra, 'at': int(time.time())}, 'redeem:' + str(extra))
    return jsonify(snapshot())


@bp.post('/api/mp/rewards/invitation')
@mutation
def invitation():
    row = read('invitation')
    if not row:
        row = write('invitation', {'code': secrets.token_hex(20)})
        invitation_index(row['code'], g.user_id)
    return jsonify(code=row['code'], reward=INVITE_REWARD)


@bp.post('/api/mp/rewards/greeting')
@mutation
def daily_greeting():
    now = clock()
    today = now.date().isoformat()
    data = body()
    if data.get('date') != today:
        raise InputError('日期已更新，请重新读取')
    previous = read('greeting', today)
    if data.get('not_shown') is True:
        delivery = data.get('delivery_token')
        if previous and isinstance(delivery, str) and secrets.compare_digest(previous.get('delivery_token', ''), delivery):
            key = doc_key(g.user_id, 'greeting', today)
            if enabled():
                from .cloud_repository import remove
                remove('member_documents', key)
            else:
                get_db().execute('DELETE FROM member_documents WHERE id=? AND user_id=?', (key, g.user_id))
        return jsonify(show=False, **snapshot())
    seen = bool(previous)
    delivery = '' if seen else secrets.token_hex(16)
    if not seen:
        write('greeting', {'shown_at': int(now.timestamp()), 'delivery_token': delivery}, today)
    # A failed transaction never records a view. Receipts recover a lost response.
    return jsonify(show=not seen, delivery_token=delivery, **snapshot())
