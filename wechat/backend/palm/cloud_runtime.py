"""Request transactions, bridge authentication and persisted idempotency receipts."""
import hashlib
import hmac
import json
import re
import time
from flask import current_app, g, jsonify, request
from .cloud_client import CloudBaseError, DocumentClient, Configuration


def enabled(): return current_app.config['STORAGE_BACKEND'] == 'cloudbase'


def direct_envelope(response):
    """The native SDK discards non-2xx JSON. Carry business status in a JSON envelope."""
    if enabled() and current_app.config['REQUEST_MODE'] == 'direct_http' and request.path.startswith('/api/mp/'):
        payload = response.get_json(silent=True) if response.status_code != 204 else None
        if payload is None and response.status_code != 204:
            payload = {'error': '云端响应无效'}
        # Native invocation platform logs include RetMsg (the response body).
        # Carry the login credential in a response header, never the logged JSON.
        token = None
        payment_data = None
        if request.path == '/api/mp/auth/login' and response.status_code == 200 and isinstance(payload, dict):
            token = payload.pop('token', None)
        if request.path == '/api/mp/pay/order' and response.status_code == 201 and isinstance(payload, dict):
            payment_data = payload.pop('payData', None)
        wrapped = jsonify(palm_http=1, statusCode=response.status_code, data=payload)
        if token:
            wrapped.headers['X-Palm-Session'] = token
        if payment_data:
            wrapped.headers['X-Palm-Pay-Data'] = json.dumps(payment_data, ensure_ascii=True, separators=(',', ':'))
        if response.headers.get('X-Palm-Photo-Transfer'):
            wrapped.headers['X-Palm-Photo-Transfer'] = response.headers['X-Palm-Photo-Transfer']
        wrapped.headers['Cache-Control'] = 'no-store'
        return wrapped
    return response


def begin():
    if not getattr(g, 'cloud_tx', None):
        g.cloud_tx = current_app.extensions['cloudbase_database'].start_transaction()


def bridge_auth():
    if enabled() and request.path.startswith('/api/mp/'):
        if current_app.config['REQUEST_MODE'] == 'bridge':
            secret = current_app.config['BRIDGE_SECRET']
            if not hmac.compare_digest(request.headers.get('X-Palm-Bridge', ''), secret):
                return jsonify(error='请求来源无效'), 403
        # Apply before login/session processing, including chunked bodies without Content-Length.
        if len(request.get_data()) > 64 * 1024:
            return jsonify(error='请求内容不能超过 64 KB'), 413
        if request.get_data() and request.mimetype != 'application/json':
            return jsonify(error='云端业务请求仅支持 JSON'), 415


def start_mutation():
    if not enabled() or not request.path.startswith('/api/mp/') or request.method not in ('POST', 'PUT', 'DELETE'):
        return None
    if request.path == '/api/mp/auth/login': return None
    # Payment routes own their short transactions; wx.login exchange happens
    # outside a transaction and signed payData must not enter replay receipts.
    if request.path.startswith('/api/mp/pay/'): return None
    key = request.headers.get('Idempotency-Key', '')
    if not re.fullmatch(r'[A-Za-z0-9_-]{16,100}', key):
        return jsonify(error='请提交有效的请求标识'), 400
    if request.get_data() and request.mimetype != 'application/json':
        return jsonify(error='云端业务请求仅支持 JSON'), 415
    if request.content_length and request.content_length > 64 * 1024:
        return jsonify(error='请求内容过大'), 413
    from .cloud_repository import get
    if '/photo/uploads' in request.path:
        from .routes_cloud_photos import require_photos
        unavailable = require_photos()
        if unavailable: return unavailable
    g.receipt_id = hashlib.sha256(f'{g.user_id}:{key}'.encode()).hexdigest()
    version = request.headers.get('If-Match', '')
    g.receipt_fingerprint = hashlib.sha256(request.method.encode() + request.full_path.encode() +
        request.get_data() + (b'\0If-Match:' + version.encode() if version else b'')).hexdigest()
    receipt = get('request_receipts', g.receipt_id)
    if receipt:
        if receipt['fingerprint'] != g.receipt_fingerprint:
            return jsonify(error='请求标识已用于其他操作'), 409
        return replay_response(receipt)
    from .cloud_versions import check_mutation
    check_mutation()
    match = re.fullmatch(r'/api/mp/items/(\d+)/photo/uploads/([0-9a-f]{48})/commit', request.path)
    if match:
        from .cloud_storage import prepare_commit
        prepare_commit(match[2], int(match[1]))
    begin()
    # Recheck after opening the transaction, including concurrent requests.
    receipt = get('request_receipts', g.receipt_id)
    if receipt:
        if receipt['fingerprint'] != g.receipt_fingerprint:
            return jsonify(error='请求标识已用于其他操作'), 409
        return replay_response(receipt)
    check_mutation()


