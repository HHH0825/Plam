"""Virtual-payment orders, query verification and atomic membership delivery.

Only the future, verified provider adapter may call fulfill_verified_payment.
Neither a client callback nor an unverified notification is payment evidence.
"""
import calendar
import hashlib
import hmac
import json
import re
import secrets
import time
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from flask import Blueprint, abort, current_app, g, jsonify, request

from .cloud_runtime import enabled
from .database import get_db
from .membership import ENTITLEMENTS, PLANS, IOS_PLANS, get as member_get, put as member_put
from .routes_auth import exchange_session
from .validation import InputError, body
from .payment_budget import remaining, budget, BudgetExceeded

bp = Blueprint('virtual_payments', __name__)
ORDER_ID = re.compile(r'P[0-9a-f]{30}')
BEIJING = timezone(timedelta(hours=8))


def test_offer(user_id=None):
    """A separate, bounded real-money offer, available only to server-listed users.

    While test mode is on, all other new checkouts are closed. Misconfiguration
    never falls back to charging a normal-price plan. Existing orders continue
    to be verified using their immutable product/amount snapshots.
    """
    if not current_app.config.get('PAY_TEST_ENABLED'):
        return None
    users = current_app.config.get('PAY_TEST_USER_IDS', '')
    product = current_app.config.get('PAY_TEST_PRODUCT', '')
    price = str(current_app.config.get('PAY_TEST_PRICE_CENTS', ''))
    if (not isinstance(users, str) or not re.fullmatch(r'[1-9][0-9]*(?:,[1-9][0-9]*)*', users)
            or str(getattr(g, 'user_id', '') if user_id is None else user_id) not in users.split(',')
            or not isinstance(product, str) or not re.fullmatch(r'[A-Za-z0-9_]{1,20}', product)
            or product in list(current_app.config.get('PAY_PRODUCTS', {}).values()) + list(current_app.config.get('PAY_IOS_PRODUCTS', {}).values())
            or not re.fullmatch(r'[1-9][0-9]{0,2}', price) or not 1 <= int(price) <= 100):
        return None
    return {**PLANS[0], 'name': '月会员测试', 'price_cents': int(price), 'product_id': product}


def checkout_plans(platform=None):
    offer = test_offer()
    return [{k: v for k, v in offer.items() if k != 'product_id'}] if offer else IOS_PLANS if platform == 'ios' else PLANS


def payment_open(platform=None):
    if platform not in ('android', 'ios') or platform == 'ios' and not current_app.config.get('PAY_IOS_ENABLED'):
        return False
    values = [current_app.config.get(k) for k in ('PAY_OFFER_ID', 'PAY_APP_KEY', 'WECHAT_APP_ID', 'WECHAT_APP_SECRET')]
    products = current_app.config.get('PAY_IOS_PRODUCTS' if platform == 'ios' else 'PAY_PRODUCTS', {})
    identifiers = [products.get(p['id']) for p in PLANS]
    if current_app.config.get('PAY_TEST_ENABLED'):
        offer = test_offer()
        if not offer:
            return False
        identifiers = [offer['product_id']]
    return bool(current_app.config.get('PAY_ENABLED') and all(isinstance(v, str) and v.strip() for v in values + identifiers)
                and len(set(identifiers)) == len(identifiers)
                and (current_app.config.get('PAY_TEST_ENABLED') or platform != 'ios' or not set(identifiers).intersection(current_app.config.get('PAY_PRODUCTS', {}).values()))
                and len(current_app.config.get('PAY_NOTIFY_SECRET', '')) >= 32
                and not current_app.config.get('DEV_LOGIN'))


def pay_sig(uri, raw_body, app_key):
    """Sign the exact UTF-8 body that will be sent; never reserialize it afterward."""
    return hmac.new(app_key.encode('utf-8'), (uri + '&' + raw_body).encode('utf-8'), hashlib.sha256).hexdigest()


