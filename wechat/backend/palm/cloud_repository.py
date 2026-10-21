from .validation import natural_today
"""CloudBase repository: owner-scoped documents and transactional mutations."""
import hashlib
import secrets
import time
from datetime import datetime, timedelta, timezone
from flask import abort, current_app, g
from .cloud_client import DocumentClient, Configuration
from .validation import InputError

COLLECTIONS = ('users', 'wechat_identities', 'wechat_sessions', 'username_claims',
               'items', 'maintenance_records', 'disposal_records', 'usage_records',
               'trash_expired', 'sequences', 'request_receipts', 'photo_uploads', 'storage_gc',
               'wishlist', 'fixed_expenses', 'expense_payments', 'storage_locations', 'ledger_entries', 'ledger_settings', 'member_documents', 'pay_orders', 'pay_deliveries')


def db():
    return current_app.extensions['cloudbase_database']


def tx(): return getattr(g, 'cloud_tx', None)

def now(): return datetime.now(timezone.utc).isoformat(timespec='seconds')

def collection(name):
    if name not in COLLECTIONS: raise ValueError('Unknown collection')
    return 'palm_' + name


def get(name, key): return db().get(collection(name), str(key), tx())

def put(name, key, values):
    db().insert(collection(name), [{**values, '_id': str(key)}], tx())

def change(name, key, values): db().update(collection(name), str(key), values, tx())

def remove(name, key): db().delete(collection(name), str(key), tx())

def query(name, values): return db().query(collection(name), values, tx())


def allocate(name):
    row = get('sequences', name)
    number = (row['value'] if row else 0) + 1
    if number > 9007199254740991: raise RuntimeError('Numeric ID exhausted')
    if row: change('sequences', name, {'value': number})
    else: put('sequences', name, {'value': number})
    return number


def user_by_id(user_id): return get('users', user_id) if user_id else None

def user_by_key(username_key):
    claim = get('username_claims', hashlib.sha256(username_key.encode()).hexdigest())
    return user_by_id(claim['user_id']) if claim else None


def user_for_openid(openid):
    # Code exchange happens before opening the transaction; no raw openid in IDs/logs.
    from .cloud_runtime import begin
    begin()
    identity = hashlib.sha256(openid.encode()).hexdigest()
    row = get('wechat_identities', identity)
    if row: return user_by_id(row['user_id'])
    user_id = allocate('users')
    username = '微信用户' + str(user_id)
    key = username.casefold()
    if get('username_claims', hashlib.sha256(key.encode()).hexdigest()):
        username = '微信用户' + identity[:24]
        key = username.casefold()
    put('users', user_id, {'id': user_id, 'username': username, 'username_key': key,
                         'password_hash': '', 'avatar_key': None, 'auth_version': 1, 'created_at': now()})
    put('username_claims', hashlib.sha256(key.encode()).hexdigest(), {'user_id': user_id})
    put('wechat_identities', identity, {'user_id': user_id})
    from .rewards import bind_new_user
    bind_new_user(user_id, __import__('flask').request.get_json(silent=True).get('invite_code'))
    return user_by_id(user_id)


def create_session(digest, user_id, expiry):
    put('wechat_sessions', digest, {'user_id': user_id, 'expires_at': expiry, 'created_at': now()})


def session_user(digest):
    row = get('wechat_sessions', digest)
    return row if row and row['expires_at'] > int(time.time()) and user_by_id(row['user_id']) else None


def delete_session(digest): remove('wechat_sessions', digest)


def update_profile(user_id, username, avatar):
    user = user_by_id(user_id)
    key = username.casefold()
    claim_id = hashlib.sha256(key.encode()).hexdigest()
    existing = get('username_claims', claim_id)
    if existing and existing['user_id'] != user_id: raise InputError('该昵称已被使用')
    old_claim = hashlib.sha256(user['username_key'].encode()).hexdigest()
    if not existing: put('username_claims', claim_id, {'user_id': user_id})
    if old_claim != claim_id: remove('username_claims', old_claim)
    change('users', user_id, {'username': username, 'username_key': key, 'avatar_key': avatar})
    return user_by_id(user_id)


def owned(item_id, user_id=None, deleted=False):
    row = get('items', item_id)
    if not row or row['user_id'] != (g.user_id if user_id is None else user_id) or row.get('purging'):
        abort(404)
    if deleted != bool(row['deleted_at']): abort(404)
    from datetime import date
    row['used_today'] = int(row.get('last_used_on') == natural_today().isoformat())
    return row


