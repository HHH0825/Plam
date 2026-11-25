"""Bounded photo release tools. Keep environment values and signed URLs off disk/output."""
import os
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile
import shutil

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'deploy/cloudbase/photo-compression-20261009'
ENV = 'cloud1-example'
CLI = os.environ.get('PALM_WECHAT_IDE', 'wechatide.cmd')

def native(tool, flags, allow_error=False):
    reply = subprocess.run([CLI, '-c', 'codex', tool, *flags], capture_output=True,
        text=True, encoding='utf8', errors='replace', timeout=90)
    data = json.loads(reply.stdout[reply.stdout.index('{'):])
    result=data.get('result',{})
    waiting=data if data.get('pending') else result if isinstance(result,dict) and result.get('status')=='pending' else {}
    if waiting.get('taskId'):
        OUT.mkdir(parents=True,exist_ok=True)
        safe={'tool':tool,'pending':True,'taskId':waiting['taskId']}
        (OUT/('pending-'+tool+'.json')).write_text(json.dumps(safe),encoding='utf8')
        print(json.dumps(safe));raise SystemExit(2)
    if not data.get('ok'):
        if allow_error: return data
        print(json.dumps({k:data.get(k) for k in ('ok','pending','taskId','errorType','code','tool') if k in data}))
        raise SystemExit(1)
    return data.get('result', {})