def user_signature(raw_body, session_key):
    return hmac.new(session_key.encode('utf-8'), raw_body.encode('utf-8'), hashlib.sha256).hexdigest()


def raw_json(data):
    return json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def query_request(order, app_key):
    """Return an inseparable request body/signature pair, without guessing response fields."""
    raw = raw_json({'openid': order['openid'], 'env': 0, 'order_id': order['id']})
    return raw, pay_sig('/xpay/query_order', raw, app_key)


@contextmanager
def transaction():
    """Orders, platform receipt and membership must commit together on both stores."""
    if enabled():
        if getattr(g, 'cloud_tx', None):
            raise RuntimeError('Payment transactions cannot be nested')
        client = current_app.extensions['cloudbase_database']
        ident = client.start_transaction()
        g.cloud_tx = ident
        try:
            yield
            remaining(reserve=.05)
            client.finish_transaction(ident, commit=True)
        except Exception:
            try:
                client.finish_transaction(ident)
            except Exception:
                pass  # A failed/uncertain commit may already have closed the transaction.
            finally:
                g.cloud_tx = None
            raise
        finally:
            g.cloud_tx = None
    else:
        db = get_db()
        db.execute('BEGIN IMMEDIATE')
        try:
            yield
            remaining(reserve=.05)
            db.commit()
        except Exception:
            db.rollback()
            raise


def read_order(ident):
    if not isinstance(ident, str) or not ORDER_ID.fullmatch(ident):
        return None
    if enabled():
        from .cloud_repository import get
        return get('pay_orders', ident)
    row = get_db().execute('SELECT payload FROM pay_orders WHERE id=?', (ident,)).fetchone()
    return json.loads(row['payload']) if row else None


def save_order(order, new=False):
    if enabled():
        from .cloud_repository import put, change
        (put if new else change)('pay_orders', order['id'], order)
    elif new:
        get_db().execute('INSERT INTO pay_orders VALUES(?,?,?,?,?)',
                         (order['id'], order['user_id'], order['status'], order['next_query_at'], raw_json(order)))
    else:
        get_db().execute('UPDATE pay_orders SET status=?, next_query_at=?, payload=? WHERE id=?',
                         (order['status'], order['next_query_at'], raw_json(order), order['id']))


def identity_owner(openid):
    if enabled():
        from .cloud_repository import get
        row = get('wechat_identities', hashlib.sha256(openid.encode('utf-8')).hexdigest())
    else:
        row = get_db().execute('SELECT user_id FROM wechat_identities WHERE openid=?', (openid,)).fetchone()
    return row['user_id'] if row else None


def require_purchase_available():
    from .membership import state
    identity = state()
    if identity['active']:
        response = jsonify(error='已拥有猫爪会员，到期后可再次购买', code='MEMBERSHIP_ALREADY_OWNED',
                           expires_at=identity['expires_at'])
        response.status_code = 409
        abort(response)


def require_no_pending_order():
    guard = member_get('membership_purchase_guard', 'current')
    guarded = read_order(guard.get('order_id')) if guard else None
    rows = account_orders(g.user_id)
    unresolved = next((o for o in ([guarded] if guarded else []) + rows
                       if o['status'] == 'pending' and not o.get('can_purchase_again')), None)
    if unresolved:
        response = jsonify(error='已有待确认订单，请先核对原订单', code='PAYMENT_ORDER_PENDING',
                           order=public_order(unresolved))
        response.status_code = 409
        abort(response)
    return rows


