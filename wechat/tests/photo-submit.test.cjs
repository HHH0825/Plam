const test = require('node:test')
require('./local-config.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const photo = require('../miniprogram/utils/photo-edit')
const originalPrepare = photo.preparePhoto
const tick = () => new Promise(resolve => setImmediate(resolve))

function canvasRuntime(info = { width:4000, height:3000, orientation:'right', path:'edited.png' }) {
  const operations = [], outputs = [], removed = [], files = new Map(), resized = new Map()
  const context = Object.fromEntries(['fillRect', 'scale', 'translate', 'rotate', 'transform', 'drawImage'].map(name =>
    [name, (...args) => operations.push([name, ...args])]))
  const canvas = { getContext:()=>context, createImage() { return { set src(value) { this.path=value; this.onload() } } } }
  global.wx = {
    getImageInfo(o) { o.success(files.get(o.src)?.info || resized.get(o.src) || info) },
    canIUse:()=>true,
    compressImage(o) { resized.set('native-resized.jpg',{...info,width:o.compressedWidth,height:o.compressedHeight,path:'native-resized.jpg'});o.success({tempFilePath:'native-resized.jpg'}) },
    getFileSystemManager:()=>({stat(o){o.success({stats:{size:files.get(o.path)?.bytes || 10000}})},unlink(o){removed.push(o.filePath);files.delete(o.filePath);o.complete?.()}}),
    createSelectorQuery() { return { in() { return this }, select() { return this },
      fields(o, callback) { this.callback=callback; return this }, exec() { this.callback({node:canvas}) } } },
    canvasToTempFilePath(o) { outputs.push(o); files.set('prepared.jpg',{bytes:10000,info:{width:o.destWidth,height:o.destHeight,type:'jpeg',orientation:'up',path:'prepared.jpg'}});o.success({tempFilePath:'prepared.jpg'}) }
  }
  return {canvas, operations, outputs, removed, files}
}

test('submission encodes the final photo, fixes EXIF and does not apply an extra rotation', async () => {
  const h=canvasRuntime()
  assert.equal(await originalPrepare({}, 'edited.png'), 'prepared.jpg')
  assert.equal(h.outputs[0].destWidth, 960); assert.equal(h.outputs[0].destHeight, 1280)
  assert.equal(h.canvas.width,1); assert.equal(h.canvas.height,1)
  assert.equal(h.outputs[0].quality, .82); assert.equal(h.outputs[0].fileType, 'jpg')
  assert.equal(h.operations.some(row=>row[0]==='rotate'), false)
  assert.ok(h.operations.some(row=>row[0]==='transform'))
  const small=canvasRuntime({width:90,height:60,orientation:'up',path:'small.png'})
  await originalPrepare({}, 'small.png')
  assert.equal(small.outputs[0].destWidth,90); assert.equal(small.outputs[0].destHeight,60)
})

test('photo encoding failure and obsolete encoding results never become upload paths', async () => {
  canvasRuntime(); wx.getImageInfo=o=>o.fail({errMsg:'decode failed'})
  await assert.rejects(originalPrepare({}, 'broken.png'))
  canvasRuntime(); let active=true
  wx.canvasToTempFilePath=o=>{ active=false; o.success({tempFilePath:'late.jpg'}) }
  await assert.rejects(originalPrepare({}, 'edited.png', ()=>active), /取消/)
})

test('byte bound lowers quality then dimensions, cleans rejected files and releases Canvas', async () => {
  const h=canvasRuntime({width:1280,height:960,orientation:'up',path:'source.png'}), page={}
  wx.canvasToTempFilePath=o=>{
    h.outputs.push(o)
    const name='candidate-'+h.outputs.length+'.jpg', bytes=o.destWidth>1024?300000:180000
    h.files.set(name,{bytes,info:{width:o.destWidth,height:o.destHeight,type:'jpeg',path:name}})
    o.success({tempFilePath:name})
  }
  const result=await originalPrepare(page,'source.png')
  assert.deepEqual(h.outputs.map(o=>o.quality),[.82,.75,.68,.82])
  assert.equal(h.outputs.at(-1).destWidth,1024); assert.equal(h.outputs.at(-1).destHeight,768)
  assert.ok(h.files.get(result).bytes<=200*1024); assert.equal(h.removed.length,3)
  assert.equal(h.canvas.width,1); assert.equal(h.canvas.height,1)
  const count=h.outputs.length
  assert.equal(await originalPrepare(page,'source.png'),result); assert.equal(h.outputs.length,count)
  photo.releasePage(page); await tick()
  assert.ok(h.removed.includes(result)); assert.ok(!h.removed.includes('source.png'))
})

test('large images cannot fall back to a full-size Canvas or original upload when native resize is unavailable or ineffective', async () => {
  let h=canvasRuntime(); delete wx.compressImage
  await assert.rejects(originalPrepare({},'edited.png'),/更新微信/); assert.equal(h.outputs.length,0)
  h=canvasRuntime(); wx.compressImage=o=>o.success({tempFilePath:'ineffective.jpg'})
  await assert.rejects(originalPrepare({},'edited.png'),/尺寸压缩失败/)
  assert.equal(h.outputs.length,0); assert.ok(h.removed.includes('ineffective.jpg'))
})

test('cancel after export or file inspection removes candidates and never returns them', async () => {
  const h=canvasRuntime(),page={};let active=true
  wx.getFileSystemManager=()=>({stat(o){active=false;o.success({stats:{size:10000}})},unlink(o){h.removed.push(o.filePath);o.complete?.()}})
  await assert.rejects(originalPrepare(page,'edited.png',()=>active),/取消/)
  assert.ok(h.removed.includes('prepared.jpg')); assert.equal(page._preparedPhoto,undefined)
  assert.equal(h.canvas.width,1)
})

function editorRuntime() {
  const requests=[], uploads=[], notices=[]
  const app={globalData:{token:'alice',user:{id:1}},requireSession:()=>true}
  global.getApp=()=>app
  global.wx={request:o=>{if(o.url.endsWith('/auth/me'))o.success({statusCode:200,data:{capabilities:{item_cover_icons:false}}});else if(o.url.endsWith('/storage-locations'))o.success({statusCode:200,data:{locations:[],unassigned_count:0}});else requests.push(o)},uploadFile:o=>uploads.push(o),getStorageSync:()=>null,
    showModal:o=>notices.push(o),navigateBack:()=>{},getFileSystemManager:()=>({})}
  let definition; global.Page=row=>{definition=row}
  delete require.cache[require.resolve('../miniprogram/pages/editor/index')]
  require('../miniprogram/pages/editor/index')
  const page={...definition,data:structuredClone(definition.data),setData(row){Object.assign(this.data,row)}}
  global.getCurrentPages=()=>[page]; page.onLoad({})
  // The legacy server capability check is settled before an enabled Save tap.
  page.setData({paymentReady:true,form:{...page.data.form,name:'相机'},photoPath:'final-edit.png',previewPath:'final-edit.png'})
  return {page,app,requests,uploads,notices}
}

test('compression fails before item creation and preserves form and draft photo', async () => {
  const h=editorRuntime()
  try {
    photo.preparePhoto=async()=>{throw new Error('canvas failure')}
    await h.page.save()
    assert.equal(h.requests.length,0); assert.equal(h.uploads.length,0)
    assert.equal(h.page.data.form.name,'相机'); assert.equal(h.page.data.photoPath,'final-edit.png')
    assert.match(h.page.data.photoError,/压缩失败/); assert.equal(h.page.data.busy,false)
  } finally {photo.preparePhoto=originalPrepare}
})

test('save waits for encoding, blocks double taps and uploads only the prepared path', async () => {
  const h=editorRuntime(); let finish
  try {
    photo.preparePhoto=(_page,src)=>{assert.equal(src,'final-edit.png');return new Promise(resolve=>{finish=resolve})}
    const pending=h.page.save(); await h.page.save()
    assert.equal(h.requests.length,0); assert.equal(h.page.data.busy,true)
    finish('prepared-final.jpg'); await tick()
    assert.equal(h.requests.length,1)
    h.requests[0].success({statusCode:201,data:{id:15}}); await tick()
    assert.equal(h.uploads[0].filePath,'prepared-final.jpg')
    h.uploads[0].success({statusCode:200,data:'{}'}); await pending
    assert.equal(h.page.itemId,15); assert.equal(h.page.data.busy,false)
    assert.equal(h.page.data.photoPath,'final-edit.png')
  } finally {photo.preparePhoto=originalPrepare}
})

test('account switch during encoding cannot create an item for the new account', async () => {
  const h=editorRuntime(); let finish
  try {
    photo.preparePhoto=()=>new Promise(resolve=>{finish=resolve})
    const pending=h.page.save(); h.app.globalData={token:'bob',user:{id:2}}; h.page.onShow()
    finish('alice-prepared.jpg'); await pending
    assert.equal(h.requests.length,0); assert.equal(h.uploads.length,0)
    assert.equal(h.page.data.photoPath,'')
  } finally {photo.preparePhoto=originalPrepare}
})

test('native feedback remains available after retiring the author support page', () => {
  const root=path.join(__dirname,'../miniprogram')
  const me=fs.readFileSync(path.join(root,'pages/me/index.wxml'),'utf8')
  assert.match(me,/open-type="feedback"/); assert.doesNotMatch(me,/bindtap="support"|menu-support|支持作者/)
  assert.equal(fs.existsSync(path.join(root,'pages/support/index.wxml')),false)
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'app.json'))).pages.includes('pages/support/index'),false)
})

