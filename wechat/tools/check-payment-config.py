"""Run in the server environment; prints presence checks, never credential values."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from palm import create_app
from palm.payments import payment_open

if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        products = app.config['PAY_PRODUCTS']
        print(json.dumps({'configured': {name: bool(app.config.get(key)) for name, key in (
            ('app_id','WECHAT_APP_ID'),('app_secret','WECHAT_APP_SECRET'),('offer_id','PAY_OFFER_ID'),('formal_app_key','PAY_APP_KEY'))},
            'notification_secret_length_ok': len(app.config['PAY_NOTIFY_SECRET']) >= 32,
            'products_configured': all(products.values()), 'product_ids_unique': len(set(products.values())) == len(products) == 1,
            'checkout_enabled': payment_open('android'), 'ios_checkout_enabled': payment_open('ios'),
            'ios_products_configured': all(app.config['PAY_IOS_PRODUCTS'].values()), 'ios_enabled': app.config['PAY_IOS_ENABLED'],
            'actual_credentials_validated': False, 'cloud_callback_deployed_verified': False}))