def create_order(plan_id, code, platform, expected_price_cents):
    """Persist before returning payData. SessionKey and signatures are never stored."""
    if plan_id == 'year':
        abort(410, description='该套餐已停售，请更新后重新选择')
    require_purchase_available()
    if not payment_open(platform):
        abort(503, description='当前账号的支付配置尚未就绪')
    plan = next((p for p in checkout_plans(platform) if p['id'] == plan_id), None)
    if not plan or not isinstance(code, str) or not 1 <= len(code) <= 256 or code.startswith('dev:'):
        raise InputError('请选择会员套餐并重新获取微信登录凭证')
    if type(expected_price_cents) is not int or expected_price_cents != plan['price_cents']:
        abort(409, description='价格已更新，请刷新会员页并核对金额后重试')
    offer = current_app.config.get('PAY_OFFER_ID', '')
    app_key = current_app.config.get('PAY_APP_KEY', '')
    product = test_offer()['product_id'] if current_app.config.get('PAY_TEST_ENABLED') else current_app.config.get('PAY_IOS_PRODUCTS' if platform == 'ios' else 'PAY_PRODUCTS', {}).get(plan_id, '')
    if not all(isinstance(v, str) and v.strip() and len(v) <= 256 for v in (offer, app_key, product)):
        abort(503, description='会员订阅配置尚未完成')
    require_no_pending_order()
    session = exchange_session(code)
    if (not isinstance(session, dict) or session.get('errcode')
            or not isinstance(session.get('openid'), str) or not session['openid']
            or not isinstance(session.get('session_key'), str) or not session['session_key']):
        raise InputError('无法取得微信支付登录凭证，请重新登录')
    now = int(time.time())
    order = {'id': 'P' + secrets.token_hex(15), 'user_id': g.user_id,
             'openid': session['openid'], 'plan_id': plan_id, 'platform': platform, 'months': plan['months'],
             'product_id': product, 'price_cents': plan['price_cents'], 'quantity': 1,
             'attach': secrets.token_hex(16), 'status': 'pending', 'created_at': now,
             'next_query_at': now + 300, 'wx_order_id': None}
    order['test_payment'] = bool(current_app.config.get('PAY_TEST_ENABLED'))
    with transaction():
        require_purchase_available()
        if identity_owner(session['openid']) != g.user_id:
            abort(403, description='微信支付账户与当前登录账户不一致，请重新登录')
        # All new checkouts write the same account-scoped guard. Concurrent
        # transactions cannot both publish new orders, including an empty account.
        rows = require_no_pending_order()
        if sum(o['created_at'] > now - 60 for o in rows) >= 30:
            abort(429, description='下单过于频繁，请稍后核对已有订单')
        save_order(order, new=True)
        member_put('membership_purchase_guard', 'current', {'order_id': order['id'], 'created_at': now})
    sign_data = raw_json({'offerId': offer, 'buyQuantity': 1, 'env': 0, 'currencyType': 'CNY',
                         'productId': product, 'goodsPrice': plan['price_cents'],
                         'outTradeNo': order['id'], 'attach': order['attach']})
    return order, {'signData': sign_data, 'mode': 'short_series_goods',
                   'paySig': pay_sig('requestVirtualPayment', sign_data, app_key),
                   'signature': user_signature(sign_data, session['session_key'])}


def add_months(timestamp, months):
    point = datetime.fromtimestamp(timestamp, BEIJING)
    absolute = point.year * 12 + point.month - 1 + months
    year, month_zero = divmod(absolute, 12)
    month = month_zero + 1
    return int(point.replace(year=year, month=month,
                             day=min(point.day, calendar.monthrange(year, month)[1])).timestamp())


@dataclass(frozen=True)
class VerifiedPayment:
    """Internal normalized proof, constructed ONLY after provider verification.

    This is not an HTTP schema. Only a successful server-to-WeChat query can
    construct this proof; notification parameters never substitute for a query.
    """
    out_trade_no: str
    wx_order_id: str
    openid: str
    product_id: str
    quantity: int
    attach: str
    price_cents: int


