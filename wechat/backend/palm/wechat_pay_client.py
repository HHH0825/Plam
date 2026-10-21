"""Server-only WeChat calls. No credentials or provider bodies are logged."""
import json
import re
import threading
import time
import urllib.parse
import urllib.request

from flask import current_app, has_app_context


def safe_provider_detail(message, query=None, raw_body=None):
    """Return a short diagnostic with credentials and account/order IDs removed."""
    if not isinstance(message, str):
        return ''
    text = message[:4096]
    private = list((query or {}).values())
    if has_app_context():
        private += [current_app.config.get(key) for key in (
            'WECHAT_APP_SECRET', 'PAY_APP_KEY', 'PAY_NOTIFY_SECRET', 'WECHAT_APP_ID', 'PAY_OFFER_ID')]
    if raw_body:
        try:
            body = json.loads(raw_body)
            if isinstance(body, dict):
                private += [body.get(key) for key in ('openid', 'order_id', 'wx_order_id', 'session_key')]
        except (TypeError, ValueError):
            pass
    for value in sorted((v for v in private if isinstance(v, str) and v), key=len, reverse=True):
        text = text.replace(value, '[隐藏]')
    text = re.sub(r'https?://\S+', '[链接隐藏]', text, flags=re.I)
    text = re.sub(r'(?i)\b(access_token|session_key|pay_sig|appkey|app_key|appsecret|secret|signature)\b[\"\x27]?\s*[=:]\s*[\"\x27]?[^\s,;\"\x27}]+', r'\1=[隐藏]', text)
    text = re.sub(r'[A-Za-z0-9_-]{16,}', '[标识隐藏]', text)
    return ' '.join(text.split())[:180]


class PaymentProviderError(Exception):
    def __init__(self, message, code=None, stage='order_verification', detail='', order_not_found=False):
        super().__init__(message)
        self.code = code if type(code) is int else None
        self.stage = stage if stage in ('access_token', 'query_order', 'order_verification', 'provider_request') else 'order_verification'
        self.detail = detail
        self.order_not_found = bool(order_not_found)
        self.reason = {'WeChat service unavailable': 'network', 'WeChat rejected request': 'provider',
                       'Unexpected provider redirect': 'response', 'Provider response too large': 'response',
                       'Invalid token response': 'response', 'Invalid order response': 'response',
                       'WeChat credentials missing': 'configuration'}.get(message, 'verification')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise PaymentProviderError('Unexpected provider redirect')


def fetch_json(path, query=None, raw_body=None):
    from .payment_budget import remaining, read_response
    stage = {'/cgi-bin/token': 'access_token', '/xpay/query_order': 'query_order'}.get(path, 'provider_request')
    url = 'https://api.weixin.qq.com' + path
    if query:
        url += '?' + urllib.parse.urlencode(query)
    req = urllib.request.Request(url, data=raw_body.encode('utf-8') if raw_body is not None else None,
                                 headers={'Content-Type': 'application/json; charset=utf-8'})
    try:
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=remaining()) as response:
            raw = read_response(response, 65537)
            if len(raw) > 65536:
                raise PaymentProviderError('Provider response too large', stage=stage)
            result = json.loads(raw)
    except PaymentProviderError as exc:
        exc.stage = stage
        raise
    except (OSError, ValueError) as exc:
        raise PaymentProviderError('WeChat service unavailable', stage=stage) from exc
    if not isinstance(result, dict) or result.get('errcode', 0) != 0:
        code = result.get('errcode') if isinstance(result, dict) else None
        detail = safe_provider_detail(result.get('errmsg'), query, raw_body) if isinstance(result, dict) else ''
        missing = bool(stage == 'query_order' and code == 268490002 and isinstance(result, dict)
                       and isinstance(result.get('errmsg'), str)
                       and re.match(r'^\s*数据不存在(?:\s*rid:|\s*$)', result['errmsg']))
        raise PaymentProviderError('WeChat rejected request', code, stage=stage, detail=detail, order_not_found=missing)
    return result


class WeChatPayClient:
    def __init__(self):
        self.lock = threading.Lock()
        self.cached_token = None
        self.expires_at = 0

    def access_token(self):
        from .payment_budget import lock_with_budget
        with lock_with_budget(self.lock):
            if self.cached_token and self.expires_at > time.time():
                return self.cached_token
            app_id = current_app.config['WECHAT_APP_ID']
            secret = current_app.config['WECHAT_APP_SECRET']
            if not app_id or not secret:
                raise PaymentProviderError('WeChat credentials missing', stage='access_token')
            result = fetch_json('/cgi-bin/token', {'grant_type': 'client_credential', 'appid': app_id, 'secret': secret})
            token, expiry = result.get('access_token'), result.get('expires_in')
            if not isinstance(token, str) or not token or type(expiry) is not int or expiry <= 120:
                raise PaymentProviderError('Invalid token response', stage='access_token')
            self.cached_token, self.expires_at = token, time.time() + expiry - 120
            return token

    def query_order(self, order):
        from .payments import query_request
        raw, signature = query_request(order, current_app.config['PAY_APP_KEY'])
        token = self.access_token()
        try:
            result = fetch_json('/xpay/query_order', {'access_token': token, 'pay_sig': signature}, raw)
        except PaymentProviderError as exc:
            if exc.code not in (40001, 40014, 42001):
                raise
            from .payment_budget import lock_with_budget
            with lock_with_budget(self.lock):
                if self.cached_token == token:
                    self.cached_token, self.expires_at = None, 0
            # Read-only query: retry once with a refreshed token and identical body.
            result = fetch_json('/xpay/query_order', {'access_token': self.access_token(), 'pay_sig': signature}, raw)
        if result.get('errcode') != 0 or not isinstance(result.get('order'), dict):
            raise PaymentProviderError('Invalid order response', stage='query_order')
        return result['order']


def client():
    # Per-app instances keep test apps and deployments from sharing access tokens.
    if 'wechat_payment_client' not in current_app.extensions:
        current_app.extensions['wechat_payment_client'] = WeChatPayClient()
    return current_app.extensions['wechat_payment_client']


def payment_error_response(error):
    """Expose a fixed stage, numeric code and bounded, redacted provider detail."""
    from flask import jsonify
    labels = {'access_token': '获取微信接口凭证', 'query_order': '查询微信订单',
              'order_verification': '核对订单数据', 'provider_request': '请求微信接口'}
    details = labels[error.stage]
    if error.code is not None:
        details += '；微信错误码' + str(error.code)
        if error.detail:
            details += '；微信说明：' + error.detail
    elif error.reason == 'network':
        details += '；连接失败或超时'
    elif error.reason == 'response':
        details += '；返回数据异常'
    current_app.logger.warning('Payment verification unavailable stage=%s reason=%s wechat_code=%s',
                               error.stage, error.reason, error.code)
    return jsonify(error='微信支付结果暂时无法核实（' + details + '），请核对原订单，勿重复付款',
                   code='PAYMENT_QUERY_UNAVAILABLE', payment_stage=error.stage,
                   wechat_error_code=error.code, payment_reason=error.reason,
                   wechat_error_detail=error.detail), 503
