"""Separate diagnostic Flask service; never register these routes in palm."""

import hmac
import os
import threading
import time

from flask import Flask, jsonify, request

from .client import Client, Configuration, ConfigurationError
from .probe import run_probe


def create_app(settings=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(PROBE_ENABLED=os.getenv("PALM_CLOUD_PROBE_ENABLED") == "1",
                      PROBE_ACCESS_TOKEN=os.getenv("PALM_CLOUD_PROBE_TOKEN", ""),
                      PROBE_COOLDOWN_SECONDS=60, MAX_CONTENT_LENGTH=1024)
    if settings:
        app.config.update(settings)
    lock = threading.Lock()
    next_allowed = 0.0

    @app.after_request
    def private_response(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.get("/")
    @app.get("/healthz")
    def health():
        return jsonify(ok=True, diagnostic_bundle="palm-cloudbase-probe-v1")

    @app.post("/probe")
    def probe():
        nonlocal next_allowed
        token = app.config["PROBE_ACCESS_TOKEN"]
        if not app.config["PROBE_ENABLED"] or not isinstance(token, str) or len(token) < 32 or not token.isascii() or any(c.isspace() for c in token):
            return jsonify(error="验证未开启或验证口令未配置（至少 32 位）"), 503
        supplied = request.headers.get("Authorization", "")
        if not hmac.compare_digest(supplied.encode("utf-8"), ("Bearer " + token).encode("utf-8")):
            return jsonify(error="验证口令不正确"), 401
        # No arbitrary collection names, query bodies or administrator credentials.
        if request.query_string or request.get_data():
            return jsonify(error="验证请求不接受参数或请求体"), 400
        if not lock.acquire(blocking=False):
            return jsonify(error="验证正在运行，请勿重复点击"), 429
        try:
            if time.monotonic() < next_allowed:
                return jsonify(error="请至少间隔一分钟再验证"), 429
            try:
                client = Client(Configuration.from_environ())
            except ConfigurationError as error:
                return jsonify(error=str(error)), 503
            next_allowed = time.monotonic() + app.config["PROBE_COOLDOWN_SECONDS"]
            result = run_probe(client)
            return jsonify(result), 200 if result["ok"] else 502
        finally:
            lock.release()

    @app.errorhandler(413)
    def too_large(_error):
        return jsonify(error="验证请求不接受上传内容"), 413

    return app