def fulfill_verified_payment(proof):
    if not isinstance(proof, VerifiedPayment):
        raise ValueError('Verified provider evidence required')
    if not isinstance(proof.wx_order_id, str) or not 1 <= len(proof.wx_order_id) <= 256:
        raise ValueError('Invalid platform order ID')
    if type(proof.quantity) is not int or type(proof.price_cents) is not int:
        raise ValueError('Payment values must be integers')
    previous_owner = g.pop('user_id', None)
    try:
        with transaction():
            order = read_order(proof.out_trade_no)
            if not order or (proof.openid, proof.product_id, proof.quantity, proof.attach, proof.price_cents) != (
                    order['openid'], order['product_id'], order['quantity'], order['attach'], order['price_cents']):
                raise ValueError('Payment does not match issued order')
            receipt_id = hashlib.sha256(proof.wx_order_id.encode('utf-8')).hexdigest()
            if enabled():
                from .cloud_repository import get, put
                receipt = get('pay_deliveries', receipt_id)
            else:
                raw = get_db().execute('SELECT payload FROM pay_deliveries WHERE id=?', (receipt_id,)).fetchone()
                receipt = json.loads(raw['payload']) if raw else None
            if receipt:
                if receipt['order_id'] != order['id'] or receipt['user_id'] != order['user_id']:
                    raise ValueError('Platform order already belongs to another order')
                if order['status'] not in ('fulfilled', 'refunded', 'partial_refund') or order['wx_order_id'] != proof.wx_order_id:
                    raise ValueError('Inconsistent delivery receipt')
                return public_order(order)
            if order['status'] != 'pending' or order['wx_order_id'] is not None:
                raise ValueError('Order is not awaiting delivery')
            g.user_id = order['user_id']
            now = int(time.time())
            from .entitlements import ledger, recalculate
            membership, _, _ = ledger()
            grant_index = membership.get('pay_grant_index', 0) + 1
            membership.update(pay_grant_index=grant_index, test_only=False)
            receipt = {'order_id': order['id'], 'user_id': order['user_id'],
                       'wx_order_id': proof.wx_order_id, 'fulfilled_at': now}
            if enabled():
                put('pay_deliveries', receipt_id, receipt)
            else:
                get_db().execute('INSERT INTO pay_deliveries VALUES(?,?)', (receipt_id, raw_json(receipt)))
            order.update(status='fulfilled', wx_order_id=proof.wx_order_id, fulfilled_at=now, can_purchase_again=False,
                         grant_index=grant_index, next_query_at=now + 86400)
            save_order(order)
            recalculate(membership)
            return public_order(order)
    finally:
        if previous_owner is not None:
            g.user_id = previous_owner
        else:
            g.pop('user_id', None)


def public_order(order):
    # No OpenID, attach, keys, payData or provider responses are returned here.
    return {k: order.get(k) for k in ('id', 'plan_id', 'platform', 'price_cents', 'status', 'created_at', 'fulfilled_at', 'can_purchase_again', 'test_payment', 'lookup_state')}


def owned_order(ident):
    order = read_order(ident)
    if not order or order['user_id'] != g.user_id:
        abort(404)
    return order


def account_orders(user_id):
    if enabled():
        from .cloud_repository import query
        return query('pay_orders', {'user_id': user_id})
    return [json.loads(r['payload']) for r in get_db().execute('SELECT payload FROM pay_orders WHERE user_id=?', (user_id,))]