def item_row(item_id): return owned(item_id)


def touch(row, fields=None):
    change('items', row['id'], {**(fields or {}), 'revision': row.get('revision', 0) + 1})
    g.pop('cloud_events', None)


def children(table, item_id):
    # Never permit a child query without confirming parent ownership first.
    item_row(item_id)
    return query(table, {'item_id': item_id, 'user_id': g.user_id})


def list_item_rows(user_id, query=None, today=None, item_id=None):
    from datetime import date
    today = today or natural_today().isoformat()
    conditions = {'user_id': user_id, 'deleted_at': None, 'purging': False}
    if item_id is not None: conditions['id'] = item_id
    items = db().query(collection('items'), conditions, tx())
    # Summaries are updated in the same transaction as events. No per-item reads.
    result = []
    for item in items:
        if query and query.casefold() not in item['name'].casefold() and query.casefold() not in item['category'].casefold(): continue
        result.append({**item, 'used_today': int(item.get('last_used_on') == today)})
    return sorted(result, key=lambda row: row['id'], reverse=True)


def item_summary(item_id, user_id, today=None):
    item = owned(item_id, user_id)
    return {**item, 'used_today': int(item.get('last_used_on') == today)}


def usage_rows(item_id):
    return sorted(children('usage_records', item_id), key=lambda r: (r['used_on'], r['id']), reverse=True)


def maintenance_rows(item_id):
    return sorted(children('maintenance_records', item_id), key=lambda r: (r['maintained_on'], r['id']), reverse=True)


def event_row(table, record_id, user_id):
    if table not in ('usage_records', 'maintenance_records', 'disposal_records'): raise ValueError('Invalid table')
    row = get(table, record_id)
    if not row or row['user_id'] != user_id: return None
    owned(row['item_id'], user_id)
    return row


def record_row(table, record_id):
    row = event_row(table, record_id, g.user_id)
    if not row: abort(404)
    return row


def owned_events(user_id):
    cache = getattr(g, 'cloud_events', None)
    if cache and cache[0] == user_id: return cache[1]
    ids = {r['id'] for r in list_item_rows(user_id)}
    events = {name: [r for r in query(name, {'user_id': user_id}) if r['item_id'] in ids]
              for name in ('maintenance_records', 'disposal_records')}
    g.cloud_events = (user_id, events)
    return events


def monthly_totals(user_id, first_month):
    events = owned_events(user_id)
    totals = {}
    for rows, date_key, cents_key, key in (
        (list_item_rows(user_id), 'purchase_date', 'purchase_cents', 'purchase'),
        (events['maintenance_records'], 'maintained_on', 'cost_cents', 'maintenance'),
        (events['disposal_records'], 'disposed_on', 'proceeds_cents', 'proceeds')):
        totals[key] = {}
        for row in rows:
            month = row[date_key][:7]
            if month >= first_month: totals[key][month] = totals[key].get(month, 0) + row[cents_key]
    return totals


def monthly_events(user_id, start, end):
    events = owned_events(user_id)
    result = {}
    for kind, date_key, cents_key in (('maintenance', 'maintained_on', 'cost_cents'), ('disposal', 'disposed_on', 'proceeds_cents')):
        rows = [r for r in events[kind + '_records'] if start.isoformat() <= r[date_key] <= end.isoformat()]
        result[kind] = {'count': len(rows), 'cents': sum(r[cents_key] for r in rows)}
    return result


def repair_totals(user_id):
    rows = [{**r, 'total': r['maintenance_cents']} for r in list_item_rows(user_id) if r['maintenance_count']]
    return sorted(rows, key=lambda r: (-r['total'], r['id']))