def metadata():
    result = native('cloud_fn_info', ['--project', str(ROOT/'miniprogram'), '--env', ENV, '--names', 'palm-api'])
    safe = {'ok': True, 'shape': [], 'configuration': {}}
    def visit(value, location='result'):
        if isinstance(value, dict):
            safe['shape'].append({'path':location,'keys':list(value)})
            if value.get('Key',value.get('key')) == 'PALM_CLOUD_PHOTOS_ENABLED':
                safe['configuration']['photos_enabled'] = str(value.get('Value',value.get('value'))) == '1'
            for key,item in value.items():
                if key.lower() in ('memorysize','timeout','runtime','status','functionname') and isinstance(item,(str,int,bool)):
                    safe['configuration'][key] = item
                if any(part in key.lower() for part in ('environment','variable','secret','token','credential')):
                    # Traverse privately only to locate the photo flag.
                    def flag(node):
                        if isinstance(node,dict):
                            if node.get('Key',node.get('key')) == 'PALM_CLOUD_PHOTOS_ENABLED':
                                safe['configuration']['photos_enabled'] = str(node.get('Value',node.get('value'))) == '1'
                            for child in node.values(): flag(child)
                        elif isinstance(node,list):
                            for child in node: flag(child)
                    flag(item)
                    continue
                if isinstance(item,(dict,list)): visit(item,location+'.'+key)
        elif isinstance(value,list):
            for index,item in enumerate(value): visit(item,location+'.'+str(index))
    visit(result)
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'metadata.json').write_text(json.dumps(safe,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(safe,ensure_ascii=False))

def baseline():
    target=OUT/'baseline'
    target.mkdir(parents=True,exist_ok=True)
    reply=subprocess.run([os.environ.get('PALM_WECHAT_CLI', 'cli.bat'),'cloud','functions','download','--project',str(ROOT/'miniprogram'),
        '--env',ENV,'--name','palm-api','--path',str(target)],capture_output=True,text=True,encoding='utf8',errors='replace',timeout=90)
    files=[p for p in target.rglob('*') if p.is_file()]
    apps=[p for p in files if p.name=='app.py' and (p.parent/'palm/photo.py').is_file()]
    safe={'exit_code':reply.returncode,'files':len(files),'runtime_roots':[str(p.parent.relative_to(OUT)) for p in apps]}
    if len(apps)!=1 or reply.returncode: print(json.dumps(safe));raise SystemExit(1)
    source=apps[0].parent
    safe['runtime_root']=str(source.relative_to(OUT))
    original=ROOT/'deploy/cloudbase/palm-api-python310.zip'
    with zipfile.ZipFile(original) as archive:
        changed=[name for name in archive.namelist() if not name.endswith('/') and
            (not (source/name).is_file() or (source/name).read_bytes()!=archive.read(name))]
        safe['compared_files']=len([name for name in archive.namelist() if not name.endswith('/')]);safe['changed_from_previous_package']=changed
    safe['file_sha256']={p.relative_to(source).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.is_relative_to(source)}
    (OUT/'baseline.json').write_text(json.dumps(safe,indent=2),encoding='utf8')
    print(json.dumps({k:v for k,v in safe.items() if k!='file_sha256'}))

def build():
    source=OUT/'baseline'
    record=json.loads((OUT/'baseline.json').read_text())
    for name,digest in record['file_sha256'].items():
        if hashlib.sha256((source/name).read_bytes()).hexdigest()!=digest: raise RuntimeError('Baseline modified: '+name)
    stage=OUT/'candidate/palm-api'
    stage.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(ROOT/'deploy/cloudbase/palm-api-python310.zip') as original:
        names=[n for n in original.namelist() if not n.endswith('/')]
        for name in names:
            target=stage/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source/name,target)
    shutil.copyfile(ROOT/'backend/palm/photo.py',stage/'palm/photo.py')
    old=(source/'palm/cloud_storage.py').read_text(encoding='utf8')
    start=old.index("    raw = storage().download(ticket['object_id']",old.index('def prepare_commit'))
    head=old[:start]
    tail=old[start:]
    download=tail[:tail.index('    # A declared MIME')]
    body=tail[tail.index('        try:\n',tail.index('    try:\n')):tail.index('    finally:\n')]
    remainder=tail[tail.index('    del raw\n'):]
    new=head+"    if not _processing_slot.acquire(timeout=2):\n        raise CloudBaseError(0, 'PHOTO_PROCESSING_BUSY')\n    try:\n"
    new+="        if ticket['expires_at'] <= int(time.time()): abort(410, description='照片上传凭证已过期，请重新上传')\n"
    new+=''.join('    '+line if line.strip() else line for line in download.splitlines(keepends=True))
    new+='        from PIL import Image, UnidentifiedImageError\n'+body
    new+=''.join('    '+line if line.strip() else line for line in remainder.splitlines(keepends=True))
    new+='    finally:\n        _processing_slot.release()\n'
    (stage/'palm/cloud_storage.py').write_text(new,encoding='utf8',newline='\n')
    changed=[]
    for name in names:
        data=(stage/name).read_bytes()
        if name.endswith('.py'): compile(data,name,'exec')
        if data!=(source/name).read_bytes(): changed.append(name)
    if set(changed)!={'palm/photo.py','palm/cloud_storage.py'}: raise RuntimeError('Unexpected patch surface')
    output=OUT/'palm-api-photo-compression-python310.zip'
    rollback=OUT/'palm-api-before-photo-compression-python310.zip'
    with zipfile.ZipFile(ROOT/'deploy/cloudbase/palm-api-python310.zip') as original:
        for destination,tree in ((output,stage),(rollback,source)):
            with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED) as archive:
                for name in names: archive.writestr(original.getinfo(name), (tree/name).read_bytes())
    safe={'changed_files':changed,'files':len(names),'zip_bytes':output.stat().st_size,
        'zip_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'rollback_sha256':hashlib.sha256(rollback.read_bytes()).hexdigest(),
        'baseline_matches_previous_package':not record['changed_from_previous_package'], 'revision_changes_included':False}
    (OUT/'build.json').write_text(json.dumps(safe,indent=2),encoding='utf8')
    tests=OUT/'candidate-tests'; tests.mkdir(exist_ok=True)
    for name in ('test_photos.py','test_cloud_backend.py','test_cos_photos.py'):
        code=(ROOT/'tests'/name).read_text(encoding='utf8')
        for quote in ("'",'"'):
            code=code.replace("sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "+quote+"backend"+quote+"))",
                'sys.path.insert(0, '+repr(str(stage))+')')
        (tests/name).write_text(code,encoding='utf8')
    print(json.dumps(safe))

def deploy():
    record=OUT/'deploy.json'
    if record.exists() and json.loads(record.read_text()).get('success'):
        print(json.dumps({'already_deployed':True}));return
    stage=OUT/'candidate/palm-api'
    build_record=json.loads((OUT/'build.json').read_text())
    artifact=OUT/'palm-api-photo-compression-python310.zip'
    if hashlib.sha256(artifact.read_bytes()).hexdigest()!=build_record['zip_sha256']:raise RuntimeError('Package changed')
    appid=json.loads((ROOT/'miniprogram/project.config.json').read_text(encoding='utf8'))['appid']
    result=native('cloud_fn_inc_deploy',['--appid',appid,'--env',ENV,'--path',str(stage),'--file','.'])
    safe={'success':result.get('success',False),'status':result.get('status'),'taskId':result.get('taskId'),'env':ENV,'function':'palm-api','candidate_sha256':build_record['zip_sha256'],
        'changed_files':build_record['changed_files'],'configuration_changed':False,'result_keys':list(result)}
    record.write_text(json.dumps(safe,indent=2),encoding='utf8');print(json.dumps(safe))