test('cloud photo retry preserves the saved revision without writing metadata again', async () => {
  const h=editorRuntime(), api=require('../miniprogram/utils/api'), config=require('../miniprogram/config')
  const originalRequest=api.request, originalUpload=api.uploadPhoto, oldMode=config.API_TRANSPORT
  const calls=[]
  try {
    config.API_TRANSPORT='cloud_http_function'
    photo.preparePhoto=async()=> 'prepared-retry.jpg'
    api.request=async(path,options)=>{calls.push([path,options.method]);return {id:25,revision:7}}
    api.uploadPhoto=async()=>{throw Error('network unavailable')}
    wx.showModal=o=>o.complete()
    await h.page.save()
    assert.equal(h.page.itemId,25);assert.equal(h.page.data.itemId,25)
    assert.equal(h.page.data.photoPath,'prepared-retry.jpg');assert.equal(h.page.data.busy,false)
    assert.match(h.page.data.photoError,/已保存/)
    api.uploadPhoto=async(id,file,options)=>{assert.equal(options.revision,7);return {id:25,revision:8}}
    await h.page.save()
    assert.deepEqual(calls,[['/items','POST']])
    assert.equal(h.page._serverRevision,8)
  } finally {api.request=originalRequest;api.uploadPhoto=originalUpload;photo.preparePhoto=originalPrepare;config.API_TRANSPORT=oldMode}
})
