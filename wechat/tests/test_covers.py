"""Cover transactions, legacy clients, owner isolation and snapshot consistency."""
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from palm import create_app, initialize_app
from palm.database import get_db
from palm.photo import thumbnail_key
from palm.covers import ICON_KEYS
from test_cloud_backend import MemoryDocuments, MemoryStorage


class CoverCases:
    body = {'name':'测试相机','category':'自己填写的分类','icon_type':'digital','purchase_date':'2026-10-01','purchase_price':'100.00','status':'active','notes':''}
    def call(self, method, path, data=None, revision=None, token=None, key=None):
        self.counter += 1
        headers={'Authorization':'Bearer '+(token or self.token),'Idempotency-Key':key or f'cover-test-{self.counter:018d}'}
        if self.cloud: headers['X-Palm-Bridge']='b'*48
        if revision is not None: headers['If-Match']=f'"{revision}"'
        return self.client.open('/api/mp'+path,method=method,json=data,headers=headers)
    def item(self, **extra):
        r=self.call('POST','/items',{**self.body,**extra});self.assertEqual(r.status_code,201,r.json);return r.json
    def seed_photo(self, item):
        if self.cloud:
            self.db.update('palm_items',item['id'],{'photo_key':'old.jpg','cover_mode':'photo'})
        else:
            self.folder.mkdir(exist_ok=True)
            for key in ('old.jpg',thumbnail_key('old.jpg')): (self.folder/key).write_bytes(b'old photo')
            with self.app.app_context():
                db=get_db();db.execute("UPDATE items SET photo_key='old.jpg',cover_mode='photo' WHERE id=?",(item['id'],));db.commit()
    def test_catalogue_and_capability(self):
        import json
        catalogue=json.loads((Path(__file__).resolve().parents[1]/'branding/beauty-icons-20261018/catalogue.json').read_text(encoding='utf-8'))
        self.assertEqual(ICON_KEYS,{i['key'] for i in catalogue});self.assertEqual(len(catalogue),100)
        self.assertTrue(self.call('GET','/auth/me').json['capabilities']['item_cover_icons'])
        self.assertEqual(self.call('GET','/auth/me').json['capabilities']['item_cover_icons_version'], 3)
    def test_all_fifty_new_ids_save_edit_replay_and_survive_old_client(self):
        import json
        catalogue=json.loads((Path(__file__).resolve().parents[1]/'branding/item-covers-20261018/catalogue.json').read_text(encoding='utf-8'))
        new=[r for r in catalogue if r.get('version') == 2]
        self.assertEqual(len(new), 50)
        item=self.item(cover_mode='icon',cover_icon_key=new[0]['key'])
        for index, row in enumerate(new):
            request_key=f'expanded-icon-replay-{index:04d}'
            revision=item['revision']
            data={**self.body, 'cover_mode':'icon','cover_icon_key':row['key']}
            result=self.call('PUT',f"/items/{item['id']}",data,revision,key=request_key)
            self.assertEqual(result.status_code,200,result.json)
            replay=self.call('PUT',f"/items/{item['id']}",data,revision,key=request_key)
            self.assertEqual(replay.json,result.json)
            item=result.json
            self.assertEqual(item['cover_icon_key'],row['key'])
        old=self.call('PUT',f"/items/{item['id']}",{**self.body,'name':'旧端保留新版封面'},item['revision'])
        self.assertEqual(old.status_code,200,old.json)
        self.assertEqual(old.json['cover_icon_key'],new[-1]['key'])
        report=self.call('GET','/reports/monthly?month=2026-10').json
        self.assertEqual(report['purchases'][0]['cover_icon_key'],new[-1]['key'])
        self.call('DELETE',f"/items/{item['id']}",revision=old.json['revision'])
        trash=self.call('GET','/trash').json[0]
        self.assertEqual(trash['cover_icon_key'],new[-1]['key'])
        restored=self.call('POST',f"/trash/{item['id']}/restore",revision=trash['revision'])
        self.assertEqual(restored.status_code,200,restored.json)
        self.assertEqual(restored.json['cover_icon_key'],new[-1]['key'])
    def test_all_ten_beauty_ids_save_edit_replay_and_survive_old_client(self):
        import json
        catalogue=json.loads((Path(__file__).resolve().parents[1]/'branding/beauty-icons-20261018/catalogue.json').read_text(encoding='utf-8'))
        new=[r for r in catalogue if r.get('version') == 3]
        self.assertEqual(len(new), 10)
        item=self.item(cover_mode='icon',cover_icon_key=new[0]['key'])
        for index, row in enumerate(new):
            request_key=f'beauty-icon-replay-{index:04d}'
            revision=item['revision']
            data={**self.body, 'cover_mode':'icon','cover_icon_key':row['key']}
            result=self.call('PUT',f"/items/{item['id']}",data,revision,key=request_key)
            self.assertEqual(result.status_code,200,result.json)
            replay=self.call('PUT',f"/items/{item['id']}",data,revision,key=request_key)
            self.assertEqual(replay.json,result.json)
            item=result.json
            self.assertEqual(item['cover_icon_key'],row['key'])
        old=self.call('PUT',f"/items/{item['id']}",{**self.body,'name':'旧端保留新版封面'},item['revision'])
        self.assertEqual(old.status_code,200,old.json)
        self.assertEqual(old.json['cover_icon_key'],new[-1]['key'])
        report=self.call('GET','/reports/monthly?month=2026-10').json
        self.assertEqual(report['purchases'][0]['cover_icon_key'],new[-1]['key'])
        self.call('DELETE',f"/items/{item['id']}",revision=old.json['revision'])
        trash=self.call('GET','/trash').json[0]
        self.assertEqual(trash['cover_icon_key'],new[-1]['key'])
        restored=self.call('POST',f"/trash/{item['id']}/restore",revision=trash['revision'])
        self.assertEqual(restored.status_code,200,restored.json)
        self.assertEqual(restored.json['cover_icon_key'],new[-1]['key'])
    def test_create_replay_unknown_icon_and_foreign_owner(self):
        body={**self.body,'cover_mode':'icon','cover_icon_key':'camera'}
        a=self.call('POST','/items',body,key='cover-idempotent-create-001');b=self.call('POST','/items',body,key='cover-idempotent-create-001')
        self.assertEqual(a.json,b.json);self.assertEqual(a.json['category'],self.body['category'])
        self.assertIsNone(a.json['photo_url']);self.assertEqual(a.json['cover_icon_key'],'camera')
        self.assertEqual(self.call('POST','/items',{**body,'cover_icon_key':'https://bad/icon.png'}).status_code,400)
        self.assertEqual(self.call('GET','/items/'+str(a.json['id']),token=self.other).status_code,404)
        self.assertEqual(self.call('PUT','/items/'+str(a.json['id']),body,0,token=self.other).status_code,404)
    def test_photo_replace_replay_and_old_client_preserves_icon(self):
        item=self.item();self.seed_photo(item);url='/items/'+str(item['id'])
        payload={**self.body,'cover_mode':'icon','cover_icon_key':'cup'}
        result=self.call('PUT',url,payload,item['revision'],key='cover-replace-photo-00001')
        self.assertEqual(result.status_code,200,result.json);self.assertEqual(result.json['cover_mode'],'icon');self.assertIsNone(result.json['photo_url'])
        self.assertEqual(result.json['revision'],item['revision']+1)
        self.assertEqual(self.call('PUT',url,payload,item['revision'],key='cover-replace-photo-00001').json,result.json)
        self.assertEqual(self.call('PUT',url,payload,item['revision']).status_code,409)
        if self.cloud: self.assertEqual(len([r for (table,_),r in self.db.rows.items() if table=='palm_storage_gc']),2)
        else: self.assertFalse((self.folder/'old.jpg').exists());self.assertFalse((self.folder/thumbnail_key('old.jpg')).exists())
        old=self.call('PUT',url,{**self.body,'name':'旧客户端改名'},result.json['revision'])
        self.assertEqual(old.status_code,200);self.assertEqual(old.json['cover_icon_key'],'cup');self.assertEqual(old.json['cover_mode'],'icon')
    def test_failed_response_rolls_back_cover_photo_and_version(self):
        item=self.item();self.seed_photo(item);url='/items/'+str(item['id'])
        with patch('palm.routes_items.item_payload',side_effect=RuntimeError('response fault')):
            with self.assertRaises(RuntimeError):self.call('PUT',url,{**self.body,'cover_mode':'icon','cover_icon_key':'camera'},item['revision'])
        actual=self.call('GET',url).json
        self.assertEqual(actual['cover_mode'],'photo');self.assertTrue(actual['photo_url']);self.assertEqual(actual['revision'],item['revision'])
        if self.cloud:self.assertFalse(any(table=='palm_storage_gc' for table,_ in self.db.rows))
        else:self.assertTrue((self.folder/'old.jpg').exists())
    def test_wish_conversion_monthly_trash_and_restore_keep_cover(self):
        wish=self.call('POST','/wishlist',{'name':'相机','category':'摄影','reason':'记录生活'}).json
        converted=self.call('POST',f"/wishlist/{wish['id']}/convert",{**self.body,'cover_mode':'icon','cover_icon_key':'camera'},wish['revision'])
        self.assertEqual(converted.status_code,201,converted.json);item=converted.json
        replay=self.call('POST',f"/wishlist/{wish['id']}/convert",{**self.body,'cover_mode':'icon','cover_icon_key':'camera'},wish['revision'])
        self.assertEqual(replay.json['id'],item['id'])
        report=self.call('GET','/reports/monthly?month=2026-10').json
        self.assertEqual(report['purchases'][0]['cover_icon_key'],'camera')
        self.call('DELETE',f"/items/{item['id']}",revision=item['revision'])
        trash=self.call('GET','/trash').json[0];self.assertEqual(trash['cover_icon_key'],'camera')
        restored=self.call('POST',f"/trash/{item['id']}/restore",revision=trash['revision'])
        self.assertEqual(restored.status_code,200,restored.json)
        self.assertEqual(self.call('GET',f"/items/{item['id']}").json['cover_icon_key'],'camera')


