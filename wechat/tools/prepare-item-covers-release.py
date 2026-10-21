"""Package local deployment materials using pinned offline dependencies; never deploy."""
import importlib.util
import json
from pathlib import Path

spec=importlib.util.spec_from_file_location('cover_release',Path(__file__).with_name('prepare-purchases-release.py'))
release=importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
release.RELEASE='item-covers-20261011'
release.OUTPUT=release.DEPLOY/release.RELEASE

if __name__=='__main__':
    release.main()
    (release.OUTPUT/'resources-delta.json').write_text(json.dumps({
        'applied':False,'create_collections':[],'add_indexes':[],
        'new_item_fields':['cover_mode','cover_icon_key'],
        'capability':'GET /api/mp/auth/me -> capabilities.item_cover_icons = true',
        'sqlite_migration':{'user_version':12,'backup_suffix':'.pre-covers.bak','automatic':True},
        'cloud_migration':'No backfill required; absent cover fields resolve from existing photo_key.',
        'order':['Update palm-api from the local package using the existing environment variables',
                 'Verify capability, owner isolation and photo replacement on a test account',
                 'Update client, verify package size before upload'],
        'warning':'No functions deployed, no cloud collections created, no business data included.'
    },ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