def create_item(user_id, name, category, icon_type, purchased, warranty, price, notes, status, storage_location_id=None, **cover):
    from .rewards import admit
    admit()
    item_id = allocate('items')
    put('items', item_id, {'id': item_id, 'user_id': user_id, 'name': name, 'category': category,
        'icon_type': icon_type, 'purchase_date': purchased, 'warranty_expires_on': warranty,
        'purchase_cents': price, 'notes': notes, 'status': status, 'storage_location_id': storage_location_id, 'daily_target_cents': None,
        'is_pinned': 0, 'photo_key': None, 'cover_mode': 'icon', 'cover_icon_key': None, **cover, 'deleted_at': None, 'purging': False, 'revision': 0,
        'created_at': now(), 'maintenance_cents': 0, 'maintenance_count': 0, 'usage_count': 0,
        'last_used_on': None, 'disposal_id': None, 'disposed_on': None, 'disposal_method': None,
        'proceeds_cents': None, 'disposal_notes': None, 'maintenance_min': None, 'maintenance_max': None})
    from .rewards import first_item_reward
    first_item_reward()
    return item_id


def update_item(item_id, user_id, name, category, icon_type, purchased, warranty, price, notes, status, **extra):
    row = owned(item_id, user_id)
    from .services import ensure_purchase_date
    ensure_purchase_date(item_id, purchased)
    if status not in (('disposed',) if row['status'] == 'disposed' else ('active', 'idle')):
        raise InputError('已处置状态由处置记录决定')
    if extra.get('cover_mode') == 'icon':
        extra['photo_key'] = None
        queue_photo(row.get('photo_key'))
    touch(row, {'name': name, 'category': category, 'icon_type': icon_type, 'purchase_date': purchased,
               'warranty_expires_on': warranty, 'purchase_cents': price, 'notes': notes, 'status': status, **extra})


def delete_item(item_id):
    row = item_row(item_id)
    from .rewards import release
    release()
    touch(row, {'deleted_at': now()})

def set_item_target(item_id, user_id, amount):
    row = owned(item_id, user_id)
    if row['status'] == 'disposed': raise InputError('已处置物品的目标只读，撤销处置后可修改')
    touch(row, {'daily_target_cents': amount})

def set_item_pin(item_id, user_id, is_pinned): touch(owned(item_id, user_id), {'is_pinned': int(is_pinned)})


def queue_file(object_id, due=None):
    key = hashlib.sha256(object_id.encode()).hexdigest()
    existing = get('storage_gc', key)
    if not existing: put('storage_gc', key, {'object_id': object_id, 'due_at': due or int(time.time()), 'user_id': g.user_id})


def queue_photo(key):
    if key:
        from .cloud_storage import final_object
        from .photo import thumbnail_key
        for name in (key, thumbnail_key(key)): queue_file(final_object(name))


def swap_photo_key(item_id, new_key):
    row = item_row(item_id)
    touch(row, {'photo_key': new_key, 'cover_mode': 'photo' if new_key else 'icon'})
    if row['photo_key'] != new_key: queue_photo(row['photo_key'])
    return row['photo_key']


def event_boundary(item_id, table, column, function):
    assert (table, column) in {('maintenance_records', 'maintained_on'), ('disposal_records', 'disposed_on'), ('usage_records', 'used_on')}
    assert function in ('MIN', 'MAX')
    row = item_row(item_id)
    if table == 'maintenance_records': return row['maintenance_min' if function == 'MIN' else 'maintenance_max']
    if table == 'disposal_records': return row['disposed_on']
    values = [r[column] for r in children(table, item_id)]
    return (min(values) if function == 'MIN' else max(values)) if values else None


def disposal_by_item(item_id):
    row = item_row(item_id)
    return get('disposal_records', row['disposal_id']) if row['disposal_id'] is not None else None


def create_event(item_id, kind, fields):
    if kind != 'maintenance': abort(410, description='使用记录已停用，历史记录仍可查看')
    row = item_row(item_id)
    if row['status'] == 'disposed': raise InputError('已处置物品不能新增维修记录')
    from .services import ensure_event_date
    ensure_event_date(row, fields['maintained_on'])
    record_id = allocate('maintenance_records')
    put('maintenance_records', record_id, {**fields, 'id': record_id, 'item_id': item_id, 'user_id': g.user_id})
    dates = [v for v in (row['maintenance_min'], row['maintenance_max'], fields['maintained_on']) if v]
    touch(row, {'maintenance_cents': row['maintenance_cents'] + fields['cost_cents'],
                'maintenance_count': row['maintenance_count'] + 1, 'maintenance_min': min(dates), 'maintenance_max': max(dates)})
    return record_id


