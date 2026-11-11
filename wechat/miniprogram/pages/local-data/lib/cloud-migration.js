'use strict'
// This module belongs to the transition subpackage. It never opens an empty
// local dataset for a cloud account, and never confirms migration automatically.
const runtime = require('../../../local-core/runtime')
const {createFiles} = require('../../../local-core/wx-files')
const {Store} = require('../../../local-core/store')
const {utf8, decode, sha256} = require('../../../local-core/integrity')
const {FIELDS, sanitize, validate} = require('./snapshot')
const manager = require('./data-manager')
const PREFIX = '/local-migration'
const canonical = value => {
 if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
 if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}'
 if (typeof value === 'number' && !Number.isSafeInteger(value)) throw Error('迁移资料含无效数值')
 return JSON.stringify(value)
}
const hash = value => sha256(canonical(value))
const photoName = key => 'photo-' + sha256(key).slice(0,32) + '.jpg'
function checkManifest(m, account) {
 if (!m || m.format !== 'catpaw-cloud-migration' || m.version !== 1 || !/^[a-f0-9]{32}$/.test(m.id) || m.account?.id !== account || !/^[a-f0-9]{64}$/.test(m.data_hash)) throw Error('迁移快照版本或来源账户不匹配')
 if (!Array.isArray(m.pages) || !Array.isArray(m.photos) || !m.counts || m.pages.length > 60000 || m.photos.length > 60000) throw Error('迁移清单格式无效')
 for (const name of Object.keys(FIELDS)) if (!Number.isSafeInteger(m.counts[name]) || m.counts[name] < 0) throw Error('迁移资料数量无效')
 const counts = Object.fromEntries(Object.keys(FIELDS).map(k=>[k,0])), photos = new Set()
 m.pages.forEach((p,i)=>{
  if (p.index !== i || !FIELDS[p.table] || !Number.isSafeInteger(p.count) || p.count < 1 || p.count > 100 || !/^[a-f0-9]{64}$/.test(p.hash)) throw Error('迁移分片清单无效')
  counts[p.table] += p.count
 })
 for (const name of Object.keys(FIELDS)) if (counts[name] !== m.counts[name]) throw Error('迁移分片数量不一致')
 m.photos.forEach((p,i)=>{
  if (p.index !== i || !/^photo-[a-f0-9]{32}\.jpg$/.test(p.name) || photos.has(p.name)) throw Error('迁移照片清单无效')
  photos.add(p.name)
 })
 if (m.counts.settings !== 1) throw Error('迁移账户设置缺失')
 return m
}

