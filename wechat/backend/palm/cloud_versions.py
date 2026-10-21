"""Owner-first optimistic preconditions for public CloudBase item mutations."""
import re
from flask import request, jsonify
from . import cloud_repository as repo


class VersionError(Exception):
    def __init__(self, status, code, message):
        self.status, self.code, self.message = status, code, message


def failure(error):
    return jsonify(error=error.message, code=error.code, retry_same_request=False), error.status


def require_revision(row):
    value = request.headers.get('If-Match', '')
    if not value:
        raise VersionError(428, 'CLIENT_UPDATE_REQUIRED', '请更新小程序后重新打开物品')
    if not re.fullmatch(r'"(?:0|[1-9][0-9]{0,15})"', value) or int(value[1:-1]) > 9007199254740991:
        raise VersionError(400, 'INVALID_ITEM_VERSION', '物品版本无效，请重新打开物品')
    if int(value[1:-1]) != row.get('revision', 0):
        conflict()


def conflict():
    raise VersionError(409, 'ITEM_VERSION_CONFLICT', '物品已在其他设备更新，填写内容已保留，请刷新核对后再保存')


def check_mutation():
    path = request.path
    match = re.fullmatch(r'/api/mp/items/(\d+)(?:/(?:daily-target|pin|maintenance|disposal|photo(?:/uploads(?:/[0-9a-f]{48}/commit)?)?))?', path)
    if match:
        row = repo.item_row(int(match[1]))
        commit = re.search(r'/photo/uploads/([0-9a-f]{48})/commit$', path)
        if commit:
            from flask import abort, g
            ticket = repo.get('photo_uploads', commit[1])
            if not ticket or ticket['user_id'] != g.user_id or ticket['item_id'] != row['id']:
                abort(404)
            require_revision(row)
            if ticket.get('base_revision') != row.get('revision', 0):
                conflict()
        else:
            require_revision(row)
        return
    match = re.fullmatch(r'/api/mp/trash/(\d+)(?:/restore)?', path)
    if match:
        require_revision(repo.trash_row(int(match[1])))
        return
    match = re.fullmatch(r'/api/mp/(maintenance|disposal)/(\d+)', path)
    if match:
        record = repo.record_row(match[1] + '_records', int(match[2]))
        require_revision(repo.item_row(record['item_id']))
