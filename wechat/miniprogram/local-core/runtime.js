'use strict'
const {createFiles}=require('./wx-files')
const {Store}=require('./store')
const {Business}=require('./business')
const {utf8,sha256}=require('./integrity')
const R=require('./rules')
let instance,pending,controlState,controlPending
const native=(wx,method,args)=>new Promise((resolve,reject)=>wx[method]({...args,success:resolve,fail:reject}))
const nonce=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)
function isLocal(){const config=require('../config');return config.LOCAL_BUILD==='local'||typeof getApp==='function'&&getApp()?.globalData?.localMode===true}
async function preflight(wx){const io=createFiles(wx,'catpaw-fs-probe'),a='probe-'+nonce(),b=a+'-target';try{await io.write(a,utf8('abcdef'));await io.write(b,utf8('old'));await io.rename(a,b);const raw=await io.read(b),range=await io.readRange(b,2,3);if(sha256(raw)!==sha256('abcdef')||sha256(range)!==sha256('cde'))throw Error('文件读写校验不一致');return {renameOverwrite:true,rangeRead:true,checkedAt:Date.now()}}finally{await io.remove(a);await io.remove(b)}}
async function openControl(wxApi=wx){if(controlState)return controlState;if(!controlPending)controlPending=(async()=>{const controlIO=createFiles(wxApi,'catpaw-control'),control=await new Store(controlIO).open();return controlState={controlIO,control}})().finally(()=>{controlPending=null});return controlPending}
async function open(wxApi=wx){if(instance)return instance;if(pending)return pending;pending=(async()=>{const fsCheck=await preflight(wxApi),{controlIO,control}=await openControl(wxApi);let pointer=(await control.table('active'))[0];if(!pointer){pointer={id:'active',folder:'catpaw-data-'+nonce()};const store=await new Store(createFiles(wxApi,pointer.folder)).open();await store.transaction(tx=>tx.set('settings',[{id:'current',user:{id:1,username:'本机用户',avatar_key:'sprout'},created_at:new Date().toISOString(),ledger_enabled:false,appearance:{revision:0,theme:'default',template:'default',sticker:''},visits:[]} ]));await control.transaction(tx=>tx.set('active',[pointer]))}const io=createFiles(wxApi,pointer.folder),store=await new Store(io).open();await io.mkdir('photos');const runtime={wx:wxApi,controlIO,control,io,store,business:new Business(store),fsCheck,folder:pointer.folder};instance=runtime;return runtime})().finally(()=>{pending=null});return pending}
function request(path,options={}){let cancelled=false,child;const p=open().then(r=>{if(cancelled)throw Error('读取已取消');child=require('./request-queue').submit(r,path,options);return child}).then(value=>{require('../utils/display-cache').invalidate(path,options.method||'GET');return value});p.cancel=()=>{cancelled=true;child?.cancel?.()};return p}
async function uploadPhoto(itemId,path,options={}){
 const r=await open()
 await r.store.transaction(async tx=>{
  if(r.store.retired)throw Error('资料已切换，请重新打开页面')
  const items=await tx.get('items'),it=items.find(i=>i.id===itemId&&!i.deleted_at)
  if(!it)throw Error('物品不存在');R.revision(it,options.revision)
  const info=await native(r.wx,'getImageInfo',{src:path}),ext={jpeg:'jpg',jpg:'jpg',png:'png',webp:'webp'}[String(info.type).toLowerCase()]
  if(!ext)throw Error('照片格式不支持')
  const name='photo-'+nonce()+'.'+ext;await r.io.copyFrom(path,'photos/'+name)
  const raw=await r.io.read('photos/'+name);if(!raw||raw.length===0||raw.length>5*1024*1024)throw Error('照片不能为空或超过5MB')
  let thumb=name
  if(Math.max(info.width,info.height)>320){const result=await native(r.wx,'compressImage',{src:path,quality:85,compressedWidth:Math.round(info.width*320/Math.max(info.width,info.height)),compressedHeight:Math.round(info.height*320/Math.max(info.width,info.height))});thumb='photo-'+nonce()+'.jpg';await r.io.copyFrom(result.tempFilePath,'photos/'+thumb);if(!await r.io.read('photos/'+thumb))throw Error('缩略图保存失败')}
  it.photo_key=name;it.thumb_key=thumb;it.revision++;tx.set('items',items)
 })
 options.onProgress?.(100);require('../utils/display-cache').clear();return r.business.request('/items/'+itemId)
}