class Migration {
 constructor(deps={}) {
  this.runtime=deps.runtime||runtime;this.manager=deps.manager||manager;this.files=deps.files||createFiles;this.Store=deps.Store||Store
  this.app=deps.app||(()=>getApp());this.wx=deps.wx||(()=>wx);this.api=deps.api||require('../../../utils/api');this.epoch=0;this.busy=false
 }
 cancel(){this.epoch++;this.task?.cancel?.()}
 async run(fn) {
  if(this.busy)throw Error('迁移操作进行中，请稍候')
  const app=this.app(),owner={id:app.globalData.user?.id,token:app.globalData.token},epoch=this.epoch
  if(!owner.id||!owner.token||app.globalData.localMode)throw Error('请先连接原云端账户')
  this.busy=true;app._migrationDownloading=true;clearTimeout(app._visitTimer)
  const check=()=>{if(epoch!==this.epoch||this.app().globalData.token!==owner.token||this.app().globalData.user?.id!==owner.id)throw Error('迁移已暂停或账户已切换，已下载资料保留')}
  try {
   const context=await this.runtime.openControl(this.wx());check()
   const request=async(path,options={})=>{check();this.task=this.api.request(PREFIX+path,options);const result=await this.task;check();return result}
   return await fn({...context,owner,check,request})
  } finally {this.busy=false;this.task=null;app._migrationDownloading=false}
 }
 async state(c){return(await c.control.table('cloud_migrations')).find(x=>x.id===String(c.owner.id))||null}
 async save(c,state){c.check();await c.control.transaction(async tx=>{const rows=await tx.get('cloud_migrations'),at=rows.findIndex(x=>x.id===String(c.owner.id));const next={...state,id:String(c.owner.id),updatedAt:Date.now()};if(at<0)rows.push(next);else rows[at]=next;tx.set('cloud_migrations',rows)});c.check();return state}
 async status(){return this.run(async c=>{const state=await this.state(c);try{return {state,remote:await c.request('/status'+(state?'?snapshot_id='+state.manifest.id:''))}}catch(error){if(state&&[404,410].includes(error.status))return {state,remote:{mode:'cloud',expired:true,error:'迁移快照已过期或不可用，请重新创建。云端原资料未改变。'}};throw error}})}
 async begin({replace=false}={}) {return this.run(async c=>{
  const old=await this.state(c)
  if(old&&!replace)return old
  const identity=await this.api.request('/auth/me');c.check()
  if(identity.capabilities?.local_migration!==1)throw Error('云端尚未支持完整迁移，请先同步过渡版后端；当前资料未改变')
  const remote=await c.request('/status')
  if(remote.mode==='local'&&old) return old
  const manifest=checkManifest(remote.mode==='local'?remote.snapshot:await c.request('/snapshots',{method:'POST',data:{}}),c.owner.id)
  const active=(await c.control.table('active'))[0],previousFolder=active?.folder||null
  let previousGeneration=null
  if(active){const previous=await new this.Store(this.files(this.wx(),active.folder)).open();await previous.verify();previousGeneration=previous.head.generation}
  const state={manifest,folder:'catpaw-data-'+this.runtime.nonce(),transfer:'transfer-'+manifest.id,phase:'downloading',previousFolder,previousGeneration,startedAt:Date.now()}
  // Persist the candidate location before touching its files. A restart resumes
  // this exact candidate rather than creating another database.
  await this.save(c,state);return state
 })}
 async candidate(c,state){
  const io=this.files(this.wx(),state.folder),store=await new this.Store(io).open()
  if(store.head.generation===0)await store.transaction(tx=>tx.set('settings',[]))
  await io.mkdir('photos');c.check();return {io,store,control:c.control,folder:state.folder}
 }
 async download(progress=()=>{},{rebuild=false}={}) {return this.run(async c=>{
  const state=await this.state(c);if(!state)throw Error('请先创建迁移快照')
  const remote=await c.request('/status?snapshot_id='+state.manifest.id),m=checkManifest(remote.snapshot,c.owner.id)
  if(m.data_hash!==state.manifest.data_hash)throw Error('迁移快照内容已变化')
  if(remote.mode!=='local'&&remote.version!==m.cloud_version)throw Error('云端资料已有变化，请重新创建快照；原资料未改变')
  if(rebuild){state.folder='catpaw-data-'+this.runtime.nonce();state.phase='downloading';delete state.generation;delete state.candidateHash;delete state.backupId;await this.save(c,state)}
  if(state.phase==='prepared'||state.phase==='confirmed') {await this.verifyCandidate(c,state);return state}
  await c.controlIO.mkdir(state.transfer)
  const candidate=await this.candidate(c,state),tables=Object.fromEntries(Object.keys(FIELDS).map(k=>[k,[]])),base='/snapshots/'+m.id
  for(const descriptor of m.pages){
   c.check();const name=state.transfer+'/page-'+descriptor.index+'.json';let raw=await c.controlIO.read(name),page
   if(raw)try{const parsed=JSON.parse(decode(raw));if(hash(parsed)===descriptor.hash)page=parsed}catch(_){}
   if(!page){page=await c.request(base+'/pages/'+descriptor.index);if(hash(page)!==descriptor.hash)throw Error('迁移资料分片校验失败，请重试');await c.controlIO.write(name,utf8(JSON.stringify(page)))}
   if(page.table!==descriptor.table||!Array.isArray(page.rows)||page.rows.length!==descriptor.count)throw Error('迁移分片内容与清单不一致')
   tables[page.table].push(...page.rows);progress({label:'核对资料',done:descriptor.index+1,total:m.pages.length});c.check()
  }
  if(hash(tables)!==m.data_hash)throw Error('云端完整资料校验失败，不能切换')
  const references=new Set(tables.items.flatMap(i=>[i.photo_key,i.thumb_key]).filter(Boolean).map(photoName))
  if(references.size!==m.photos.length||m.photos.some(p=>!references.has(p.name)))throw Error('云端照片与资料引用不一致')
  for(const original of m.photos){
   c.check();const p=await c.request(base+'/photos/'+original.index+'/prepare',{method:'POST',data:{}})
   if(p.name!==original.name||p.index!==original.index||!Number.isSafeInteger(p.size)||p.size<1||p.size>5*1048576||!/^[a-f0-9]{64}$/.test(p.hash))throw Error('云端照片清单无效')
   const name='photos/'+p.name;let bytes=await candidate.io.read(name),offset=bytes?.length||0
   if(offset>p.size||offset===p.size&&sha256(bytes)!==p.hash){await candidate.io.remove(name);offset=0}
   while(offset<p.size){
    const part=await c.request(base+'/photos/'+p.index+'?offset='+offset)
    const chunk=new Uint8Array(this.wx().base64ToArrayBuffer(part.data)),next=offset+chunk.length
    if(part.offset!==offset||chunk.length<1||chunk.length>24576||next>p.size||part.next_offset!==(next===p.size?null:next))throw Error('照片下载分段校验失败')
    if(offset)await candidate.io.append(name,chunk);else await candidate.io.write(name,chunk)
    offset=next;progress({label:'下载照片 '+(p.index+1)+'／'+m.photos.length,done:offset,total:p.size});c.check()
   }
   bytes=await candidate.io.read(name);if(!bytes||sha256(bytes)!==p.hash)throw Error('照片完整校验失败，请重试')
  }
  const normalized={}
  for(const name of Object.keys(FIELDS))normalized[name]=sanitize(name,tables[name])
  for(const item of normalized.items){if(item.photo_key)item.photo_key=photoName(item.photo_key);if(item.thumb_key)item.thumb_key=photoName(item.thumb_key)}
  validate(normalized)
  await candidate.store.transaction(tx=>{for(const [name,rows]of Object.entries(normalized))tx.set(name,rows)})
  await candidate.store.verify();c.check()
  state.phase='prepared';state.generation=candidate.store.head.generation;state.candidateHash=hash(normalized);state.manifest=m
  // Keep prepared image hashes for every later backup/confirmation check.
  state.photos=[];for(const p of m.photos){const raw=await candidate.io.read('photos/'+p.name);state.photos.push({name:p.name,hash:sha256(raw),size:raw.length})}
  await this.save(c,state);return state
 })}
 async verifyCandidate(c,state){
  if(!['prepared','confirmed'].includes(state.phase))throw Error('迁移资料尚未下载核对完成')
  const candidate=await this.candidate(c,state);await candidate.store.verify();c.check()
  const tables={};for(const name of Object.keys(FIELDS))tables[name]=await candidate.store.table(name)
  validate(tables)
  if(candidate.store.head.generation!==state.generation||hash(tables)!==state.candidateHash)throw Error('本机迁移候选资料已变化，请重新下载核对')
  for(const p of state.photos){const raw=await candidate.io.read('photos/'+p.name);if(!raw||raw.length!==p.size||sha256(raw)!==p.hash)throw Error('本机迁移照片缺失或损坏，请重新下载核对');c.check()}
  return candidate
 }
 async backup(){return this.run(async c=>{const state=await this.state(c);if(!state)throw Error('迁移记录不存在');const candidate=await this.verifyCandidate(c,state),file=await this.manager.exportData(candidate);c.check();state.backupId=file.id;await this.save(c,state);return file})}
 async backupPrevious(){return this.run(async c=>{const state=await this.state(c);if(!state?.previousFolder)throw Error('本机没有需要替换的原资料');const io=this.files(this.wx(),state.previousFolder),store=await new this.Store(io).open();await store.verify();const file=await this.manager.exportData({io,store,control:c.control,folder:state.previousFolder});state.previousGeneration=store.head.generation;state.previousBackupId=file.id;await this.save(c,state);return file})}
 async confirm({confirmed=false}={}) {return this.run(async c=>{
  if(!confirmed)throw Error('请明确确认后再切换到本机模式')
  const state=await this.state(c);if(!state)throw Error('迁移记录不存在')
  await this.verifyCandidate(c,state)
  const backups=await c.control.table('backups'),saved=backups.find(b=>b.id===state.backupId&&b.external&&b.folder===state.folder&&b.generation===state.generation)
  if(!saved)throw Error('请先生成迁移完整备份并确认已保存到小程序之外')
  if(state.previousFolder){
   const previous=await new this.Store(this.files(this.wx(),state.previousFolder)).open();await previous.verify()
   if(previous.head.generation!==state.previousGeneration||!backups.some(b=>b.id===state.previousBackupId&&b.external&&b.folder===state.previousFolder&&b.generation===state.previousGeneration))throw Error('请先备份本机原有资料并确认已保存到外部')
  }
  const active=(await c.control.table('active'))[0]
  if((active?.folder||null)!==state.previousFolder&&!(active?.folder===state.folder&&active.migration?.snapshot_id===state.manifest.id))throw Error('本机资料目录已变化，请重新核对')
  // A durable intent and candidate exist before the cloud write. If its response
  // is lost, query the receipt on retry; do not create a second migration.
  state.confirmIntent=true;await this.save(c,state)
  let remote=await c.request('/status?snapshot_id='+state.manifest.id)
  if(remote.mode!=='local') {
   try {remote=await c.request('/snapshots/'+state.manifest.id+'/confirm',{method:'POST',data:{data_hash:state.manifest.data_hash,backup_saved:true,confirmed:true}})}
   catch(error){c.check();try{remote=await c.request('/status?snapshot_id='+state.manifest.id)}catch(_){throw error}if(remote.mode!=='local')throw error}
  }
  const receipt=remote.confirmation
  if(!receipt?.id||receipt.snapshot_id!==state.manifest.id||receipt.data_hash!==state.manifest.data_hash)throw Error('云端确认记录不匹配，请核对迁移状态')
  state.phase='confirmed';state.receipt=receipt;await this.save(c,state)
  return this.runtime.activateMigration(state.folder,{receipt,previousFolder:state.previousFolder,previousGeneration:state.previousGeneration})
 })}
}
let current
function client(){if(!current)current=new Migration();return current}
module.exports={Migration,canonical,hash,checkManifest,photoName,client}
