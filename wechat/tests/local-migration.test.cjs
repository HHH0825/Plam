const {test}=require('node:test'),assert=require('node:assert/strict')
const {Store}=require('../miniprogram/local-core/store')
const {FIELDS}=require('../miniprogram/pages/local-data/lib/snapshot')
const {Migration,hash,canonical,photoName}=require('../miniprogram/pages/local-data/lib/cloud-migration')
const {utf8,sha256}=require('../miniprogram/local-core/integrity')
function filesystem(){const dirs=new Map();return (_wx,folder)=>{if(!dirs.has(folder))dirs.set(folder,new Map());const data=dirs.get(folder);return {data,async mkdir(){},async read(n){return data.get(n)?.slice()||null},async write(n,b){data.set(n,b.slice())},async append(n,b){const before=data.get(n)||new Uint8Array();const next=new Uint8Array(before.length+b.length);next.set(before);next.set(b,before.length);data.set(n,next)},async rename(a,b){if(!data.has(a))throw Error('missing');data.set(b,data.get(a));data.delete(a)},async size(n){return data.get(n).length},async readRange(n,p,len){return data.get(n).slice(p,p+len)},async list(){return [...data.keys()]},path(n){return folder+'/'+n}}}}
async function harness({photo=false,previous=false}={}){
 const files=filesystem(),controlIO=files(null,'control'),control=await new Store(controlIO).open(),app={globalData:{token:'cloud-session',user:{id:7,username:'样例用户'}}},calls=[],rawPhoto=new Uint8Array(53001).fill(97)
 const tables=Object.fromEntries(Object.keys(FIELDS).map(k=>[k,[]]));tables.settings=[{id:'current',user:{id:7,username:'样例用户',avatar_key:'sprout'},created_at:'2026-10-01T00:00:00Z',ledger_enabled:true,appearance:{theme:'default',template:'default',revision:0},checkins:[],visits:[]}]
 tables.items=[{id:1,revision:0,name:'相机',purchase_date:'2026-10-01',purchase_cents:600000,status:'active',photo_key:photo?'a'.repeat(32)+'.jpg':null,thumb_key:photo?'a'.repeat(32)+'.jpg':null}]
 const pages=Object.entries(tables).filter(([,r])=>r.length).map(([table,rows])=>({table,rows}))
 const manifest={id:'b'.repeat(32),format:'catpaw-cloud-migration',version:1,account:tables.settings[0].user,data_hash:hash(tables),cloud_version:0,counts:Object.fromEntries(Object.entries(tables).map(([k,r])=>[k,r.length])),pages:pages.map((p,index)=>({index,table:p.table,count:p.rows.length,hash:hash(p)})),photos:photo?[{index:0,name:photoName(tables.items[0].photo_key),ready:false}]:[]}
 let mode='cloud',confirmation=null,serial=0,loseConfirmation=false,interruptOffset=null,mutatePage=false,cloudVersion=0,activations=0,failActivation=false,switchOwner=false
 const wxApi={base64ToArrayBuffer(value){const b=Buffer.from(value,'base64');return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}}
 if(previous){const old=await new Store(files(null,'old-data')).open();await old.transaction(tx=>tx.set('settings',tables.settings));await control.transaction(tx=>tx.set('active',[{id:'active',folder:'old-data'}]))}
 const api={async request(path,options={}){
  calls.push(path)
  if(path==='/auth/me')return {capabilities:{local_migration:1}}
  if(path.startsWith('/local-migration/status'))return {mode,version:cloudVersion,confirmation,snapshot:manifest}
  if(path==='/local-migration/snapshots')return manifest
  if(path.includes('/pages/')){const index=Number(path.split('/').pop());if(switchOwner){switchOwner=false;app.globalData={token:'another',user:{id:8}}}return mutatePage?{...pages[index],rows:[]}:pages[index]}
  if(path.endsWith('/prepare'))return {...manifest.photos[0],ready:true,size:rawPhoto.length,hash:sha256(rawPhoto)}
  if(path.includes('/photos/')){const offset=Number(path.split('offset=')[1]);if(interruptOffset===offset){interruptOffset=null;throw Error('模拟断网')}const end=Math.min(offset+24576,rawPhoto.length);return {offset,next_offset:end===rawPhoto.length?null:end,data:Buffer.from(rawPhoto.slice(offset,end)).toString('base64')}}
  if(path.endsWith('/confirm')){if(cloudVersion!==manifest.cloud_version)throw Error('云端已变化');mode='local';confirmation={id:'receipt-1',snapshot_id:manifest.id,data_hash:manifest.data_hash};if(loseConfirmation){loseConfirmation=false;throw Error('回执丢失')}return {mode,confirmation}}
  throw Error('unexpected '+path)
 }}
 const rt={nonce:()=>String(++serial),openControl:async()=>({control,controlIO}),async activateMigration(folder,options){activations++;if(failActivation){failActivation=false;throw Error('模拟本机切换失败')}await control.transaction(tx=>tx.set('active',[{id:'active',folder,migration:options.receipt}]));app.globalData.localMode=true;return {folder}}}
 const deps={runtime:rt,api,files,Store,app:()=>app,wx:()=>wxApi},client=new Migration(deps)
 const save=async file=>control.transaction(async tx=>{const rows=await tx.get('backups');rows.find(x=>x.id===file.id).external=true;tx.set('backups',rows)})
 return {client,deps,files,control,app,calls,manifest,save,set lose(v){loseConfirmation=v},set offline(v){interruptOffset=v},set badPage(v){mutatePage=v},set change(v){cloudVersion=v},set switchOwner(v){switchOwner=v},set failActivation(v){failActivation=v},get activations(){return activations}}
}
test('canonical cloud hashes match Python sorted unicode JSON',()=>{assert.equal(canonical({z:'猫 🐈',a:[{b:true,a:null}],金额:6000}),'{"a":[{"a":null,"b":true}],"z":"猫 🐈","金额":6000}');assert.throws(()=>canonical({n:Infinity}),/无效/);assert.equal(hash({z:2,a:1}),sha256('{"a":1,"z":2}'))})
test('cloud candidate and external backup precede confirmation; lost receipt is queried',async()=>{
 const h=await harness({photo:true});await h.client.begin();assert.equal((await h.control.table('active')).length,0,'cloud opening never replaces account with empty local data')
 const prepared=await h.client.download();assert.equal(prepared.phase,'prepared');assert.equal((await h.control.table('active')).length,0)
 await assert.rejects(h.client.confirm(),/明确确认/);await assert.rejects(h.client.confirm({confirmed:true}),/保存到/)
 const backup=await h.client.backup();assert.ok(backup.photos===1);assert.ok(!JSON.stringify(backup).includes('cloud-session'));await assert.rejects(h.client.confirm({confirmed:true}),/保存到/)
 await h.save(backup);h.lose=true;await h.client.confirm({confirmed:true});assert.equal(h.activations,1);assert.equal(h.calls.filter(p=>p.endsWith('/confirm')).length,1);assert.equal(h.app.globalData.localMode,true)
})
test('photo transfer resumes using persisted size after interruption and client restart',async()=>{
 const h=await harness({photo:true});await h.client.begin();h.offline=24576;await assert.rejects(h.client.download(),/断网/)
 const state=(await h.control.table('cloud_migrations'))[0],io=h.files(null,state.folder);assert.equal(await io.size('photos/'+h.manifest.photos[0].name),24576)
 const before=h.calls.filter(p=>p.includes('/pages/')).length,restarted=new Migration(h.deps);await restarted.download()
 assert.equal(h.calls.filter(p=>p.includes('/pages/')).length,before,'verified page files reused');assert.equal(h.calls.filter(p=>p.includes('offset=0')).length,1,'first photo chunk not downloaded twice');assert.equal(h.activations,0)
})
test('corrupt page, changed cloud version and account switch never publish local data',async()=>{
 for(const failure of ['badPage','change','switchOwner']){const h=await harness();await h.client.begin();h[failure]=failure==='change'?1:true;await assert.rejects(h.client.download(),/校验|变化|切换/);assert.equal((await h.control.table('active')).length,0);assert.equal(h.calls.filter(p=>p.endsWith('/confirm')).length,0)}
})
test('confirmed cloud receipt survives local activation failure and is reused on retry',async()=>{
 const h=await harness();await h.client.begin();await h.client.download();await h.save(await h.client.backup());h.failActivation=true
 await assert.rejects(h.client.confirm({confirmed:true}),/切换失败/);assert.equal((await h.control.table('cloud_migrations'))[0].phase,'confirmed')
 await new Migration(h.deps).confirm({confirmed:true});assert.equal(h.calls.filter(p=>p.endsWith('/confirm')).length,1);assert.equal(h.activations,2)
})
test('existing local data needs a separate externally confirmed backup',async()=>{
 const h=await harness({previous:true});await h.client.begin();await h.client.download();await h.save(await h.client.backup());await assert.rejects(h.client.confirm({confirmed:true}),/本机原有/)
 const previous=await h.client.backupPrevious();await h.save(previous);await h.client.confirm({confirmed:true});assert.equal((await h.control.table('active'))[0].folder.startsWith('catpaw-data-'),true)
})
test('cancelled download leaves original data and a resumable candidate',async()=>{
 const h=await harness({photo:true});await h.client.begin();await assert.rejects(h.client.download(()=>h.client.cancel()),/暂停/);assert.equal((await h.control.table('active')).length,0);await h.client.download();assert.equal((await h.control.table('cloud_migrations'))[0].phase,'prepared')
})
test('a damaged prepared candidate can be rebuilt from the same immutable snapshot',async()=>{const h=await harness({photo:true});await h.client.begin();const first=await h.client.download(),io=h.files(null,first.folder);io.data.set('photos/'+h.manifest.photos[0].name,new Uint8Array([0]));await assert.rejects(h.client.backup(),/照片/);const second=await h.client.download(()=>{},{rebuild:true});assert.notEqual(second.folder,first.folder);assert.equal(second.manifest.id,first.manifest.id);assert.equal(second.phase,'prepared');assert.deepEqual([...io.data.get('photos/'+h.manifest.photos[0].name)],[0],'old candidate evidence is retained');assert.equal(h.calls.filter(p=>p.endsWith('/confirm')).length,0)})
