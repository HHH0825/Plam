const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const HOST = '636c-cloud1-example-1000000000.cos.ap-shanghai.myqcloud.com'
const BUCKET = HOST.split('.cos.')[0]
const ticket = 'a'.repeat(48), version = 'b'.repeat(24)
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const decode = encoded => JSON.parse(Buffer.from(encoded, 'base64url'))
const tick = () => new Promise(resolve => setImmediate(resolve))
function harness() {
  const app = {globalData: {token: 'a'.repeat(64), user: {id: 1}}}
  const config = {API_TRANSPORT:'cloud_http_function', API_BASE:'', CLOUDBASE_ENV_ID:'cloud1-example', CLOUD_PHOTOS_ENABLED:true}
  const calls = [], uploads = [], journal = new Map()
  const wx = {
    base64ToArrayBuffer(text) { const bytes = Buffer.from(text, 'base64'); return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength) },
    getStorageSync: key => journal.get(key), setStorageSync: (key, value) => journal.set(key, JSON.parse(JSON.stringify(value))),
    getFileSystemManager: () => ({stat: spec => spec.success({stats:{size:1234}}), readFile: () => {throw Error('Image bytes must not enter JSON transport')}}),
    getImageInfo: spec => spec.success({type:'jpeg'}), request: () => {throw Error('No wx.request image PUT')},
    cloud: {callHTTPFunction: spec => {calls.push(spec); return Promise.resolve()}},
    uploadFile: spec => {const row={spec,aborted:false}; uploads.push(row); return {abort(){row.aborted=true;spec.fail({errMsg:'sensitive discarded'})},onProgressUpdate(fn){row.progress=fn}}}
  }
  const globals = {wx,getApp:()=>app,Uint8Array,Map,Set,Promise,Math,Date,JSON,Number,Error,Object,String,encodeURIComponent,decodeURIComponent,unescape,setTimeout,clearTimeout}
  const loaded = new Map()
  function load(name) {
    if(loaded.has(name))return loaded.get(name)
    const module={exports:{}}
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/utils',name+'.js'),'utf8'),{
      ...globals,module,require: name=>name==='../config'?config:name==='./photo-cache'?{createPhotoCache:()=>({reset(){},invalidate(){}})}:load(name.slice(2))})
    loaded.set(name,module.exports);return module.exports
  }
  const restore=load('photo-transfer').restore, api=load('api')
  function uploadInfo() {
    const now=Math.floor(Date.now()/1000), expires_at=now+600
    const form={key:`palm/staging/1/${ticket}`,'Content-Type':'image/jpeg',acl:'default',success_action_status:'204',
      'q-sign-algorithm':'sha1','q-ak':'test-id','q-sign-time':`${now};${expires_at}`,'q-key-time':`${now};${expires_at}`,'q-signature':'c'.repeat(40)}
    form.policy=b64({expiration:new Date(expires_at*1000).toISOString(),conditions:[{bucket:BUCKET},
      ...Object.entries(form).filter(([key])=>!['q-signature','q-key-time'].includes(key)).map(([key,value])=>({[key]:value})),['content-length-range',1234,1234]]})
    return {metadata:{ticket,expires_at}, value:{v:1,kind:'upload',url:`https://${HOST}/`,form,expires_at}}
  }
  function reply(index, metadata, value) {
    calls[index].success({statusCode:200,data:{palm_http:1,statusCode:200,data:metadata},header:value?{'x-palm-photo-transfer':b64(value)}:{}})
  }
  return {app,config,wx,calls,uploads,journal,restore,api,uploadInfo,reply}
}
test('upload is a file POST; only size/type enter business JSON; progress and receipts contain no signatures', async()=>{
  const h=harness(), progress=[]
  const p=h.api.uploadPhoto(1,'prepared.jpg',{revision:7,onProgress:n=>progress.push(n)})
  await tick()
  assert.equal(h.calls[0].path,'/api/mp/items/1/photo/uploads')
  assert.equal(h.calls[0].header['If-Match'],'"7"')
  assert.equal(h.calls[0].data.size_bytes,1234); assert.equal(h.calls[0].data.content_type,'image/jpeg')
  const info=h.uploadInfo();h.reply(0,info.metadata,info.value);await tick()
  assert.equal(h.uploads[0].spec.name,'file');assert.equal(h.uploads[0].spec.filePath,'prepared.jpg')
  assert.equal(h.uploads[0].spec.formData['q-signature'],'c'.repeat(40))
  h.uploads[0].progress({progress:45});assert.deepEqual(progress,[45])
  h.uploads[0].spec.success({statusCode:204});await tick()
  assert.equal(h.calls[1].timeout,55000)
  assert.equal(h.calls[1].header['If-Match'],'"7"')
  h.reply(1,{id:1,photo_version:version});assert.equal((await p).id,1)
  assert.doesNotMatch(JSON.stringify([...h.journal]),/q-signature|test-id|prepared\.jpg|myqcloud/)
})
test('upload rejects missing headers, alien keys/domains, broad policy, expired and long authorizations',()=>{
  const h=harness(), valid=h.uploadInfo(), route='/api/mp/items/1/photo/uploads'
  assert.equal(h.restore(valid.metadata,b64(valid.value),'POST',route).ticket,ticket)
  const mutations=[v=>v.url='https://evil.example/',v=>v.form.key=`palm/staging/2/${ticket}`,v=>v.expires_at+=3600,
    v=>v.form.acl='public-read',v=>v.form['q-key-time']='0;9999999999',v=>{const p=decode(v.form.policy);p.conditions=p.conditions.filter(c=>!c.key);v.form.policy=b64(p)},
    v=>{const p=decode(v.form.policy);p.conditions[p.conditions.length-1]=['content-length-range',1,99999999];v.form.policy=b64(p)}]
  for(const mutate of mutations){const value=JSON.parse(JSON.stringify(valid.value));mutate(value);assert.throws(()=>h.restore(valid.metadata,b64(value),'POST',route))}
  assert.throws(()=>h.restore(valid.metadata,undefined,'POST',route))
  assert.throws(()=>h.restore({...valid.metadata,url:'signed'},b64(valid.value),'POST',route))
})
test('download restores only a bounded host-signed URL in memory',()=>{
  const h=harness(), now=Math.floor(Date.now()/1000), expires_at=now+240
  const url=`https://${HOST}/palm/photos/${'a'.repeat(32)}.jpg?q-sign-algorithm=sha1&q-signature=${'c'.repeat(40)}&q-sign-time=${now-60}%3B${expires_at}&q-key-time=${now-60}%3B${expires_at}`
  const metadata={version,expires_at}, value={v:1,kind:'download',url,expires_at},route='/api/mp/items/1/photo/download'
  assert.equal(h.restore(metadata,b64(value),'GET',route).url,url)
  assert.equal(metadata.url,undefined)
  for(const bad of [url.replace(HOST,'evil.example'),url+'&q-key-time=1%3B2',url.replaceAll(String(expires_at),String(now+600))]){
    assert.throws(()=>h.restore(metadata,b64({...value,url:bad}),'GET',route))
  }
})
test('account switch or page cancellation aborts file upload and never submits a late commit',async()=>{
  for(const switched of [true,false]){
    const h=harness(), p=h.api.uploadPhoto(1,'prepared.jpg');await tick()
    const info=h.uploadInfo();h.reply(0,info.metadata,info.value);await tick()
    if(switched){h.app.globalData={token:'bob',user:{id:2}};h.api.clearPhotos()}else p.cancel()
    await assert.rejects(p,/上传失败|取消/)
    assert.equal(h.uploads[0].aborted,true);h.uploads[0].spec.success({statusCode:204});await tick()
    assert.equal(h.calls.length,1)
  }
})
test('a wrong MIME, oversized file or disabled feature never requests credentials',async()=>{
  for(const mode of ['mime','size','disabled']){
    const h=harness()
    if(mode==='mime')h.wx.getImageInfo=o=>o.success({type:'gif'})
    if(mode==='size')h.wx.getFileSystemManager=()=>({stat:o=>o.success({stats:{size:5242881}})})
    if(mode==='disabled')h.config.CLOUD_PHOTOS_ENABLED=false
    await assert.rejects(h.api.uploadPhoto(1,'bad.file'));assert.equal(h.calls.length,0);assert.equal(h.uploads.length,0)
  }
})

test('an uncertain commit retry reuses its ticket and request id without reuploading',async()=>{
  const h=harness(), p=h.api.uploadPhoto(1,'prepared.jpg');await tick()
  const info=h.uploadInfo();h.reply(0,info.metadata,info.value);await tick()
  h.uploads[0].spec.success({statusCode:204});await tick()
  const first=h.calls[1]
  first.fail({errCode:-501000,errMsg:'private signature must not escape'})
  await assert.rejects(p)
  const retry=p.retry();await tick()
  assert.equal(h.calls[2].path,first.path)
  assert.equal(h.calls[2].header['Idempotency-Key'],first.header['Idempotency-Key'])
  assert.equal(h.uploads.length,1)
  h.reply(2,{id:1});await retry
  assert.doesNotMatch(JSON.stringify([...h.journal]),/q-signature|test-id|myqcloud/)
})