def replay_response(receipt):
    response = current_app.response_class(receipt['body'], status=receipt['status'], mimetype='application/json')
    if re.fullmatch(r'/api/mp/items/[0-9]+/photo/uploads', request.path):
        from .routes_cloud_photos import restore_upload_transfer
        return restore_upload_transfer(response)
    return response


def finish(response):
    transaction_id = getattr(g, 'cloud_tx', None)
    if not transaction_id: return response
    client = current_app.extensions['cloudbase_database']
    try:
        if response.status_code >= 400:
            client.finish_transaction(transaction_id)
        else:
            from .rewards import check_admission_commit, CapacityError, capacity_error
            try:
                check_admission_commit()
            except CapacityError as error:
                client.finish_transaction(transaction_id)
                g.cloud_tx = None
                return current_app.make_response(capacity_error(error))
            if getattr(g, 'member_operation', False):
                from .membership import state
                if not state()['active']:
                    client.finish_transaction(transaction_id)
                    g.cloud_tx = None
                    denied = jsonify(error='会员已到期，本次操作未保存；已有记录仍然保留')
                    denied.status_code = 403
                    return denied
            if getattr(g, 'receipt_id', None):
                from .cloud_repository import get, put
                if not get('request_receipts', g.receipt_id):
                    put('request_receipts', g.receipt_id, {'fingerprint': g.receipt_fingerprint,
                        'body': response.get_data(as_text=True), 'status': response.status_code,
                        'user_id': g.user_id, 'expires_at': int(time.time()) + 24 * 3600})
            client.finish_transaction(transaction_id, commit=True)
        g.cloud_tx = None
        return response
    except CloudBaseError as error:
        # Outcome may be uncertain. Retrying the same key resolves through the receipt.
        return failure(error)


def close(error=None):
    transaction_id = g.pop('cloud_tx', None)
    if transaction_id:
        try: current_app.extensions['cloudbase_database'].finish_transaction(transaction_id)
        except CloudBaseError: pass


def failure(error):
    current_app.logger.warning('CloudBase failure code=%s request_id=%s', error.code, error.request_id)
    conflict = 'CONFLICT' in error.code or 'DUPLICATE' in error.code
    response = jsonify(error='数据正在更新，请重试' if conflict else '云端服务暂不可用，请稍后重试',
                       request_id=error.request_id, retry_same_request=True)
    response.status_code = 409 if conflict else 503
    return response


def install(app):
    if app.config['STORAGE_BACKEND'] != 'cloudbase': return
    if app.config['DEV_LOGIN']: raise ValueError('Cloud mode must disable development login')
    secret = app.config['BRIDGE_SECRET']
    if app.config['REQUEST_MODE'] == 'bridge' and (not isinstance(secret, str) or len(secret) < 32):
        raise ValueError('PALM_BRIDGE_SECRET must contain at least 32 characters')
    app.extensions['cloudbase_database'] = app.config.get('CLOUDBASE_CLIENT') or DocumentClient(Configuration.from_environ())
    app.before_request(bridge_auth)
    app.after_request(finish)
    app.teardown_request(close)
    app.register_error_handler(CloudBaseError, failure)
    from .cloud_versions import VersionError, failure as version_failure
    app.register_error_handler(VersionError, version_failure)
