const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module')
const tick=()=>new Promise(r=>setImmediate(r)),event=(index,step)=>({currentTarget:{dataset:{index,step}}})
function harness(){
 const app={globalData:{token:'alice'},requireSession:()=>true},calls=[],alerts=[],modals=[]
 let definition,revision=2,rows=[{id:'default',name:'日常账本',cover:'daily',archived:false},{id:'a',name:'旅行',cover:'travel',archived:false},{id:'b',name:'家居',cover:'home',archived:false}],ensure=async()=>true,queryCallback
 const api={request:async(path,options={})=>{calls.push({path,options});if(path==='/member/books')return {books:structuredClone(rows),order_revision:revision};if(path==='/member/books/order'){if(options.revision!==revision)throw Object.assign(Error('conflict'),{status:409});rows=options.data.book_ids.map(id=>rows.find(b=>b.id===id));revision++;return {order_revision:revision}}if(path.startsWith('/member/entries'))return {entries:[],next_offset:null};return {}}}
 const wx={showToast(){},showModal:o=>modals.push(o),setNavigationBarTitle(){},enableAlertBeforeUnload:o=>alerts.push(o),disableAlertBeforeUnload(){},getWindowInfo:()=>({windowHeight:800}),pageScrollTo(){},createSelectorQuery:()=>({in(){return this},selectAll(){return this},fields(){return this},exec(fn){queryCallback=fn}})}
 const file=require.resolve('../miniprogram/pages/member-tools/index'),local=createRequire(file)
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:n=>n.endsWith('/api')?api:n.endsWith('/member')?{...local(n),wrap:d=>d,load:async()=>({supported:true,active:true,free_entitlements:['books','budgets']}),ensureFreeTool:p=>ensure(p)}:n.endsWith('/navigation')?{navigate(){},resetNavigation(){}}:local(n),Page:d=>definition=d,getApp:()=>app,wx,setTimeout,clearTimeout,console})
 const page={...definition,data:structuredClone(definition.data),_seq:1,_visible:true,_toolsAccount:'alice',setData(patch){for(const[k,v]of Object.entries(patch)){const keys=k.split('.');let obj=this.data;while(keys.length>1)obj=obj[keys.shift()];obj[keys[0]]=v}}};page.data.member={active:true,supported:true};page.acceptBookOrder({books:rows,order_revision:revision})
 return {page,app,api,calls,alerts,modals,wx,ensure:fn=>ensure=fn,add:()=>{rows.push({id:'c',name:'新增',cover:'hobby',archived:false});revision++},query:()=>queryCallback?.([page.data.activeBooks.map((r,i)=>({dataset:{id:r.id},top:150+i*130,height:118,left:18,width:354}))])}
}
const order=p=>Array.from(p.data.activeBooks,r=>r.id),writes=h=>h.calls.filter(c=>c.options.method==='PUT')
test('default book participates, drafts cancel and completion submits one whole list',async()=>{
 const h=harness(),p=h.page;await p.startBookSort();p.bookSortStep(event(0,1));assert.deepEqual(order(p),['a','default','b']);assert.equal(writes(h).length,0);p.cancelBookSort();assert.deepEqual(order(p),['default','a','b']);await p.startBookSort();p.bookSortStep(event(0,1));await Promise.all([p.finishBookSort(),p.finishBookSort()]);assert.equal(writes(h).length,1);assert.deepEqual(Array.from(writes(h)[0].options.data.book_ids),['a','default','b']);assert.equal(p.data.bookSorting,false)
})
test('drag uses measured row geometry, stays put without movement and cancels safely',async()=>{
 const h=harness(),p=h.page;await p.startBookSort();const touch=(id,y)=>({currentTarget:{dataset:{id}},touches:[{clientY:y}]});p.bookDragStart(touch('a',340));h.query();p.bookDragMove(touch('a',340));p.bookDragEnd();assert.deepEqual(order(p),['default','a','b']);p.bookDragStart(touch('default',200));h.query();p.bookDragMove(touch('default',510));assert.equal(p._bookDrag.to,2);assert.ok(p.data.activeBooks[1].sortShift<0);p.bookDragEnd();assert.deepEqual(order(p),['a','b','default']);p.bookDragStart(touch('a',200));h.query();p.bookDragMove(touch('a',510));p.bookDragCancel();assert.deepEqual(order(p),['a','b','default']);assert.equal(writes(h).length,0);assert.equal(p.data.dragBook,null)
})
test('concurrent creation conflicts, reviewed draft keeps intent and appends new book',async()=>{
 const h=harness(),p=h.page;await p.startBookSort();p.bookSortStep(event(0,1));h.add();await p.finishBookSort();assert.equal(p.data.bookSorting,true);assert.equal(p.data.bookSortPending,false);assert.match(p.data.error,/列表已变化/);await p.reviewBookOrder();assert.deepEqual(order(p),['a','default','b','c']);await p.finishBookSort();assert.equal(p.data.bookSorting,false);assert.deepEqual(order(p),['a','default','b','c'])
})
test('lost response after commit recovers by reading the original list without another write',async()=>{
 const h=harness(),p=h.page,request=h.api.request;h.api.request=async(path,opt)=>{const r=await request(path,opt);if(opt?.method==='PUT')throw Error('lost response');return r};await p.startBookSort();p.bookSortStep(event(0,1));await p.finishBookSort();assert.equal(p.data.bookSorting,false);assert.equal(writes(h).length,1)
})
test('unknown submission locks draft and retries the identical snapshot after reconnect',async()=>{
 const h=harness(),p=h.page,request=h.api.request;let offline=true;h.api.request=async(path,opt)=>{if(offline)throw Error('offline');return request(path,opt)};await p.startBookSort();p.bookSortStep(event(0,1));await p.finishBookSort();assert.equal(p.data.bookSortPending,true);p.bookSortStep(event(0,1));p.cancelBookSort();assert.deepEqual(order(p),['a','default','b']);assert.equal(p.data.bookSorting,true);offline=false;await p.finishBookSort();assert.equal(p.data.bookSorting,false);assert.equal(writes(h).length,1)
})
test('unsupported free-tool backend, late validation and account switching cannot order',async()=>{
 const h=harness(),p=h.page;p.data.orderSupported=false;await p.startBookSort();assert.equal(p.data.bookSorting,false);p.data.orderSupported=true;h.ensure(async()=>false);await p.startBookSort();assert.equal(p.data.bookSorting,false);let resolve;h.ensure(()=>new Promise(r=>resolve=r));const opening=p.startBookSort();h.app.globalData.token='bob';resolve(true);await opening;assert.equal(p.data.bookSorting,false);assert.equal(writes(h).length,0)
})
test('late drag geometry cannot restore a hidden page or an old account',async()=>{
 const h=harness(),p=h.page;await p.startBookSort();p.bookDragStart({currentTarget:{dataset:{id:'default'}},touches:[{clientY:200}]});h.app.globalData.token='bob';p.onShow();h.query();await tick();assert.equal(p.data.bookSorting,false);assert.equal(p.data.dragBook,null);assert.equal(writes(h).length,0)
})
test('leaving a dirty sort asks before discarding and declining keeps the draft',async()=>{
 const h=harness(),p=h.page;await p.startBookSort();p.bookSortStep(event(0,1));const tab=p.bookTabChange({currentTarget:{dataset:{tab:'entries'}}});h.modals[0].success({confirm:false});await tab;assert.equal(p.data.bookSorting,true);assert.equal(p.data.bookTab,'list');assert.equal(writes(h).length,0)
})
