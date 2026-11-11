const {test}=require('node:test'),assert=require('node:assert/strict')
const {Store}=require('../miniprogram/local-core/store'),{Business}=require('../miniprogram/local-core/business'),{submit}=require('../miniprogram/local-core/request-queue')
function memory(){const files=new Map();return {async read(n){return files.get(n)||null},async write(n,b){files.set(n,b)},async rename(a,b){files.set(b,files.get(a));files.delete(a)},async list(){return [...files.keys()]}}}
test('lost acknowledgement reuses durable receipt, even after data and control reopen',async()=>{
 const io=memory(),ctl=memory(),store=await new Store(io).open(),control=await new Store(ctl).open(),business=new Business(store),r={folder:'data-a',control,business}
 const options={method:'POST',data:{name:'只保存一次',category:'数码',purchase_date:'2026-01-01',purchase_price:'10.00'}},original=control.transaction.bind(control);let count=0
 control.transaction=(fn,...args)=>{if(++count===2)return Promise.reject(Error('模拟回执写入失败'));return original(fn,...args)}
 await assert.rejects(submit(r,'/items',options),/回执/);assert.equal((await business.request('/items')).length,1)
 const reopened={folder:r.folder,control:await new Store(ctl).open(),business:new Business(await new Store(io).open())}
 const receipt=await submit(reopened,'/items',options);assert.equal(receipt.name,'只保存一次');assert.equal((await reopened.business.request('/items')).length,1);assert.equal((await reopened.control.table('requests')).length,0)
})
test('read cancellation is forwarded and validation failure clears only its own intent',async()=>{
 const control=await new Store(memory()).open(),business=new Business(await new Store(memory()).open()),r={folder:'data-b',control,business}
 const read=submit(r,'/auth/me',{});assert.equal(typeof read.cancel,'function');read.cancel();await assert.rejects(read,/取消/)
 await assert.rejects(submit(r,'/items',{method:'POST',data:{}}),/日期/);assert.equal((await control.table('requests')).length,0)
})
