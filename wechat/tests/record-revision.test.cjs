const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path')
const tick = () => new Promise(resolve => setImmediate(resolve))
function harness(options={itemId:'1',kind:'maintenance'}) {
  const app={globalData:{token:'alice'},requireSession:()=>true}, calls=[], modals=[]
  let definition, back=0
  const api={request:(route,options={})=>new Promise((resolve,reject)=>calls.push({route,options,resolve,reject}))}
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/pages/record/index.js'),'utf8'), {
    require: name=>name.endsWith('/member')?require('./member-stub.cjs'):name.endsWith('/api')?api:{today:()=> '2026-10-07',errorMessage:e=>e.message},
    Page:d=>definition=d, getApp:()=>app, wx:{navigateBack:()=>back++,showModal:o=>modals.push(o)}, Promise, Number
  })
  const page={...definition,data:structuredClone(definition.data),setData:patch=>Object.assign(page.data,patch)}
  page.onLoad(options)
  return {app,calls,modals,page,get back(){return back}}
}
test('new records load the parent revision and cannot write before it arrives',async()=>{
  const h=harness(); await h.page.save(); assert.equal(h.calls.length,1)
  h.calls[0].resolve({id:1,revision:4}); await tick()
  h.page.data.form.cost='12.00'
  const save=h.page.save(); assert.equal(h.calls[1].options.revision,4)
  h.calls[1].resolve({id:1,revision:5}); await save; assert.equal(h.back,1)
})
test('account switching clears drafts and rejects stale loads, writes and delete confirmations',async()=>{
  const h=harness({itemId:'1',kind:'maintenance',id:'3'})
  h.app.globalData.token='bob';h.page.onShow()
  h.calls[0].resolve({id:1,revision:4,maintenance_records:[{id:3,description:'alice private'}]});await tick()
  assert.equal(h.page.data.form.description,undefined);assert.equal(h.page._serverRevision,undefined)
  await h.page.save();await h.page.remove();assert.equal(h.calls.length,1)
  const d=harness({itemId:'1',kind:'maintenance',id:'3'})
  d.calls[0].resolve({id:1,revision:4,maintenance_records:[{id:3}]});await tick()
  const remove=d.page.remove(); d.app.globalData.token='bob'; d.modals[0].success({confirm:true});await remove
  assert.equal(d.calls.length,1)
})
test('a conflict keeps the form and only an acknowledged review accepts a newer version',async()=>{
  const h=harness({itemId:'1',kind:'maintenance',id:'3'})
  h.calls[0].resolve({id:1,revision:4,maintenance_records:[{id:3,cost:'12.00',description:'old'}]});await tick()
  h.page.data.form.description='my draft'
  const save=h.page.save();h.calls[1].reject(Object.assign(Error('changed'),{code:'ITEM_VERSION_CONFLICT'}));await save
  assert.equal(h.page.data.versionConflict,true);assert.equal(h.page.data.form.description,'my draft')
  await h.page.save();assert.equal(h.calls.length,2)
  const latest={id:1,revision:5,maintenance_records:[{id:3,cost:'15.00',description:'other device'}]}
  let review=h.page.reviewConflict();h.calls[2].resolve(latest);await tick();h.modals[0].success({confirm:false});await review
  assert.equal(h.page._serverRevision,4)
  review=h.page.reviewConflict();h.calls[3].resolve(latest);await tick();h.modals[1].success({confirm:true});await review
  assert.equal(h.page._serverRevision,5);assert.equal(h.page.data.versionConflict,false)
  assert.equal(h.page.data.form.description,'my draft')
})

test('successful disposal shows archival notice once and an old-account completion cannot navigate',async()=>{
 const toasts=[]
 const app={globalData:{token:'a'},requireSession:()=>true},calls=[];let definition,back=0
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/pages/record/index.js'),'utf8'),{
  require:n=>n.endsWith('/member')?require('./member-stub.cjs'):n.endsWith('/api')?{request:()=>new Promise(resolve=>calls.push(resolve))}:{today:()=> '2026-10-11',errorMessage:e=>e.message},
  Page:d=>definition=d,getApp:()=>app,wx:{navigateBack:()=>back++,showToast:o=>toasts.push(o)},Promise,Number
 })
 const page={...definition,data:structuredClone(definition.data),setData:p=>Object.assign(page.data,p)}
 page.onLoad({itemId:1,kind:'disposal'});calls[0]({revision:1});await tick()
 const save=page.save();await page.save();assert.equal(calls.length,2);calls[1]({revision:2});await save
 assert.equal(back,1);assert.equal(toasts[0].title,'已归入处置档案')
 const stale=page.save();app.globalData.token='b';calls[2]({revision:3});await stale
 assert.equal(back,1);assert.equal(toasts.length,1)
})
