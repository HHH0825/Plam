"""Owner-authorized photo tickets; Python verifies actual private COS signatures."""
import hashlib
import secrets
import time
from flask import Blueprint, abort, current_app, g, jsonify, request
from .cloud_runtime import enabled
from . import cloud_repository as repo
from .cloud_storage import storage, final_object
from .cos_photos import MIMES, transfer_response
from .photo import photo_version, thumbnail_key
from .services import item_payload
from .validation import InputError

bp = Blueprint('cloud_photos', __name__)

@bp.before_request
def cloud_only():
    if not enabled(): abort(404)
    return require_photos()


def require_photos():
    if not current_app.config['CLOUD_PHOTOS_ENABLED']:
        return jsonify(error='云端照片暂不可用，物品资料仍可正常保存', code='PHOTOS_DISABLED'), 503


def restore_upload_transfer(response):
    """Receipts contain only ticket metadata; regenerate within its original deadline."""
    payload = response.get_json()
    ticket = repo.get('photo_uploads', payload['ticket'])
    item_id = int(request.view_args['item_id'])
    repo.item_row(item_id)
    if not ticket or ticket['user_id'] != g.user_id or ticket['item_id'] != item_id: abort(404)
    if ticket['expires_at'] <= int(time.time()): abort(410, description='照片上传凭证已过期，请重新上传')
    if ticket.get('committed_key'): abort(409, description='照片已提交，请刷新物品')
    info = storage().upload_ticket(ticket['object_id'], ticket['content_type'], ticket['size_bytes'], ticket['expires_at'])
    return transfer_response(response, 'upload', info)

@bp.post('/api/mp/items/<int:item_id>/photo/uploads')
def upload_ticket(item_id):
    row = repo.item_row(item_id)
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or set(data) != {'size_bytes', 'content_type'}:
        raise InputError('请提供照片大小和文件类型')
    size_bytes, content_type = data['size_bytes'], data['content_type']
    if type(size_bytes) is not int or not 0 < size_bytes <= 5 * 1024 * 1024 or not isinstance(content_type, str) or content_type not in MIMES:
        raise InputError('照片只支持 JPEG、PNG、WebP，且不能超过 5 MB')
    ticket_id = secrets.token_hex(24)
    path = f'palm/staging/{g.user_id}/{ticket_id}'
    expires = int(time.time()) + 600
    info = storage().upload_ticket(path, content_type, size_bytes, expires)
    repo.put('photo_uploads', ticket_id, {'user_id': g.user_id, 'item_id': item_id,
        'object_id': path, 'expires_at': expires, 'created_at': int(time.time()), 'committed_key': None,
        'size_bytes': size_bytes, 'content_type': content_type, 'base_revision': row.get('revision', 0)})
    repo.queue_file(path, int(time.time()) + 24 * 3600)
    return transfer_response(jsonify(ticket=ticket_id, expires_at=expires), 'upload', info)

@bp.post('/api/mp/items/<int:item_id>/photo/uploads/<ticket_id>/commit')
def commit_photo(item_id, ticket_id):
    row = repo.item_row(item_id)
    ticket = repo.get('photo_uploads', ticket_id)
    if not ticket or ticket['user_id'] != g.user_id or ticket['item_id'] != item_id: abort(404)
    if not ticket.get('committed_key'):
        if ticket['expires_at'] <= int(time.time()): abort(410, description='照片上传凭证已过期，请重新上传')
        prepared = getattr(g, 'prepared_photo', None)
        if not prepared or prepared[0] != ticket_id: raise InputError('照片尚未准备完成')
        key = prepared[1]
        repo.swap_photo_key(item_id, key)
        repo.change('photo_uploads', ticket_id, {'committed_key': key})
        for name in (key, thumbnail_key(key)):
            repo.remove('storage_gc', hashlib.sha256(final_object(name).encode()).hexdigest())
    return jsonify(item_payload(repo.item_row(item_id), True))

@bp.get('/api/mp/items/<int:item_id>/photo/download')
def download_ticket(item_id):
    row = repo.item_row(item_id)
    size = request.args.get('size', 'full')
    if size not in ('full', 'thumb'): raise InputError('照片尺寸只能为 thumb 或 full')
    if not row['photo_key']: abort(404)
    version = photo_version(row['photo_key'])
    if request.args.get('v') and request.args['v'] != version: abort(409, description='照片已更新')
    key = thumbnail_key(row['photo_key']) if size == 'thumb' else row['photo_key']
    info = storage().download_ticket(final_object(key))
    return transfer_response(jsonify(version=version, expires_at=info['expires_at']), 'download', info)