def repair_summary(row, records):
    dates = [r['maintained_on'] for r in records]
    touch(row, {'maintenance_cents': sum(r['cost_cents'] for r in records), 'maintenance_count': len(records),
                'maintenance_min': min(dates) if dates else None, 'maintenance_max': max(dates) if dates else None})


def update_event(kind, record_id, fields):
    if kind != 'maintenance': abort(410, description='使用记录已停用，历史记录仍可查看')
    record = record_row('maintenance_records', record_id)
    row = item_row(record['item_id'])
    from .services import ensure_event_date
    ensure_event_date(row, fields['maintained_on'])
    records = children('maintenance_records', row['id'])
    change('maintenance_records', record_id, fields)
    repair_summary(row, [{**r, **fields} if r['id'] == record_id else r for r in records])


def delete_event(kind, record_id):
    if kind != 'maintenance': abort(410, description='使用记录已停用，历史记录仍可查看')
    record = record_row('maintenance_records', record_id)
    row = item_row(record['item_id'])
    records = children('maintenance_records', row['id'])
    remove('maintenance_records', record_id)
    repair_summary(row, [r for r in records if r['id'] != record_id])


def create_disposal(item_id, fields):
    row = item_row(item_id)
    if row['disposal_id'] is not None: raise InputError('该物品已有处置记录')
    validate_disposal(row, fields)
    record_id = allocate('disposal_records')
    put('disposal_records', record_id, {**fields, 'id': record_id, 'item_id': item_id, 'user_id': g.user_id})
    touch(row, disposal_fields(record_id, fields))
    return get('disposal_records', record_id)


def validate_disposal(row, fields):
    if fields['disposed_on'] < row['purchase_date']: raise InputError('处置日期不能早于购买日期')
    if row['maintenance_max'] and fields['disposed_on'] < row['maintenance_max']: raise InputError('处置日期不能早于已有维修记录')


def disposal_fields(record_id, fields):
    return {'status': 'disposed', 'disposal_id': record_id, 'disposed_on': fields['disposed_on'],
            'disposal_method': fields['method'], 'proceeds_cents': fields['proceeds_cents'], 'disposal_notes': fields['notes']}


def update_disposal(record_id, fields):
    record = record_row('disposal_records', record_id)
    row = item_row(record['item_id'])
    validate_disposal(row, fields)
    change('disposal_records', record_id, fields)
    touch(row, disposal_fields(record_id, fields))


def delete_disposal(record_id, item_id):
    row = item_row(item_id)
    if row['disposal_id'] != record_id: abort(404)
    remove('disposal_records', record_id)
    touch(row, {'status': 'idle', 'disposal_id': None, 'disposed_on': None, 'disposal_method': None,
                'proceeds_cents': None, 'disposal_notes': None})


def expiry(deleted_at): return datetime.fromisoformat(deleted_at) + timedelta(days=30)


def list_trash():
    rows = query('items', {'user_id': g.user_id, 'purging': False, 'deleted_at': {'$ne': None}})
    rows = [r for r in rows if expiry(r['deleted_at']) > datetime.now(timezone.utc)]
    return [{k: r[k] for k in ('id', 'name', 'category', 'icon_type', 'status', 'deleted_at')} |
            {'expires_at': expiry(r['deleted_at']).isoformat(timespec='seconds'), 'revision': r.get('revision', 0), 'cover_mode': r.get('cover_mode'), 'cover_icon_key': r.get('cover_icon_key')}
            for r in sorted(rows, key=lambda r: (r['deleted_at'], r['id']), reverse=True)]


def trash_row(item_id):
    row = get('items', item_id)
    if row and row['user_id'] == g.user_id and row['deleted_at']:
        if expiry(row['deleted_at']) <= datetime.now(timezone.utc): abort(410, description='物品已超过 30 天保留期限')
        if not row.get('purging'): return row
    expired = get('trash_expired', item_id)
    if expired and expired['user_id'] == g.user_id: abort(410, description='物品已超过 30 天保留期限')
    abort(404)


def restore_item(item_id):
    row = trash_row(item_id)
    from .rewards import admit
    admit()
    touch(row, {'deleted_at': None})

def permanently_delete(item_id):
    row = trash_row(item_id)
    touch(row, {'purging': True})
    queue_photo(row['photo_key'])


def purge_expired(now=None):
    # Physical cleanup is performed by the bounded maintenance command, never startup.
    from .cloud_maintenance import run
    return run(now=now)
