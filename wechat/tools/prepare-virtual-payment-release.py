"""Build manual-upload packages locally; never connect to or modify CloudBase."""
import ast
import argparse
import email
import hashlib
import importlib.util
import json
from pathlib import Path
import stat
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DEPLOY = ROOT / 'deploy/cloudbase'
OUTPUT = DEPLOY / 'virtual-payment-20261015'
RELEASE = 'virtual-payment-20261015'
API_BUNDLE_NAME = 'palm-api-virtual-payment-python310.zip'


def main():
    spec = importlib.util.spec_from_file_location('release_builder', ROOT / 'tools/prepare-purchases-release.py')
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    builder.OUTPUT = OUTPUT
    builder.RELEASE = RELEASE
    sources = [(p, 'palm/' + p.name) for p in sorted((ROOT / 'backend/palm').glob('*.py'))]
    sources += [(ROOT / 'backend/cloudbase_probe' / n, 'cloudbase_probe/' + n) for n in ('__init__.py', 'client.py')]
    sources += [(DEPLOY / 'api' / n, n) for n in ('app.py', 'scf_bootstrap', 'requirements.txt')]
    for path, member in sources:
        if member.endswith('.py'):
            ast.parse(path.read_text(encoding='utf-8'), filename=member, feature_version=(3, 10))
    baseline = DEPLOY / 'photo-compression-20261009/palm-api-photo-compression-python310.zip'
    with zipfile.ZipFile(baseline) as archive:
        installed = {}
        for name in archive.namelist():
            if name.startswith('third_party/') and name.endswith('.dist-info/METADATA'):
                metadata = email.message_from_bytes(archive.read(name))
                installed[metadata['Name'].lower().replace('_', '-')] = metadata['Version']
    for line in (DEPLOY / 'api/requirements.txt').read_text().splitlines():
        if line.strip() and not line.startswith('#'):
            name, version = line.split('==')
            assert installed.get(name.lower().replace('_', '-')) == version, name
    report = builder.build(API_BUNDLE_NAME, baseline, 'third_party/', sources)
    target = OUTPUT / 'palm-pay-notify.zip'
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in ('index.js', 'package.json'):
            info = zipfile.ZipInfo(name)
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            archive.writestr(info, (DEPLOY / 'pay-notify' / name).read_bytes().replace(b'\r\n', b'\n'))
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == {'index.js', 'package.json'}
    notification = {'file': target.name, 'bytes': target.stat().st_size,
                    'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}
    target.with_suffix('.zip.sha256').write_text(f"{notification['sha256']}  {target.name}\n", encoding='utf-8')
    (OUTPUT / 'upload-manifest.json').write_text(json.dumps({
        'release': builder.RELEASE, 'applied': False, 'remoteWrites': 0,
        'bundles': [report, notification], 'python310SyntaxVerified': True,
        'dependencyVersionsVerified': installed, 'linuxRuntimeNotExecutedLocally': True
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    base = json.loads((DEPLOY / 'resources.json').read_text(encoding='utf-8'))
    collections = {name: {'name': name, 'permission': 'ADMINONLY', 'indexes': []}
                   for name in base['collections']}
    for name, indexes in base['indexes'].items():
        for index, fields in enumerate(indexes):
            collections[name]['indexes'].append({'name': base['indexes_console_verified']['names'][name][index],
                'unique': False, 'fields': [{'name': field, 'direction': 1} for field in fields]})
    for release in ('purchases-20261010', 'storage-locations-20261011', 'cash-ledger-20261013',
                    'membership-20261015', 'virtual-payment-20261015'):
        delta = json.loads((DEPLOY / release / 'resources-delta.json').read_text(encoding='utf-8'))
        for item in delta.get('collections', []) + delta.get('create_collections', []):
            entry = collections.setdefault(item['name'], {'name': item['name'], 'permission': 'ADMINONLY', 'indexes': []})
            for index, original in enumerate(item.get('indexes', [])):
                if isinstance(original, list):
                    normalized = {'name': 'owner_id' if index == 0 else 'owner_item_id', 'unique': False,
                                  'fields': [{'name': field, 'direction': 1} for field in original]}
                else:
                    normalized = {'name': original['name'], 'unique': False,
                                  'fields': [{'name': field.get('name', field.get('field')), 'direction': 1}
                                             for field in original['fields']]}
                entry['indexes'].append(normalized)
        for index in delta.get('add_indexes', []):
            collections[index['collection']]['indexes'].append({'name': index['name'], 'unique': False,
                'fields': [{'name': field['field'], 'direction': 1} for field in index['fields']]})
    prerequisites = {'applied': False, 'environment': base['environment'],
        'databaseInstance': '(default)', 'databaseName': '(default)',
        'instructions': 'Create only missing collections/indexes. Preserve all existing data. Never replace an existing collection.',
        'collections': list(collections.values())}
    (OUTPUT / 'database-prerequisites.json').write_text(json.dumps(prerequisites, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (OUTPUT / 'timer-config.json').write_text(json.dumps({'triggers': [{
        'name': 'palm-pay-reconcile', 'type': 'timer', 'config': '0 */5 * * * * *'
    }]}, indent=2) + '\n', encoding='utf-8')
    if RELEASE in ('membership-dual-platform-20261016', 'membership-polish-20261016', 'membership-refine-20261016'):
        admin = OUTPUT / 'palm-member-maintainer-windows.zip'
        with zipfile.ZipFile(admin, 'w', zipfile.ZIP_DEFLATED) as archive:
            for folder in (ROOT / 'backend/palm', ROOT / 'backend/cloudbase_probe'):
                for source in sorted(folder.glob('*.py')):
                    archive.write(source, source.relative_to(ROOT).as_posix())
            for source in sorted((ROOT / 'tools/member_admin').rglob('*')):
                if source.is_file() and '__pycache__' not in source.parts:
                    archive.write(source, source.relative_to(ROOT).as_posix())
            archive.write(ROOT / 'requirements-lock.txt', 'requirements-lock.txt')
        digest = hashlib.sha256(admin.read_bytes()).hexdigest()
        admin.with_suffix('.zip.sha256').write_text(f'{digest}  {admin.name}\n', encoding='utf-8')
        manifest = json.loads((OUTPUT / 'upload-manifest.json').read_text(encoding='utf-8'))
        manifest['bundles'].append({'file':admin.name,'bytes':admin.stat().st_size,'sha256':digest,'localOnly':True})
        frontend = OUTPUT / 'catpaw-miniprogram.zip'
        project = ROOT / 'miniprogram'
        config = json.loads((project / 'project.config.json').read_text(encoding='utf-8'))
        def ignored(name):
            return any(rule['type'] == 'suffix' and name.endswith(rule['value'])
                       or rule['type'] == 'folder' and name.startswith(rule['value'] + '/')
                       or rule['type'] == 'file' and name == rule['value']
                       for rule in config.get('packOptions', {}).get('ignore', []))
        with zipfile.ZipFile(frontend, 'w', zipfile.ZIP_DEFLATED) as archive:
            for source in sorted(project.rglob('*')):
                name = source.relative_to(project).as_posix()
                if (source.is_file() and not ignored(name) and not source.name.startswith('project.private')
                        and not set(source.parts).intersection({'node_modules', '.git', '__pycache__'})):
                    archive.write(source, name)
        digest = hashlib.sha256(frontend.read_bytes()).hexdigest()
        frontend.with_suffix('.zip.sha256').write_text(f'{digest}  {frontend.name}\n', encoding='utf-8')
        manifest['bundles'].append({'file':frontend.name,'bytes':frontend.stat().st_size,'sha256':digest,'miniProgram':True})
        manifest.update(publicCheckoutApproved=False, coldStartThreeSecondCloudVerified=False,
                        manual='Keep checkout closed or server-whitelisted until both devices and cloud retries pass.')
        (OUTPUT / 'upload-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        env = json.loads((DEPLOY / 'api/env.example.json').read_text(encoding='utf-8'))
        (OUTPUT / 'palm-api-env.example.json').write_text(json.dumps(env,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        (OUTPUT / 'resources-delta.json').write_text(json.dumps({'create_collections':[], 'add_indexes':[],
            'reuse':['palm_member_documents owner_kind_id(user_id,kind,_id)','palm_pay_orders owner_id(user_id,_id)',
                     'palm_pay_orders due_id(next_query_at,_id)'], 'permission':'ADMINONLY',
            'functions':[{'name':'palm-pay-notify','timeout_seconds':3,'maxBatch':1,'totalDeadlineSeconds':2.5,'backendBudgetSeconds':2}],
            'migration':'Per-account transactional baseline validation on first grant/payment/refund; never delete existing records.'},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        guide = {'membership-polish-20261016':'member-polish-manual-20261016.md','membership-refine-20261016':'member-refine-manual-20261016.md'}.get(RELEASE,'member-release-manual-20261016.md')
        (OUTPUT / '操作说明.md').write_bytes((ROOT / 'docs' / guide).read_bytes())
    print(json.dumps({'bundles': [{k: r[k] for k in ('file', 'bytes', 'sha256')} for r in (report, notification)],
                      'remoteWrites': 0, 'sourceFiles': len(sources), 'dependencyVersionsVerified': len(installed)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--small-payment-test', action='store_true', help='Write a separate, default-off small-payment candidate')
    parser.add_argument('--payment-diagnostics', action='store_true', help='Write a separate payment-diagnostics candidate')
    parser.add_argument('--payment-error-detail', action='store_true', help='Include redacted provider error detail in a separate candidate')
    parser.add_argument('--test-payment-recovery', action='store_true', help='Write controlled test-order recovery and native-payment diagnostics')
    parser.add_argument('--dual-platform', action='store_true', help='Build member-maintainer and dual-platform candidate; never deploy')
    parser.add_argument('--member-polish', action='store_true', help='Build member appearance and purchase-ownership update; never deploy')
    parser.add_argument('--member-refine', action='store_true', help='Build retired-calendar and redesigned member-tools candidate; never deploy')
    args = parser.parse_args()
    if sum((args.small_payment_test, args.payment_diagnostics, args.payment_error_detail, args.test_payment_recovery, args.dual_platform, args.member_polish, args.member_refine)) > 1:
        parser.error('Choose only one release variant')
    if args.small_payment_test:
        RELEASE = 'virtual-payment-small-test-20261015'
        OUTPUT = DEPLOY / RELEASE
        API_BUNDLE_NAME = 'palm-api-small-test-python310.zip'
    if args.payment_diagnostics:
        RELEASE = 'virtual-payment-diagnostics-20261015'
        OUTPUT = DEPLOY / RELEASE
        API_BUNDLE_NAME = 'palm-api-payment-diagnostics-python310.zip'
    if args.payment_error_detail:
        RELEASE = 'virtual-payment-error-detail-20261015'
        OUTPUT = DEPLOY / RELEASE
        API_BUNDLE_NAME = 'palm-api-payment-error-detail-python310.zip'
    if args.test_payment_recovery:
        RELEASE = 'virtual-payment-test-recovery-20261015'
        OUTPUT = DEPLOY / RELEASE
        API_BUNDLE_NAME = 'palm-api-test-recovery-python310.zip'
    if args.dual_platform:
        RELEASE = 'membership-dual-platform-20261016'
        OUTPUT = DEPLOY / RELEASE
        API_BUNDLE_NAME = 'palm-api-membership-dual-platform-python310.zip'
    if args.member_polish:
        RELEASE = 'membership-polish-20261016'
        OUTPUT = DEPLOY / RELEASE
        API_BUNDLE_NAME = 'palm-api-membership-polish-python310.zip'
    if args.member_refine:
        RELEASE = 'membership-refine-20261016'
        OUTPUT = DEPLOY / RELEASE
        API_BUNDLE_NAME = 'palm-api-membership-refine-python310.zip'
    main()