function photoDownload(spec){let cancelled=false;return {promise:open().then(async r=>{const items=await r.store.table('items'),it=items.find(i=>i.id===spec.id&&!i.deleted_at),name=spec.size==='thumb'?(it?.thumb_key||it?.photo_key):it?.photo_key;if(!name||spec.version&&spec.version!==it.photo_key)throw Error('照片已变化，请重新读取');if(cancelled)throw Error('照片读取已取消');await r.controlIO.mkdir('cache');const cache='cache/'+nonce()+'.'+name.split('.').pop();await r.controlIO.copyFrom(r.io.path('photos/'+name),cache);if(cancelled){await r.controlIO.remove(cache);throw Error('照片读取已取消')}return r.controlIO.path(cache)}),abort(){cancelled=true}}}
// Switching directories is itself a journalled transaction. Existing files stay intact.
async function activate(folder,{expectedFolder,expectedGeneration,receipt}={}){const r=await open();if(expectedFolder&&r.folder!==expectedFolder)throw Error('本机资料已变化，请重新核对');const io=createFiles(r.wx,folder),store=await new Store(io).open();await store.verify();await r.store.transaction(async()=>{if(expectedGeneration!==undefined&&r.store.head.generation!==expectedGeneration)throw Error('资料已变化，请重新备份后恢复');await r.control.transaction(async tx=>{const previous=(await tx.get('active'))[0];tx.set('active',[{id:'active',folder,previous:previous.folder,migration:receipt||null,activatedAt:Date.now()}])});r.store.retired=true});instance={...r,folder,io,store,business:new Business(store)};const app=typeof getApp==='function'?getApp():null;if(app){app.globalData.localMode=true;app.globalData.token='local-device';app.globalData.accessToken='';app.globalData.expiresAt=Number.MAX_SAFE_INTEGER;app._sessionPhase='ready';app.globalData.user=(await instance.business.request('/auth/me')).user;r.wx.setStorageSync('catpawLocalActivated',true);require('../utils/api').clearPhotos();require('../utils/member').reset();require('../utils/rewards').reset();app.notifySession?.('changed')}return instance}
async function space(){const r=await open(),fs=r.wx.getFileSystemManager();const stats=await new Promise((resolve,reject)=>fs.stat({path:r.wx.env.USER_DATA_PATH,recursive:true,success:resolve,fail:reject}));const files=Array.isArray(stats.stats)?stats.stats:[];return {usedBytes:files.reduce((n,x)=>n+(x.stats?.isFile?.()?x.stats.size:0),0),availableBytes:null,fsCheck:r.fsCheck}}
// A broken dataset must not prevent choosing an external backup. The control
// journal must remain readable; damaged control journals require explicit recovery.
async function recoveryAccess(wxApi=wx){const {controlIO,control}=await openControl(wxApi);await control.verify();const pointer=(await control.table('active'))[0];if(!pointer)throw Error('数据目录记录缺失，请先恢复内部目录记录');const io=createFiles(wxApi,pointer.folder),heads=[];for(const slot of [0,1]){const bytes=await io.read('head-'+slot+'.json');heads.push(bytes===null?null:sha256(bytes))}return {wx:wxApi,controlIO,control,io,folder:pointer.folder,signature:sha256(JSON.stringify(heads)),generation:null,recovery:true}}
async function activateRecovery(folder,expected){const r=await recoveryAccess(),io=createFiles(r.wx,folder),store=await new Store(io).open();await store.verify();if(r.folder!==expected.folder||r.signature!==expected.signature)throw Error('原资料已变化，请重新核对恢复文件');await r.control.transaction(async tx=>{const pointer=(await tx.get('active'))[0];if(pointer.folder!==r.folder)throw Error('资料目录已变化');tx.set('active',[{id:'active',folder,previous:r.folder,activatedAt:Date.now(),recovered:true}])});if(instance)instance.store.retired=true;instance={...r,io,store,folder,business:new Business(store),recovery:false};const app=typeof getApp==='function'?getApp():null;if(app){require('../utils/member').reset();require('../utils/rewards').reset();require('../utils/api').clearPhotos();app._localError=null;await app.prepareLocal()}return instance}
function resetControl(){if(instance)instance.store.retired=true;instance=pending=controlState=controlPending=null}
function scope(){return instance?.folder||'pending'}
module.exports={open,request,isLocal,preflight,uploadPhoto,photoDownload,activate,space,nonce,native,recoveryAccess,activateRecovery,openControl,activateMigration,resetControl,scope}

async function activateMigration(folder,{receipt,previousFolder=null,previousGeneration=null}={}){
 if(!receipt?.id||!receipt?.snapshot_id)throw Error('缺少云端迁移确认记录')
 const {control,controlIO}=await openControl(),io=createFiles(wx,folder),store=await new Store(io).open();await store.verify()
 await control.transaction(async tx=>{const old=(await tx.get('active'))[0];if(old?.folder===folder&&old.migration?.id===receipt.id)return;if((old?.folder||null)!==previousFolder)throw Error('本机资料目录已变化，请重新核对');if(old){const previous=await new Store(createFiles(wx,old.folder)).open();if(previous.head.generation!==previousGeneration)throw Error('本机资料已变化，请先重新备份')}tx.set('active',[{id:'active',folder,previous:previousFolder,migration:receipt,activatedAt:Date.now()}])})
 if(instance)instance.store.retired=true;instance={wx,io,store,control,controlIO,folder,business:new Business(store)}
 const app=typeof getApp==='function'?getApp():null;if(app){app.globalData={localMode:true,token:'local-device',accessToken:'',expiresAt:Number.MAX_SAFE_INTEGER,user:(await instance.business.request('/auth/me')).user};wx.setStorageSync('catpawLocalActivated',true);app.finishLocalMigration?.();require('../utils/member').reset();require('../utils/rewards').reset();require('../utils/api').clearPhotos();app._sessionGeneration=(app._sessionGeneration||0)+1;app._localReady=Promise.resolve(app.globalData.user);app._sessionPhase='ready';app.notifySession('changed');app.notifySession('ready')}return instance
}
