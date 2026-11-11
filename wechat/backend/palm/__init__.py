"""Independent PALM service for the WeChat mini program."""

import os
from pathlib import Path

from flask import Flask, jsonify

from .database import close_db, initialize_database
from .security import protect_api, no_store
from .validation import InputError
from .routes_auth import bp as auth_bp
from .routes_items import bp as items_bp
from .routes_events import bp as events_bp
from .routes_insights import bp as insights_bp
from .routes_trash import bp as trash_bp
from .routes_reports import bp as reports_bp
from .routes_cloud_photos import bp as cloud_photos_bp
from .purchases import bp as purchases_bp
from .locations import bp as locations_bp
from .ledger import bp as ledger_bp
from .membership import bp as membership_bp
from .payments import bp as payments_bp
from .rewards import bp as rewards_bp, CapacityError, capacity_error


def create_app(test_config=None):
    root = Path(__file__).resolve().parents[2]
    app = Flask(__name__, static_folder=None)
    app.config.update(
        STORAGE_BACKEND=os.getenv('PALM_STORAGE_BACKEND', 'sqlite'),
        BRIDGE_SECRET=os.getenv('PALM_BRIDGE_SECRET', ''),
        REQUEST_MODE=os.getenv('PALM_REQUEST_MODE', 'bridge'),
        CLOUD_PHOTOS_ENABLED=os.getenv('PALM_CLOUD_PHOTOS_ENABLED') == '1',
        DATABASE=str(root / "instance" / "palm.sqlite3"),
        PHOTO_DIR=str(root / "instance" / "uploads" / "items"),
        WECHAT_APP_ID=os.getenv("PALM_WECHAT_APP_ID", ""),
        WECHAT_APP_SECRET=os.getenv("PALM_WECHAT_APP_SECRET", ""),
        DEV_LOGIN=os.getenv("PALM_WECHAT_DEV_LOGIN") == "1",
        PAY_OFFER_ID=os.getenv('PALM_PAY_OFFER_ID', ''),
        PAY_APP_KEY=os.getenv('PALM_PAY_APP_KEY', ''),
        PAY_ENABLED=os.getenv('PALM_PAY_ENABLED') == '1',
        PAY_IOS_ENABLED=os.getenv('PALM_PAY_IOS_ENABLED') == '1',
        PAY_NOTIFY_SECRET=os.getenv('PALM_PAY_NOTIFY_SECRET', ''),
        PAY_PRODUCTS={name: os.getenv('PALM_PAY_PRODUCT_' + name.upper(), '') for name in ('month',)},
        PAY_IOS_PRODUCTS={name: os.getenv('PALM_PAY_IOS_PRODUCT_' + name.upper(), '') for name in ('month',)},
        PAY_TEST_ENABLED=os.getenv('PALM_PAY_TEST_ENABLED') == '1',
        PAY_TEST_USER_IDS=os.getenv('PALM_PAY_TEST_USER_IDS', ''),
        PAY_TEST_PRODUCT=os.getenv('PALM_PAY_TEST_PRODUCT', ''),
        PAY_TEST_PRICE_CENTS=os.getenv('PALM_PAY_TEST_PRICE_CENTS', '1'),
        MAX_CONTENT_LENGTH=6 * 1024 * 1024,
    )
    if test_config:
        app.config.update(test_config)
    if app.config['STORAGE_BACKEND'] not in ('sqlite', 'cloudbase'):
        raise ValueError('PALM_STORAGE_BACKEND must be sqlite or cloudbase')
    if app.config['REQUEST_MODE'] not in ('bridge', 'direct_http'):
        raise ValueError('PALM_REQUEST_MODE must be bridge or direct_http')
    if app.config['STORAGE_BACKEND'] == 'cloudbase':
        app.config['MAX_CONTENT_LENGTH'] = 64 * 1024
    from .cloud_runtime import install, start_mutation, direct_envelope
    # Registered first: wrapping runs after commit/receipt and cache headers are resolved.
    app.after_request(direct_envelope)
    install(app)
    app.teardown_appcontext(close_db)
    app.before_request(protect_api)
    app.before_request(start_mutation)
    from .local_migration import install as install_local_migration
    install_local_migration(app)
    app.after_request(no_store)
    app.register_error_handler(CapacityError, capacity_error)
    app.register_error_handler(InputError, lambda error: (jsonify(error=str(error)), 400))
    from .wechat_pay_client import PaymentProviderError, payment_error_response
    app.register_error_handler(PaymentProviderError, payment_error_response)
    from .cloud_versions import VersionError, failure as version_failure
    app.register_error_handler(VersionError, version_failure)
    app.register_error_handler(404, lambda _error: (jsonify(error="记录不存在"), 404))
    app.register_error_handler(403, lambda error: (jsonify(error=error.description), 403))
    app.register_error_handler(409, lambda error: (jsonify(error=error.description), 409))
    app.register_error_handler(415, lambda error: (jsonify(error=error.description), 415))
    app.register_error_handler(429, lambda error: (jsonify(error=error.description), 429))
    app.register_error_handler(410, lambda error: (jsonify(error=error.description), 410))
    app.register_error_handler(413, lambda _error: (jsonify(error="请求内容不能超过 64 KB" if app.config['STORAGE_BACKEND'] == 'cloudbase' else "照片不能超过 5 MB"), 413))
    for blueprint in (auth_bp, items_bp, events_bp, insights_bp, trash_bp, reports_bp, cloud_photos_bp, purchases_bp, locations_bp, ledger_bp, membership_bp, payments_bp, rewards_bp):
        app.register_blueprint(blueprint)
    @app.get("/healthz")
    def healthz():
        return jsonify(ok=True)
    return app


def initialize_app(app):
    if app.config['STORAGE_BACKEND'] == 'cloudbase':
        return app
    initialize_database(app)
    from .trash import purge_expired
    with app.app_context():
        purge_expired()
    return app
