const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm')
const view = require('../miniprogram/utils/view')
const tick = () => new Promise(resolve => setImmediate(resolve))
const event = id => ({currentTarget:{dataset:{id}}})
function harness() {
  const app = {globalData:{token:'alice'},requireSession:()=>true}, calls=[], confirmations=[], toasts=[], navigations=[]
  let responder = async route => route === '/items' ? Array.from({length:52},(_,n)=>({id:n+1,name:'物品'+(n+1),category:'数码',icon_type:'digital',status:'active',revision:n,storage_location_id:n===0?1:null,storage_location_name:n===0?'书桌':null})) : {locations:[{id:1,name:'书桌',revision:0,count:1},{id:2,name:'衣柜',revision:3,count:0}],unassigned_count:51}
  const api={request:(route,options={})=>{calls.push({route,options});return responder(route,options)},photoCache:()=>({release(){},load:async()=>'/thumb'})}
  const wx={showModal:o=>confirmations.push(o),showToast:o=>toasts.push(o),navigateBack:()=>navigations.push('back')}
  let definition
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/pages/storage-locations/index.js'),'utf8'),{Page:p=>definition=p,getApp:()=>app,wx,require:name=>name.endsWith('/member')?require('./member-stub.cjs'):name.endsWith('/api')?api:name.endsWith('/view')?view:{navigate:(_p,url)=>navigations.push(url),resetNavigation(){}},console})
  const page={...definition,data:structuredClone(definition.data),setData(patch){for(const [key,value] of Object.entries(patch)){const parts=key.split('.');let obj=this.data;while(parts.length>1)obj=obj[parts.shift()];obj[parts[0]]=value}}}
  page.onLoad({});page.onShow()
  return {page,app,calls,confirmations,toasts,navigations,respond:f=>responder=f}
}
test('location selections survive search and stop at 50; already-here items cannot be picked',async()=>{
  const h=harness();await tick();h.page.enter(event(1));h.page.beginAdd();h.page.tapItem(event(1));assert.equal(h.page.data.chosenCount,0)
  h.page.tapItem(event(2));h.page.searchItems({detail:{value:'物品3'}});assert.equal(h.page.data.chosenCount,1)
  h.page.searchItems({detail:{value:''}})
  for(let id=3;id<=52;id++)h.page.tapItem(event(id))
  assert.equal(h.page.data.chosenCount,50);assert.match(h.toasts[0].title,/50/)
})
test('batch assignment carries all original revisions, retains selection on conflict, and requires review',async()=>{
  const h=harness();await tick();h.page.enter(event(1));h.page.beginAdd();h.page.tapItem(event(2));h.page.tapItem(event(3))
  h.respond(async(route)=>{if(route.endsWith('/assign'))throw Object.assign(Error('版本冲突'),{status:409});return route==='/items'?[{id:2,name:'新名称',status:'idle',revision:8,storage_location_id:null},{id:3,name:'三',status:'active',revision:9,storage_location_id:null}]:{locations:[{id:1,name:'书桌',revision:0}],unassigned_count:2}})
  const pending=h.page.addSelected();h.confirmations.pop().success({confirm:true});await pending
  const request=h.calls.find(c=>c.route.endsWith('/assign'))
  assert.equal(request.options.data.storage_location_id,1)
  assert.deepEqual(JSON.parse(JSON.stringify(request.options.data.items)),[{id:2,revision:1},{id:3,revision:2}])
  assert.equal(h.page.data.chosenCount,2);assert.equal(h.page.data.conflict,true)
  const before=h.calls.length;await h.page.addSelected();assert.equal(h.calls.length,before)
  await h.page.review();assert.equal(h.page.data.chosen[2].revision,8);assert.equal(h.page.data.chosenCount,2)
  assert.match(h.page.data.error,/核对/)
})
test('404 and network failures disable writes; a successful retry clears errors',async()=>{
  const h=harness();await tick();h.respond(async()=>{throw Object.assign(Error('记录不存在'),{status:404})});await h.page.load()
  assert.equal(h.page.data.ready,false);assert.match(h.page.data.error,/同步云端/)
  const count=h.calls.length;h.page.newLocation();await h.page.saveName();assert.equal(h.calls.length,count)
  h.respond(async r=>r==='/items'?[]:{locations:[],unassigned_count:0});await h.page.load()
  assert.equal(h.page.data.ready,true);assert.equal(h.page.data.error,'');assert.equal(h.page.data.unavailable,false)
})
test('account switch and delayed responses cannot restore prior-account locations or selections',async()=>{
  const h=harness();await tick();h.page.enter(event(1));h.page.beginAdd();h.page.tapItem(event(2))
  let done;h.respond(route=>route==='/items'?Promise.resolve([]):new Promise(resolve=>done=resolve))
  const pending=h.page.load();h.app.globalData.token='bob';h.page.onShow();done({locations:[{id:8,name:'旧账户'}],unassigned_count:0});await pending
  assert.equal(h.page.data.locations.length,0);assert.equal(h.page.data.chosenCount,0);assert.match(h.page.data.error,/账户已切换/)
})
test('confirmation cancellation and hiding during confirmation never send a move',async()=>{
  const h=harness();await tick();h.page.enter(event(1));h.page.beginAdd();h.page.tapItem(event(2))
  let pending=h.page.addSelected();h.confirmations.pop().success({confirm:false});await pending
  pending=h.page.addSelected();h.page.onHide();h.confirmations.pop().success({confirm:true});await pending
  assert.equal(h.calls.filter(c=>c.route.endsWith('/assign')).length,0)
})
test('unavailable editor picker preserves the original association and ignores old-account results',async()=>{
  const app={globalData:{token:'alice'}},page={_token:'alice',data:{form:{storage_location_id:7,storage_location_name:'原来的抽屉'},storageLocations:[],locationsReady:false},current(token=this._token){return token===app.globalData.token},setData(p){Object.assign(this.data,p)}}
  let reject,resolve
  const api={request:()=>new Promise((yes,no)=>{resolve=yes;reject=no})},module={exports:{}}
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/pages/editor/lib/location-picker.js'),'utf8'),{module,require:n=>n.endsWith('/api')?api:view})
  let pending=module.exports.load(page);reject(Object.assign(Error('404'),{status:404}));await pending
  assert.equal(page.data.form.storage_location_id,7);assert.equal(page.data.locationText,'原来的抽屉');assert.equal(page.data.locationsReady,false)
  pending=module.exports.load(page);app.globalData.token='bob';resolve({locations:[{id:9,name:'旧位置'}]});await pending
  assert.equal(page.data.storageLocations.length,0)
})