def apply_refund(ident, platform_id, remaining):
    previous_owner = g.pop('user_id', None)
    try:
        with transaction():
            order = read_order(ident)
            if order['wx_order_id'] and order['wx_order_id'] != platform_id:
                raise ValueError('Refund platform ID mismatch')
            receipt_id = hashlib.sha256(platform_id.encode('utf-8')).hexdigest()
            if enabled():
                from .cloud_repository import get, put
                receipt = get('pay_deliveries', receipt_id)
            else:
                raw = get_db().execute('SELECT payload FROM pay_deliveries WHERE id=?', (receipt_id,)).fetchone()
                receipt = json.loads(raw['payload']) if raw else None
            if receipt and (receipt['order_id'] != order['id'] or receipt['user_id'] != order['user_id']):
                raise ValueError('Refund platform order belongs to another order')
            if not receipt:
                # Claim the platform ID even when refund precedes first delivery.
                receipt = {'order_id': order['id'], 'user_id': order['user_id'],
                           'wx_order_id': platform_id, 'refunded_before_delivery': True}
                if enabled():
                    put('pay_deliveries', receipt_id, receipt)
                else:
                    get_db().execute('INSERT INTO pay_deliveries VALUES(?,?)', (receipt_id, raw_json(receipt)))
            target = 'refunded' if remaining == 0 else 'partial_refund'
            if order['status'] == 'refunded':
                return public_order(order)
            from .entitlements import ledger, recalculate
            g.user_id = order['user_id']
            member = ledger()[0] if order.get('grant_index') else None
            order.update(status=target, wx_order_id=platform_id, remaining_cents=remaining, can_purchase_again=False,
                         next_query_at=int(time.time()) + 86400)
            save_order(order)
            if member is not None:
                recalculate(member)
            return public_order(order)
    finally:
        if previous_owner is not None:
            g.user_id = previous_owner
        else:
            g.pop('user_id', None)


def sync_order(ident, user_id=None):
    """No external request runs inside a database transaction."""
    from .wechat_pay_client import PaymentProviderError, client
    with transaction():
        order = read_order(ident)
        if not order or user_id is not None and order['user_id'] != user_id:
            abort(404)
        now = int(time.time())
        if now - order.get('last_query_at', 0) < 3:
            return public_order(order)
        order['last_query_at'] = now
        order['can_purchase_again'] = False
        save_order(order)
    try:
        remote = client().query_order(order)
    except PaymentProviderError as error:
        # Controlled recovery for small, server-authorized test orders only.
        # Absence is not proof of cancellation: retain the pending order and
        # reconciliation schedule, including if it is paid later.
        if (not error.order_not_found or error.code != 268490002 or error.stage != 'query_order' or order['status'] != 'pending'
                or not order.get('test_payment') or not test_offer(order['user_id'])
                or type(order['price_cents']) is not int or not 1 <= order['price_cents'] <= 100):
            raise
        with transaction():
            latest = read_order(ident)
            if latest['status'] != 'pending':
                return public_order(latest)
            observed = int(time.time())
            first = latest.get('not_found_first_at', observed)
            count = latest.get('not_found_count', 0) + 1
            latest.update(lookup_state='not_found', not_found_first_at=first, not_found_count=count,
                          can_purchase_again=(count >= 2 and observed - first >= 5 and observed - latest['created_at'] >= 60))
            save_order(latest)
            return public_order(latest)
    if (not isinstance(remote, dict) or remote.get('order_id') != order['id']
            or type(remote.get('env_type')) is not int or remote['env_type'] != 1
            or type(remote.get('order_type')) is not int or remote['order_type'] not in (0, 7)
            or type(remote.get('order_fee')) is not int or remote['order_fee'] != order['price_cents']
            or type(remote.get('status')) is not int or remote['status'] not in range(11)):
        raise PaymentProviderError('Order verification failed')
    status = remote['status']
    if status in (2, 3, 4, 8):
        platform_id = remote.get('wx_order_id')
        if (not isinstance(platform_id, str) or not 1 <= len(platform_id) <= 256
                or type(remote.get('paid_fee')) is not int or remote['paid_fee'] != order['price_cents']
                or type(remote.get('left_fee')) is not int or not 0 <= remote['left_fee'] <= remote['paid_fee']
                or type(remote.get('paid_time')) is not int or remote['paid_time'] <= 0):
            raise PaymentProviderError('Paid amount verification failed')
        if remote['left_fee'] < remote['paid_fee']:
            try:
                return apply_refund(order['id'], platform_id, remote['left_fee'])
            except ValueError as exc:
                raise PaymentProviderError('Refund verification failed') from exc
        if status == 8:
            raise PaymentProviderError('Inconsistent refund response')
        try:
            return fulfill_verified_payment(VerifiedPayment(order['id'], platform_id, order['openid'],
                                            order['product_id'], order['quantity'], order['attach'], order['price_cents']))
        except ValueError as exc:
            raise PaymentProviderError('Delivery verification failed') from exc
    if status == 6 and order['status'] == 'pending':
        with transaction():
            latest = read_order(ident)
            if latest['status'] == 'pending':
                latest.update(status='closed', next_query_at=0)
                save_order(latest)
                return public_order(latest)
    if status in (0, 1) and order['status'] == 'pending':
        with transaction():
            latest = read_order(ident)
            if latest['status'] == 'pending':
                latest['can_purchase_again'] = True
                latest['lookup_state'] = 'found'
                latest.pop('not_found_first_at', None)
                latest.pop('not_found_count', None)
                save_order(latest)
    # Initialization, unpaid, refund-in-progress and unknown business states
    # never count as successful payment or reverse a fulfilled order.
    return public_order(read_order(ident))