class SQLiteCovers(CoverCases,unittest.TestCase):
    cloud=False
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='palm-covers-');self.addCleanup(self.temp.cleanup);root=Path(self.temp.name);self.folder=root/'photos'
        self.app=initialize_app(create_app({'TESTING':True,'DATABASE':str(root/'db.sqlite3'),'PHOTO_DIR':str(self.folder),'WECHAT_CODE_EXCHANGER':lambda code:'cover-'+code}))
        self.client=self.app.test_client();self.counter=0
        self.token=self.client.post('/api/mp/auth/login',json={'code':'a'}).json['token'];self.other=self.client.post('/api/mp/auth/login',json={'code':'b'}).json['token']
    def test_upload_switches_only_on_success_and_stale_upload_cannot_overwrite_icon(self):
        item=self.item(cover_mode='icon',cover_icon_key='camera');url=f"/items/{item['id']}/photo"
        raw=io.BytesIO();Image.new('RGB',(32,32),'pink').save(raw,'PNG');encoded=raw.getvalue();raw.seek(0)
        uploaded=self.client.post('/api/mp'+url,headers={'Authorization':'Bearer '+self.token,'If-Match':'"0"'},data={'photo':(raw,'photo.png')})
        self.assertEqual(uploaded.status_code,200);self.assertEqual(uploaded.json['cover_mode'],'photo')
        swapped=self.call('PUT',f"/items/{item['id']}",{**self.body,'cover_mode':'icon','cover_icon_key':'tablet'},uploaded.json['revision'])
        stale=self.client.post('/api/mp'+url,headers={'Authorization':'Bearer '+self.token,'If-Match':'"0"'},data={'photo':(io.BytesIO(encoded),'photo.png')})
        self.assertEqual(stale.status_code,409);self.assertEqual(self.call('GET',f"/items/{item['id']}").json['cover_icon_key'],'tablet')
        self.assertFalse(list(self.folder.iterdir()))
    def test_two_devices_cannot_replace_the_same_revision(self):
        from concurrent.futures import ThreadPoolExecutor
        item=self.item();self.seed_photo(item)
        def write(key):
            with self.app.test_client() as client:
                return client.put(f"/api/mp/items/{item['id']}",json={**self.body,'cover_mode':'icon','cover_icon_key':key},headers={'Authorization':'Bearer '+self.token,'If-Match':'"0"','Idempotency-Key':'cover-concurrent-'+key}).status_code
        with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(write,('camera','cup')))
        self.assertEqual(sorted(results),[200,409])
        self.assertEqual(self.call('GET',f"/items/{item['id']}").json['revision'],1)
    def test_sqlite_migration_backups_legacy_rows_without_changing_photos(self):
        import sqlite3
        from palm.schema import SCHEMA
        legacy=Path(self.temp.name)/'legacy.db'
        with sqlite3.connect(legacy) as db:
            db.executescript(SCHEMA.replace('    cover_mode TEXT,\n','').replace('    cover_icon_key TEXT,\n',''))
            db.execute("INSERT INTO items(name,category,purchase_date,purchase_cents,photo_key) VALUES ('旧相机','摄影','2026-01-01',100,'old.jpg')")
        db.close()
        app=initialize_app(create_app({'TESTING':True,'DATABASE':str(legacy),'PHOTO_DIR':str(self.folder)}))
        initialize_app(app)
        with app.app_context():
            row=dict(get_db().execute('SELECT * FROM items').fetchone());self.assertEqual(row['photo_key'],'old.jpg');self.assertIsNone(row['cover_icon_key']);self.assertEqual(get_db().execute('PRAGMA user_version').fetchone()[0],15)
        self.assertTrue(legacy.with_name('legacy.db.pre-covers.bak').exists())


