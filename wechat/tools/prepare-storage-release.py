"""Build the local location release from pinned offline dependencies; never deploy."""
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('prepare-purchases-release.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
release.RELEASE = 'storage-locations-20261011'
release.OUTPUT = release.DEPLOY / release.RELEASE

if __name__ == '__main__':
    release.main()
    resources = {
        'applied': False, 'environment': 'cloud1-example',
        'create_collections': [{'name': 'palm_storage_locations', 'permission': 'ADMINONLY',
                                'indexes': [{'name': 'user_id_1_id_1', 'unique': False, 'sparse': False,
                                             'fields': [{'field': 'user_id', 'direction': 'ASC'}, {'field': '_id', 'direction': 'ASC'}]}]}],
        'add_indexes': [{'collection': 'palm_items', 'name': 'user_id_1_storage_location_id_1_id_1',
                        'unique': False, 'sparse': False,
                        'fields': [{'field': 'user_id', 'direction': 'ASC'}, {'field': 'storage_location_id', 'direction': 'ASC'},
                                   {'field': '_id', 'direction': 'ASC'}]}],
        'order': ['Create collection and indexes', 'Update palm-api and bridge if used', 'Verify owner-scoped reads', 'Update client'],
        'data_migration': 'No document backfill required; absent storage_location_id resolves to unassigned.'
    }
    (release.OUTPUT / 'resources-delta.json').write_text(json.dumps(resources, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