def reconcile_due(limit=1):
    """Called by an authenticated server scheduler, never by a public client route."""
    from .wechat_pay_client import PaymentProviderError
    now = int(time.time())
    limit = min(1, max(0, limit))
    if enabled():
        from .cloud_repository import db, get, collection
        cursor = get('sequences', 'pay_reconcile_cursor') or {}
        rows = db().page(collection('pay_orders'), {'next_query_at': {'$gt': 0, '$lte': now}},
                         limit=limit, after=cursor.get('after'))
        if not rows and cursor.get('after'):
            rows = db().page(collection('pay_orders'), {'next_query_at': {'$gt': 0, '$lte': now}}, limit=limit)
    else:
        rows = [json.loads(r['payload']) for r in get_db().execute(
            'SELECT payload FROM pay_orders WHERE next_query_at>0 AND next_query_at<=? ORDER BY next_query_at,id LIMIT ?', (now, limit))]
    results = {'checked': 0, 'failed': 0}
    for order in (rows if enabled() else sorted(rows, key=lambda r: (r['next_query_at'], r['id'])))[:limit]:
        remaining(reserve=.1)
        # Persist the lease and cursor before external work. A crash or timeout
        # keeps this order scheduled and lets the next tick reach another row.
        with transaction():
            latest = read_order(order['id'])
            if not latest or not latest['next_query_at']:
                continue
            latest['next_query_at'] = now + (300 if latest['status'] == 'pending' else 86400)
            save_order(latest)
            if enabled():
                from .cloud_repository import get, put, change
                (change if get('sequences', 'pay_reconcile_cursor') else put)(
                    'sequences', 'pay_reconcile_cursor', {'after': order['id']})
        results['checked'] += 1
        try:
            sync_order(order['id'])
        except (PaymentProviderError, ValueError, BudgetExceeded):
            results['failed'] += 1
        if results['failed']:
            raise BudgetExceeded('reconciliation_not_confirmed')
    return results


@bp.post('/api/mp/pay/order')
def order_route():
    data = body()
    if data.get('plan_id') == 'year':
        return jsonify(error='该套餐已停售，请更新后重新选择', code='PLAN_RETIRED'), 410
    require_purchase_available()
    if not current_app.config.get('PAY_ENABLED'):
        return jsonify(error='订阅即将开放，支付接入尚未完成验收', code='PAYMENT_UNAVAILABLE'), 503
    if set(data).difference({'plan_id', 'code', 'platform', 'expected_price_cents'}):
        raise InputError('下单仅接受套餐、终端、展示价格和微信登录凭证')
    if set(data) != {'plan_id', 'code', 'platform', 'expected_price_cents'}:
        return jsonify(error='请更新小程序后再购买会员，已有订单仍可核对', code='CLIENT_UPDATE_REQUIRED'), 428
    if data['platform'] not in ('android', 'ios'):
        raise InputError('当前终端暂不支持购买会员')
    if not payment_open(data['platform']):
        return jsonify(error='当前账号或终端的订阅暂未开放', code='PAYMENT_UNAVAILABLE'), 503
    if not isinstance(data['plan_id'], str):
        raise InputError('下单仅接受套餐和微信登录凭证')
    order, pay_data = create_order(data['plan_id'], data['code'], data['platform'], data['expected_price_cents'])
    return jsonify(order=public_order(order), payData=pay_data), 201


