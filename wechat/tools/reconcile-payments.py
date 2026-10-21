"""Server-only alternative to the CloudBase timer; does not enable checkout."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from palm import create_app
from palm.payments import reconcile_due

if __name__ == '__main__':
    with create_app().app_context():
        print(json.dumps(reconcile_due()))
