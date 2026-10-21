"""Verify local delivery packages against current source without remote access."""
import hashlib
import json
import zipfile
from pathlib import Path

root=Path(__file__).resolve().parents[1]
output=root/'deploy/cloudbase/membership-refine-20261016'
manifest=json.loads((output/'upload-manifest.json').read_text(encoding='utf-8'))
checks=[]
for entry in manifest['bundles']:
    archive_path=output/entry['file']
    assert hashlib.sha256(archive_path.read_bytes()).hexdigest()==entry['sha256']
    with zipfile.ZipFile(archive_path) as archive:
        assert archive.testzip() is None
        names=archive.namelist()
        assert not any('__pycache__' in n or n.endswith('.pyc') or 'project.private' in n for n in names)
        assert not any(n.startswith('/') or '..' in Path(n).parts for n in names)
        source_count=0
        for name in names:
            source=None
            if entry.get('miniProgram'):
                source=root/'miniprogram'/name
            elif entry.get('localOnly'):
                source=root/name
            elif name in entry.get('runtime_sources',{}):
                source=root/('backend' if name.startswith(('palm/','cloudbase_probe/')) else 'deploy/cloudbase/api')/name
            elif entry['file']=='palm-pay-notify.zip':
                source=root/'deploy/cloudbase/pay-notify'/name
            if source:
                actual=archive.read(name);expected=source.read_bytes()
                assert actual.replace(b'\r\n',b'\n')==expected.replace(b'\r\n',b'\n'),name
                source_count+=1
        checks.append({'file':entry['file'],'crc':True,'sha256':True,'matchingSourceFiles':source_count,'bytes':archive_path.stat().st_size})

old=root/'deploy/cloudbase/membership-polish-20261016/catpaw-miniprogram.zip'
new=output/'catpaw-miniprogram.zip'
with zipfile.ZipFile(old) as before,zipfile.ZipFile(new) as after:
    before_size=sum(i.file_size for i in before.infolist());after_size=sum(i.file_size for i in after.infolist())
    new_names=set(after.namelist())-set(before.namelist())
    assert not any(n.endswith('.png') for n in new_names)
    assert after_size<2*1024*1024
    delta=after_size-before_size
    assert 'pages/member-benefits/index.js' in new_names
    assert b'/api/mp/member/bills' not in zipfile.ZipFile(output/'palm-api-membership-refine-python310.zip').read('palm/membership.py')
    assert b'bindtap="info"' not in after.read('pages/membership/index.wxml')
assert (output/'palm-pay-notify.zip').read_bytes()==(old.parent/'palm-pay-notify.zip').read_bytes()
package=json.loads((root/'docs/images/member-refine-20261016/package-results.json').read_text(encoding='utf-8'))
(output/'package-results.json').write_text(json.dumps(package,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
result={'passed':True,'bundles':checks,'frontendUncompressedBefore':before_size,'frontendUncompressedAfter':after_size,
        'frontendNetIncreaseBytes':delta,'newRasterAssets':0,'notificationIdenticalToPreviousRelease':True,
        'remoteWrites':0,'deployed':False,'realPayment':False}
(output/'package-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