class CloudCovers(CoverCases,unittest.TestCase):
    cloud=True
    def setUp(self):
        self.db=MemoryDocuments();self.app=initialize_app(create_app({'TESTING':True,'STORAGE_BACKEND':'cloudbase','DEV_LOGIN':False,'BRIDGE_SECRET':'b'*48,'CLOUD_PHOTOS_ENABLED':True,'CLOUDBASE_CLIENT':self.db,'CLOUDBASE_STORAGE':MemoryStorage(),'WECHAT_CODE_EXCHANGER':lambda code:'cover-'+code}))
        self.client=self.app.test_client();self.counter=0
        header={'X-Palm-Bridge':'b'*48}
        self.token=self.client.post('/api/mp/auth/login',json={'code':'a'},headers=header).json['token'];self.other=self.client.post('/api/mp/auth/login',json={'code':'b'},headers=header).json['token']
    def test_concurrent_commit_rolls_back_cover_gc_and_receipt_together(self):
        from palm.cloud_client import CloudBaseError
        item=self.item();self.seed_photo(item);finish=self.db.finish_transaction
        def conflict(key,commit=False):
            if commit:self.db.version+=1
            return finish(key,commit)
        with patch.object(self.db,'finish_transaction',side_effect=conflict):
            response=self.call('PUT',f"/items/{item['id']}",{**self.body,'cover_mode':'icon','cover_icon_key':'cup'},item['revision'])
        self.assertEqual(response.status_code,409)
        row=self.db.get('palm_items',item['id']);self.assertEqual(row['photo_key'],'old.jpg');self.assertEqual(row['revision'],0)
        self.assertFalse(any(table=='palm_storage_gc' for table,_ in self.db.rows))


if __name__=='__main__':unittest.main()
