"""Owner-scoped, flat storage locations and atomic item moves."""
from flask import Blueprint, abort, g, jsonify, request
from .cloud_runtime import enabled
from .database import get_db
from .validation import InputError, body, value
from .purchases import rows, owned, save, mutation, revision

bp = Blueprint('locations', __name__)


def location_map():
    if 'storage_locations' not in g:
        g.storage_locations = {r['id']: r for r in rows('storage_locations') if not r.get('deleted')}
    return g.storage_locations


def resolve_location(ident):
    row = location_map().get(ident)
    return {'storage_location_id': row['id'] if row else None,
            'storage_location_name': row['name'] if row else None}


def location_value(data, default=None):
    ident = data.get('storage_location_id', default)
    if ident is None:
        return None
    if isinstance(ident, bool) or not isinstance(ident, int) or ident <= 0:
        raise InputError('请选择有效的收纳位置')
    row = owned('storage_locations', ident)
    if row.get('deleted'):
        abort(409, description='收纳位置已删除，请重新选择')
    return ident


def live_location(ident):
    row = owned('storage_locations', ident)
    if row.get('deleted'):
        abort(404)
    return row


def unique_name(data, ident=None):
    name = value(data, 'name', '位置名称', 40)
    # Serialize namespace edits even for concurrent different location documents.
    if enabled():
        from .cloud_repository import get, change
        user = get('users', g.user_id)
        change('users', g.user_id, {'locations_revision': user.get('locations_revision', 0) + 1})
    for row in rows('storage_locations'):
        if not row.get('deleted') and row['id'] != ident and row['name'] == name:
            return name, row
    return name, None


@bp.route('/api/mp/storage-locations', methods=['GET', 'POST'])
@mutation
def locations():
    if request.method == 'POST':
        name, existing = unique_name(body())
        if existing:
            return jsonify(error='已有同名位置，请使用已有位置', code='LOCATION_NAME_EXISTS', retry_same_request=False, location=existing), 409
        row = save('storage_locations', {'name': name, 'deleted': False})
        g.pop('storage_locations', None)
        return jsonify(row), 201
    from .repository import list_item_rows
    counts, unset = {}, 0
    for item in list_item_rows(g.user_id):
        if item['status'] not in ('active', 'idle'):
            continue
        ident = resolve_location(dict(item).get('storage_location_id'))['storage_location_id']
        if ident is None:
            unset += 1
        else:
            counts[ident] = counts.get(ident, 0) + 1
    return jsonify(locations=[{**r, 'count': counts.get(r['id'], 0)} for r in
                              sorted(location_map().values(), key=lambda r: r['id'])], unassigned_count=unset)


@bp.route('/api/mp/storage-locations/<int:ident>', methods=['PUT', 'DELETE'])
@mutation
def edit_location(ident):
    row = live_location(ident)
    revision(row)
    if request.method == 'DELETE':
        result = save('storage_locations', {**row, 'deleted': True})
    else:
        name, existing = unique_name(body(), ident)
        if existing:
            return jsonify(error='已有同名位置，请使用其他名称', code='LOCATION_NAME_EXISTS', retry_same_request=False, location=existing), 409
        result = save('storage_locations', {**row, 'name': name})
    g.pop('storage_locations', None)
    return jsonify(result)


@bp.post('/api/mp/storage-locations/assign')
@mutation
def assign():
    data = body()
    if 'storage_location_id' not in data:
        raise InputError('请选择目标位置；清除位置请提交空值')
    target = location_value(data)
    entries = data.get('items')
    if not isinstance(entries, list) or not 1 <= len(entries) <= 50:
        raise InputError('每次请选择 1 至 50 件物品')
    seen, checked = set(), []
    from .repository import item_row
    from .cloud_versions import VersionError
    for entry in entries:
        if not isinstance(entry, dict):
            raise InputError('物品参数无效')
        ident, version = entry.get('id'), entry.get('revision')
        if isinstance(ident, bool) or not isinstance(ident, int) or ident <= 0 or ident in seen:
            raise InputError('物品编号无效或重复')
        if isinstance(version, bool) or not isinstance(version, int) or not 0 <= version <= 9007199254740991:
            raise InputError('物品版本无效，请刷新后重试')
        seen.add(ident)
        row = dict(item_row(ident))
        if row['status'] not in ('active', 'idle'):
            abort(409, description='物品已处置，请刷新核对后重新选择')
        if row.get('revision', 0) != version:
            raise VersionError(409, 'ITEM_VERSION_CONFLICT', '物品已更新，选择已保留，请刷新核对后重试')
        checked.append(row)
    for row in checked:
        if enabled():
            from .cloud_repository import touch
            touch(row, {'storage_location_id': target})
        else:
            get_db().execute('UPDATE items SET storage_location_id=?, revision=revision+1 WHERE id=? AND user_id=?',
                             (target, row['id'], g.user_id))
    return jsonify(items=[{'id': r['id'], 'revision': r.get('revision', 0) + 1,
                           **resolve_location(target)} for r in checked])