@bp.get('/api/mp/pay/orders/<ident>')
def order_status(ident):
    return jsonify(order=public_order(owned_order(ident)))


@bp.get('/api/mp/pay/orders')
def orders_route():
    rows = sorted(account_orders(g.user_id), key=lambda r: (r['created_at'], r['id']), reverse=True)
    return jsonify(orders=[public_order(o) for o in rows[:20]])


@bp.post('/api/mp/pay/query')
def query_route():
    data = body()
    if set(data) != {'out_trade_no'}:
        raise InputError('请提交要核对的订单号')
    order = owned_order(data['out_trade_no'])
    return jsonify(order=sync_order(order['id'], g.user_id))


def internal_signature(raw, timestamp, secret):
    return hmac.new(secret.encode('utf-8'), timestamp.encode('ascii') + b'\n' + raw, hashlib.sha256).hexdigest()


@bp.post('/payments/wechat/notify')
def notification_route():
    started = time.monotonic()
    try:
        with budget(2):
            return process_notification()
    except (BudgetExceeded, TimeoutError):
        current_app.logger.warning('payment_relay stage=deadline elapsed_ms=%d', int((time.monotonic()-started)*1000))
        return jsonify(ErrCode=1, ErrMsg='payment_unconfirmed'), 503
    except Exception as error:
        current_app.logger.warning('payment_relay stage=verification reason=%s elapsed_ms=%d',
                                   type(error).__name__, int((time.monotonic()-started)*1000))
        raise


def process_notification():
    # This is a private cloud-function relay, NOT an MP XML callback URL.
    # Even a correctly signed relay message must pass an independent WeChat query.
    secret = current_app.config.get('PAY_NOTIFY_SECRET', '')
    raw, timestamp = request.get_data(), request.headers.get('X-Palm-Pay-Time', '')
    if (len(secret) < 32 or len(raw) > 16384 or not re.fullmatch(r'[0-9]{10,11}', timestamp)
            or abs(int(timestamp) - int(time.time())) > 300
            or not hmac.compare_digest(request.headers.get('X-Palm-Pay-Signature', ''), internal_signature(raw, timestamp, secret))):
        return jsonify(ErrCode=1, ErrMsg='unauthorized'), 403
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(ErrCode=1, ErrMsg='invalid_event'), 400
    if data.get('action') == 'reconcile':
        return jsonify(ErrCode=0, ErrMsg='success', results=reconcile_due())
    if data.get('Event') not in ('xpay_goods_deliver_notify', 'xpay_refund_notify') or data.get('Env') != 0:
        return jsonify(ErrCode=1, ErrMsg='unsupported_event'), 400
    order = read_order(data.get('OutTradeNo'))
    if not order or data.get('OpenId') != order['openid']:
        return jsonify(ErrCode=1, ErrMsg='order_mismatch'), 400
    result = sync_order(order['id'])
    if data['Event'] == 'xpay_refund_notify' and result['status'] not in ('refunded', 'partial_refund'):
        return jsonify(ErrCode=1, ErrMsg='refund_unconfirmed'), 503
    if result['status'] not in ('fulfilled', 'refunded', 'partial_refund'):
        return jsonify(ErrCode=1, ErrMsg='payment_unconfirmed'), 503
    return jsonify(ErrCode=0, ErrMsg='success')
