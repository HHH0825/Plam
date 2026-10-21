"""Loopback-only maintenance UI. No production HTTP routes or saved credentials."""
import hmac
import logging
import re
import secrets
import sys
import threading
import time
import webbrowser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
from flask import Flask, abort, g, jsonify, render_template, request, session
from palm import create_app
from palm.cloud_client import Configuration, DocumentClient, CloudBaseError
from palm.entitlements import overview, preview, apply_action


def user_id(value):
    if not isinstance(value, (str, int)) or isinstance(value, bool) or not str(value).isdigit():
        raise ValueError('请输入正确的用户ID')
    value = int(value)
    if not 1 <= value <= 9007199254740991:
        raise ValueError('用户ID超出范围')
    return value


def create_admin_app(test_backend=None):
    app = Flask(__name__, template_folder=str(Path(__file__).resolve().parent / 'templates'))
    app.config.update(SECRET_KEY=secrets.token_hex(32), MAX_CONTENT_LENGTH=16384,
                      SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE='Strict',
                      SESSION_COOKIE_NAME='palm_maintainer', PORT=8787)
    sessions = {}
    app.extensions['maintainer_sessions'] = sessions

    @app.before_request
    def protect():
        host = '127.0.0.1:' + str(app.config['PORT'])
        if request.remote_addr != '127.0.0.1' or request.host != host:
            abort(403)
        for ident in list(sessions):
            if time.time() - sessions[ident]['touched'] > 1800:
                del sessions[ident]
        if request.path == '/' and request.method == 'GET':
            if session.get('id') not in sessions:
                if len(sessions) >= 32:
                    abort(429)
                session['id'] = secrets.token_hex(24)
                sessions[session['id']] = {'csrf': secrets.token_hex(32), 'touched': time.time(), 'previews': {}}
            return
        context = sessions.get(session.get('id'))
        if not context or request.method != 'POST' or request.headers.get('Origin') != 'http://' + host:
            abort(403)
        if request.mimetype != 'application/json' or not hmac.compare_digest(request.headers.get('X-CSRF-Token', ''), context['csrf']):
            abort(403)
        context['touched'] = time.time()
        g.maintenance = context

    @app.after_request
    def headers(response):
        response.headers.update({'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY',
            'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
            'Content-Security-Policy': "default-src 'self'; script-src 'nonce-" + sessions.get(session.get('id'), {}).get('csrf', '') + "'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'"})
        return response

    @app.errorhandler(ValueError)
    def invalid(error):
        return jsonify(error=str(error)), 409

    @app.errorhandler(CloudBaseError)
    def cloud_error(error):
        return jsonify(error='云端操作未确认，请保留本次操作并重试；错误类型：' + error.code), 503

    @app.get('/')
    def index():
        return render_template('index.html', csrf=sessions[session['id']]['csrf'])

    @app.post('/connect')
    def connect():
        g.maintenance.pop('backend', None)
        g.maintenance['previews'] = {}
        data = payload()
        config = Configuration(data.get('env_id', ''), data.get('api_key', ''), data.get('instance') or '(default)', data.get('database') or '(default)')
        # The supplied client avoids loading any credentials from project files.
        backend = test_backend or create_app({'STORAGE_BACKEND': 'cloudbase', 'REQUEST_MODE': 'direct_http',
                    'DEV_LOGIN': False, 'PAY_ENABLED': False, 'CLOUDBASE_CLIENT': DocumentClient(config)})
        g.maintenance.update(backend=backend, environment=config.env_id, actor='local-maintainer-' + secrets.token_hex(6), previews={})
        return jsonify(connected=True, environment=config.env_id)

    def backend():
        value = g.maintenance.get('backend')
        if not value:
            raise ValueError('请先连接数据库')
        return value

    def payload():
        value = request.get_json()
        if not isinstance(value, dict):
            raise ValueError('请求内容必须为对象')
        return value

    @app.errorhandler(400)
    def malformed(_error):
        return jsonify(error='请求格式不正确，请刷新工具页面'), 400

    @app.post('/lookup')
    def lookup():
        ident = user_id(payload().get('user_id'))
        g_env = g.maintenance['environment']
        with backend().app_context():
            g.user_id = ident
            return jsonify(**overview(), environment=g_env)

    @app.post('/preview')
    def preview_route():
        data = payload()
        ident, action = user_id(data.get('user_id')), data.get('action')
        at, operation = int(time.time()), secrets.token_hex(16)
        with backend().app_context():
            g.user_id = ident
            value = preview(action, at)
        cache = g.maintenance['previews']
        for key in list(cache):
            if at-cache[key]['at'] > 300:
                del cache[key]
        if len(cache) >= 32:
            raise ValueError('待确认操作过多，请关闭工具后重新打开')
        cache[operation] = {'user_id': ident, 'action': action, 'at': at, 'fingerprint': value['fingerprint']}
        return jsonify(**value, operation=operation, environment=g.maintenance['environment'])

    @app.post('/apply')
    def apply_route():
        operation = payload().get('operation', '')
        if not isinstance(operation, str) or not re.fullmatch(r'[a-f0-9]{32}', operation):
            raise ValueError('操作标识无效，请重新预览')
        planned = g.maintenance['previews'].get(operation)
        if not planned or time.time()-planned['at'] > 300:
            raise ValueError('预览已过期，请重新查询、预览后确认')
        actor = g.maintenance['actor']
        with backend().app_context():
            g.user_id = planned['user_id']
            result = apply_action(planned['action'], operation, planned['fingerprint'], actor, planned['at'])
        return jsonify(**result, operation=operation, environment=g.maintenance['environment'])

    @app.post('/disconnect')
    def disconnect():
        sessions.pop(session['id'], None)
        session.clear()
        return jsonify(disconnected=True)

    @app.post('/shutdown')
    def shutdown():
        sessions.clear()
        stopper = app.extensions.get('shutdown')
        if stopper:
            threading.Thread(target=stopper, daemon=True).start()
        return jsonify(closed=True)

    return app


def main():
    from werkzeug.serving import make_server
    app = create_admin_app()
    server = make_server('127.0.0.1', 0, app, threaded=True)
    app.config['PORT'] = server.server_port
    app.extensions['shutdown'] = server.shutdown
    logging.getLogger('werkzeug').disabled = True
    webbrowser.open('http://127.0.0.1:' + str(server.server_port))
    launched_at = time.time()
    def idle_shutdown():
        while True:
            time.sleep(30)
            sessions = app.extensions['maintainer_sessions']
            if (not sessions and time.time()-launched_at>1800) or (sessions and all(time.time()-value['touched']>1800 for value in list(sessions.values()))):
                sessions.clear()
                server.shutdown()
                return
    threading.Thread(target=idle_shutdown, daemon=True).start()
    try:
        server.serve_forever()
    finally:
        app.extensions['maintainer_sessions'].clear()
        server.server_close()


if __name__ == '__main__':
    main()
