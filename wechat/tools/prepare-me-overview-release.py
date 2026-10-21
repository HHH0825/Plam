"""Offline local artifacts only; no database changes or deployment."""
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('prepare-purchases-release.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
release.RELEASE = 'me-overview-20261011'
release.OUTPUT = release.DEPLOY / release.RELEASE

if __name__ == '__main__':
    release.main()
    resources = {'applied': False, 'create_collections': [], 'add_indexes': [], 'data_migration': 'None',
                 'changes': ['GET /auth/me adds account_age_days', 'GET /stats adds held_items and held_purchase_total'],
                 'compatibility': 'Additive response fields; old clients remain compatible. Existing storage/subscription prerequisites still apply.'}
    (release.OUTPUT / 'resources-delta.json').write_text(json.dumps(resources, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