def verify():
    target=OUT/'readback';target.mkdir(exist_ok=True)
    reply=subprocess.run([os.environ.get('PALM_WECHAT_CLI', 'cli.bat'),'cloud','functions','download','--project',str(ROOT/'miniprogram'),
        '--env',ENV,'--name','palm-api','--path',str(target)],capture_output=True,text=True,encoding='utf8',errors='replace',timeout=90)
    artifact=OUT/'palm-api-photo-compression-python310.zip'
    with zipfile.ZipFile(artifact) as archive:
        names=[n for n in archive.namelist() if not n.endswith('/')]
        changed=[n for n in names if not (target/n).is_file() or (target/n).read_bytes()!=archive.read(n)]
    safe={'exit_code':reply.returncode,'verified_files':len(names),'mismatched_files':changed,'passed':reply.returncode==0 and not changed}
    (OUT/'readback.json').write_text(json.dumps(safe,indent=2),encoding='utf8');print(json.dumps(safe))
    if not safe['passed']:raise SystemExit(1)

def read_live():
    code=(ROOT/'tools/photo-live-result-20261009.js').read_text(encoding='utf8').replace('\n',' ')
    result=native('automation_evaluate',['--project',str(ROOT/'miniprogram'),'--fn-source',code])
    for _ in range(4):
        if isinstance(result,dict) and 'result' in result: result=result['result']
        else: break
    if result.get('objects'):
        if not all(p.startswith('palm/photos/') or p.startswith('palm/staging/'+str(result['user_id'])+'/') for p in result['objects']):
            raise RuntimeError('Unexpected test object scope')
    (OUT/'live.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(result,ensure_ascii=False))

def inspect_cleanup():
    live=json.loads((OUT/'live.json').read_text(encoding='utf8'))
    appid=json.loads((ROOT/'miniprogram/project.config.json').read_text(encoding='utf8'))['appid']
    result=native('cloud_query_storage',['--appid',appid,'--env',ENV,'--action','list','--cloud-path','palm/photos/'],allow_error=True)
    def shape(node):
        if isinstance(node,dict): return {key:shape(value) for key,value in node.items()}
        if isinstance(node,list):return [shape(value) for value in node[:3]]
        if isinstance(node,(bool,int,float)) or node is None:return node
        if isinstance(node,str) and not node.startswith(('https://','http://')):
            if node.startswith('palm/') or len(node)>300:return '[text]'
            return node
        return '[text]'
    print(json.dumps({'result':shape(result)}))

def documents(result):
    # Native read tools may wrap the document array under data/documents/list.
    if isinstance(result,list):
        if all(isinstance(v,dict) and '_id' in v for v in result): return result
        return [doc for value in result for doc in documents(value)]
    if isinstance(result,dict):
        if '_id' in result:return [result]
        return [doc for value in result.values() if isinstance(value,(dict,list)) for doc in documents(value)]
    return []

def cleanup():
    live=json.loads((OUT/'live.json').read_text(encoding='utf8'))
    item_id=live.get('test_item_id');owner=live['user_id']
    if not isinstance(item_id,int) or item_id<=0 or not live.get('purging'):raise RuntimeError('No purging test manifest')
    appid=json.loads((ROOT/'miniprogram/project.config.json').read_text(encoding='utf8'))['appid']
    common=['--appid',appid,'--env',ENV]
    query=OUT/'cleanup-query.json';query.write_text(json.dumps({'_id':str(item_id),'user_id':owner}),encoding='utf8')
    read_flags=common+['--collection-name','palm_items','--query-file',str(query),'--limit','1']
    result=native('cloud_db_read_doc',read_flags)
    rows=documents(result)
    previous_path=OUT/'cleanup.json'
    previous=json.loads(previous_path.read_text(encoding='utf8')) if previous_path.exists() else {}
    previously_scoped=previous.get('scope_verified') is True and previous.get('test_item_id')==item_id
    if len(rows)>1 or (rows and (rows[0].get('name')!=live['test_name'] or not rows[0].get('purging'))) or (not rows and not previously_scoped):
        print(json.dumps({'scope_verified':False,'result_keys':list(result),'matched_documents':len(rows)}));raise SystemExit(1)
    objects=set(live['objects'])
    if rows:
        key=rows[0]['photo_key']
        expected={'palm/photos/'+key,'palm/photos/'+key[:-4]+'.thumb.jpg'}
        if not expected.issubset(objects):raise RuntimeError('Photo object scope mismatch')
    if len(objects)!=3 or not all(obj.startswith('palm/photos/') or obj.startswith('palm/staging/'+str(owner)+'/') for obj in objects):raise RuntimeError('Photo object scope mismatch')
    report={'test_item_id':item_id,'scope_verified':True,'objects_deleted':[],'objects_absent':[],'records':[]}
    def object_present(obj):
        verify=native('cloud_query_storage',common+['--action','list','--cloud-path',obj.rsplit('/',1)[0]+'/'])
        listing=verify.get('data',{});files=listing.get('files',[])
        if verify.get('success') is not True or listing.get('totalCount')!=len(files) or len(files)>=100:
            raise RuntimeError('Storage listing incomplete')
        return any(row.get('Key')==obj for row in files)
    for obj in sorted(objects):
        if object_present(obj):
            result=native('cloud_manage_storage',common+['--action','delete','--cloud-path',obj])
            if not result.get('success'): raise RuntimeError('Delete did not report success')
            report['objects_deleted'].append(obj)
            if object_present(obj):raise RuntimeError('Object absence not verified')
        report['objects_absent'].append(obj)
        (OUT/'cleanup.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    for collection,condition in (
        ('palm_storage_gc',{'user_id':owner,'object_id':{'$in':sorted(objects)}}),
        ('palm_photo_uploads',{'user_id':owner,'item_id':item_id}),
        ('palm_items',{'_id':str(item_id),'user_id':owner,'purging':True})):
        file=OUT/(collection+'-cleanup-query.json');file.write_text(json.dumps(condition),encoding='utf8')
        before=documents(native('cloud_db_read_doc',common+['--collection-name',collection,'--query-file',str(file),'--limit','10']))
        if before:
            native('cloud_db_write_doc',common+['--action','delete','--collection-name',collection,'--query-file',str(file),'--is-multi'])
        remaining=documents(native('cloud_db_read_doc',common+['--collection-name',collection,'--query-file',str(file),'--limit','10']))
        if remaining:raise RuntimeError('Test records still present')
        report['records'].append({'collection':collection,'absence_verified':True})
        (OUT/'cleanup.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    report['passed']=True;(OUT/'cleanup.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report))

