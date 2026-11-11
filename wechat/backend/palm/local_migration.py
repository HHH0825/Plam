"""Authenticated, resumable local migration. No automatic account conversion.

Snapshots and receipts reuse owner-scoped member_documents. Every normal write
touches the same account gate, so migration confirmation serializes with legacy
clients in both SQLite and CloudBase.
"""
import base64
import hashlib
import json
import re
import secrets
import sqlite3
import time
from pathlib import Path
from flask import Blueprint, abort, current_app, g, jsonify, request
from . import membership as docs
from .cloud_runtime import enabled
from .database import get_db
from .validation import InputError, body

bp = Blueprint('local_migration', __name__)
FIELDS = json.loads(Path(__file__).with_name('local_data_fields.json').read_text(encoding='utf-8'))
PREFIX = '/api/mp/local-migration'
TTL = 24 * 3600


def encoded(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()


def gate():
    return docs.get('local_migration_gate', 'current') or {'version': 0, 'mode': 'cloud'}


def retain_cloud(owner):
    """Background trash cleanup must retain pending and confirmed migration data."""
    key = hashlib.sha256(f'{owner}:local_migration_gate:current'.encode()).hexdigest()
    if enabled():
        from .cloud_repository import get
        row = get('member_documents', key)
    else:
        raw = get_db().execute('SELECT payload FROM member_documents WHERE id=? AND user_id=?', (key, owner)).fetchone()
        row = json.loads(raw['payload']) if raw else None
    state = row['value'] if row else {}
    return state.get('mode') == 'local' or state.get('snapshot_until', 0) > int(time.time())


def before():
    if not getattr(g, 'user_id', None) or not request.path.startswith('/api/mp/'):
        return
    if request.method not in ('POST', 'PUT', 'DELETE') or request.path.startswith(('/api/mp/auth/', '/api/mp/pay/')):
        return
    if not enabled():
        db = get_db()
        db.execute('BEGIN IMMEDIATE')
        g.migration_sql_active = True
        g.migration_sql_photos = []
    state = gate()
    if request.path.startswith(PREFIX):
        return
    if state['mode'] == 'local':
        abort(409, description='此账户已迁移到本机模式，云端资料仅供核对与重新下载，请更新小程序')
    # Foreground greeting/visit does not appear in a business snapshot. Do not
    # invalidate a resumable migration merely because the app returned to view.
    if request.path in ('/api/mp/rewards/visit', '/api/mp/rewards/greeting'):
        return
    docs.put('local_migration_gate', 'current', {**state, 'version': state['version'] + 1})


def finish(response):
    if not getattr(g, 'migration_sql_active', False):
        return response
    db = get_db()
    g.migration_sql_active = False
    if response.status_code >= 400 or getattr(g, 'migration_sql_aborted', False):
        sqlite3.Connection.rollback(db)
    else:
        sqlite3.Connection.commit(db)
        from .photo import remove_photo_file
        for key in g.migration_sql_photos:
            remove_photo_file(key)
    return response


def install(app):
    app.before_request(before)
    app.after_request(finish)
    app.register_blueprint(bp)


def owned_rows(table):
    if enabled():
        from .cloud_repository import query
        return query(table, {'user_id': g.user_id})
    db = get_db()
    if table in ('items',):
        return [dict(r) for r in db.execute('SELECT * FROM items WHERE user_id=?', (g.user_id,))]
    if table in ('maintenance_records', 'disposal_records', 'usage_records'):
        return [dict(r) for r in db.execute(f'SELECT e.* FROM {table} e JOIN items i ON i.id=e.item_id WHERE i.user_id=?', (g.user_id,))]
    return [json.loads(r['payload']) for r in db.execute(f'SELECT payload FROM {table} WHERE user_id=?', (g.user_id,))]


def business_snapshot():
    from .repository import user_by_id
    from .ledger import settings, payment_info
    user = dict(user_by_id(g.user_id))
    ledger = settings()
    ordered = docs.books()
    tables = {name: [] for name in FIELDS}
    tables['settings'] = [{'id': 'current', 'user': {k: user.get(k) for k in ('id', 'username', 'avatar_key')},
        'created_at': user['created_at'], 'ledger_enabled': ledger['enabled'], 'enabled_at': ledger.get('enabled_at'),
        'appearance': docs.get('appearance', 'current') or {'revision': 0, 'theme': 'default', 'template': 'default', 'sticker': ''},
        'checkins': [r['date'] for r in docs.documents('rewards_checkin')], 'visits': [],
        'book_order_revision': (docs.get('book_order', 'current') or {}).get('revision', 0),
        'default_book_order': next(i for i, row in enumerate(ordered) if row['id'] == 'default')}]
    for name in ('items', 'maintenance_records', 'disposal_records', 'usage_records', 'wishlist', 'fixed_expenses',
                 'expense_payments', 'storage_locations', 'ledger_entries'):
        tables[name] = owned_rows(name)
    for row in tables['items']:
        if row.get('purging'):
            raise InputError('有回收站资料正在清理，请完成后重新迁移')
        row['payment_info'] = payment_info(row)
        if isinstance(row['payment_info'], str): row['payment_info'] = json.loads(row['payment_info'])
        row['thumb_key'] = row.get('photo_key')  # Full image is also a valid initial thumbnail.
    for row in tables['ledger_entries']:
        meta = docs.metadata(row)
        row.update(book_id=meta.get('book_id', 'default'), member_revision=meta.get('revision', 0))
    for order, row in enumerate(ordered):
        if row['id'] != 'default': tables['books'].append({**row, 'order': order})
    tables['budgets'] = docs.documents('budget')
    for row in tables['fixed_expenses']:
        row['book_id'] = (docs.get('plan', row['id']) or {}).get('book_id', 'default')
    # Whitelist nested structures too; credentials can never enter the snapshot.
    for name, records in tables.items():
        allowed = FIELDS[name].split()
        tables[name] = [{k: r[k] for k in allowed if k in r} for r in records]
        for r in tables[name]:
            if name not in ('settings', 'budgets', 'books', 'usage_records'):
                r.setdefault('revision', 0)
                r.setdefault('created_at', r.get('created_on', '1970-01-01') + 'T00:00:00Z')
            if name == 'ledger_entries':
                r['changes'] = [{k: c[k] for k in ('at', 'reason', 'revision', 'before') if k in c} for c in r.get('changes', [])]
            if name == 'items' and r.get('payment_info'):
                r['payment_info'] = {k: r['payment_info'][k] for k in ('mode', 'amount', 'paid_on', 'existing_entry_id') if k in r['payment_info']}
    return tables


def snapshot(ident, allow_expired=False):
    if not isinstance(ident, str) or not re.fullmatch('[a-f0-9]{32}', ident): abort(404)
    row = docs.get('local_migration_snapshot', ident)
    if not row: abort(404)
    if not allow_expired and row['expires_at'] <= int(time.time()) and gate().get('snapshot_id') != ident:
        abort(410, description='迁移快照已过期，请重新创建')
    return row


def manifest(row):
    photos = []
    for at in range(row['photo_count']):
        photo = docs.get('local_migration_photo', row['id'] + ':' + str(at))
        photos.append({k: photo[k] for k in ('index', 'name', 'ready', 'size', 'hash') if k in photo})
    return {**{k: row[k] for k in ('id', 'format', 'version', 'account', 'created_at', 'expires_at', 'counts', 'pages', 'data_hash', 'cloud_version')},
            'photos': photos, 'ready': all(p['ready'] for p in photos)}


def photo_bytes(path):
    if enabled():
        from .cloud_storage import storage
        return storage().download('palm/photos/' + path)
    if not re.fullmatch(r'[a-f0-9]{32}\.jpg', path): raise InputError('云端照片引用无效')
    return (Path(current_app.config['PHOTO_DIR']) / path).read_bytes()


@bp.get(PREFIX + '/status')
def status():
    state = gate()
    ident = request.args.get('snapshot_id') or state.get('snapshot_id')
    return jsonify(mode=state['mode'], version=state['version'], confirmation=state.get('confirmation'),
                   snapshot=manifest(snapshot(ident)) if ident else None)


@bp.post(PREFIX + '/snapshots')
def create():
    state = gate()
    if state['mode'] == 'local':
        return jsonify(manifest(snapshot(state['snapshot_id'])))
    tables = business_snapshot()
    ident = secrets.token_hex(16)
    pages = []
    for name, rows in tables.items():
        chunk = []
        for row in rows:
            if len(encoded(row)) > 48 * 1024: raise InputError('单条记录过大，请先核对长备注')
            if chunk and (len(chunk) >= 100 or len(encoded(chunk + [row])) > 48 * 1024):
                pages.append({'table': name, 'rows': chunk}); chunk = []
            chunk.append(row)
        if chunk: pages.append({'table': name, 'rows': chunk})
    descriptors = []
    for at, page in enumerate(pages):
        docs.put('local_migration_page', ident + ':' + str(at), page)
        descriptors.append({'index': at, 'table': page['table'], 'count': len(page['rows']), 'hash': digest(page)})
    keys = sorted({r['photo_key'] for r in tables['items'] if r.get('photo_key')})
    names = {key: 'photo-' + hashlib.sha256(key.encode()).hexdigest()[:32] + '.jpg' for key in keys}
    for at, key in enumerate(keys):
        docs.put('local_migration_photo', ident + ':' + str(at), {'index': at, 'source': key, 'name': names[key], 'ready': False})
    row = docs.put('local_migration_snapshot', ident, {'format': 'catpaw-cloud-migration', 'version': 1,
        'account': tables['settings'][0]['user'], 'created_at': int(time.time()), 'expires_at': int(time.time()) + TTL,
        'counts': {name: len(rows) for name, rows in tables.items()}, 'pages': descriptors,
        'photo_count': len(keys), 'data_hash': digest(tables), 'cloud_version': state['version']})
    docs.put('local_migration_gate', 'current', {**state, 'snapshot_until': row['expires_at']})
    return jsonify(manifest(row)), 201


@bp.get(PREFIX + '/snapshots/<ident>/pages/<int:index>')
def page(ident, index):
    row = snapshot(ident)
    if not 0 <= index < len(row['pages']): abort(404)
    value = docs.get('local_migration_page', ident + ':' + str(index))
    return jsonify(table=value['table'], rows=value['rows'])


@bp.post(PREFIX + '/snapshots/<ident>/photos/<int:index>/prepare')
def prepare_photo(ident, index):
    row = snapshot(ident)
    if not 0 <= index < row['photo_count']: abort(404)
    photo = docs.get('local_migration_photo', ident + ':' + str(index))
    if not photo['ready']:
        if gate()['version'] != row['cloud_version']: abort(409, description='云端资料已变化，请重新创建快照')
        try: raw = photo_bytes(photo['source'])
        except (OSError, KeyError): abort(409, description='云端照片缺失，迁移未完成；原资料保留，请先核对')
        if not 0 < len(raw) <= 5 * 1024 * 1024: raise InputError('云端照片大小无效')
        frozen = secrets.token_hex(16) + '.jpg'
        if enabled():
            from .cloud_storage import storage
            storage().upload('palm/photos/' + frozen, raw)
        else:
            from .photo import write_atomic
            folder = Path(current_app.config['PHOTO_DIR']) / 'migration'
            folder.mkdir(parents=True, exist_ok=True)
            write_atomic(folder, frozen, raw)
        photo = docs.put('local_migration_photo', ident + ':' + str(index), {**photo, 'ready': True,
            'frozen': frozen, 'hash': hashlib.sha256(raw).hexdigest(), 'size': len(raw)})
    return jsonify({k: photo[k] for k in ('index', 'name', 'ready', 'hash', 'size')})


@bp.get(PREFIX + '/snapshots/<ident>/photos/<int:index>')
def download_photo(ident, index):
    row = snapshot(ident)
    if not 0 <= index < row['photo_count']: abort(404)
    photo = docs.get('local_migration_photo', ident + ':' + str(index))
    if not photo.get('ready'): abort(409, description='请先准备迁移照片')
    try: offset = int(request.args.get('offset', '0'))
    except ValueError: raise InputError('照片偏移无效')
    if offset < 0 or offset >= photo['size']: raise InputError('照片偏移无效')
    if enabled():
        from .cloud_storage import storage
        raw = storage().download('palm/photos/' + photo['frozen'])
    else:
        raw = (Path(current_app.config['PHOTO_DIR']) / 'migration' / photo['frozen']).read_bytes()
    if len(raw) != photo['size'] or hashlib.sha256(raw).hexdigest() != photo['hash']:
        abort(409, description='迁移照片校验失败，请重新下载')
    end = min(offset + 24 * 1024, len(raw))
    return jsonify(offset=offset, next_offset=end if end < len(raw) else None, data=base64.b64encode(raw[offset:end]).decode())


@bp.post(PREFIX + '/snapshots/<ident>/confirm')
def confirm(ident):
    row = snapshot(ident)
    data = body()
    if data.get('data_hash') != row['data_hash'] or data.get('backup_saved') is not True or data.get('confirmed') is not True:
        raise InputError('请先核对完整资料、保存外部备份并明确确认')
    state = gate()
    if state['mode'] == 'local':
        if state.get('snapshot_id') != ident: abort(409, description='此账户已确认其他迁移快照')
        return jsonify(confirmation=state['confirmation'], mode='local')
    if state['version'] != row['cloud_version'] or digest(business_snapshot()) != row['data_hash']:
        abort(409, description='云端资料已变化，未切换账户，请重新核对迁移')
    if not manifest(row)['ready']: raise InputError('迁移照片尚未准备完成')
    receipt = {'snapshot_id': ident, 'data_hash': row['data_hash'], 'confirmed_at': int(time.time()), 'id': secrets.token_hex(16)}
    docs.put('local_migration_gate', 'current', {**state, 'mode': 'local', 'snapshot_id': ident, 'confirmation': receipt})
    return jsonify(confirmation=receipt, mode='local')