def upload():
    record=OUT/'upload.json'
    if record.exists():
        previous=json.loads(record.read_text(encoding='utf8'))
        if previous.get('success') or previous.get('pending'):print(json.dumps(previous));return
    version='2026.10.09.1'
    result=native('upload',['--project',str(ROOT/'miniprogram'),'--upload-version',version,'--desc','照片压缩至200KiB、缩略图30KiB，优化图片处理内存和重试'])
    safe={'success':result.get('success',False),'version':version,'status':result.get('status'),'taskId':result.get('taskId'),
        'experience_version_verified':False,'preview_package_bytes':1874117,
        'source_sha256':{name:hashlib.sha256((ROOT/'miniprogram'/name).read_bytes()).hexdigest() for name in ('utils/photo-edit.js','pages/editor/index.js','project.config.json')}}
    record.write_text(json.dumps(safe,indent=2),encoding='utf8');print(json.dumps(safe))

if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('mode',choices=['metadata','baseline','build','deploy','verify','read-live','inspect-cleanup','cleanup','upload']); args=parser.parse_args()
    if args.mode == 'metadata': metadata()
    elif args.mode == 'baseline': baseline()
    elif args.mode == 'build': build()
    elif args.mode == 'deploy': deploy()
    elif args.mode == 'verify': verify()
    elif args.mode == 'read-live': read_live()
    elif args.mode == 'inspect-cleanup': inspect_cleanup()
    elif args.mode == 'cleanup': cleanup()
    elif args.mode == 'upload': upload()
