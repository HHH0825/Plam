const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module')
const realMember=require('../miniprogram/utils/member'),ledger=require('../miniprogram/utils/ledger')
const tick=()=>new Promise(r=>setImmediate(r))
function memberHarness(){
 let token='alice',terminal='',response=()=>Promise.resolve(status()),clock=1000000,definition,timers=[]
 const notices=[],navigations=[],calls=[],module={exports:{}}
 function Clock(...args){return new Date(...args)}Clock.now=()=>clock
 const app={globalData:{get token(){return token}}}
 const file=require.resolve('../miniprogram/utils/member')
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,require:n=>n==='./api'?{request:p=>{calls.push(p);return response(p)}}:n==='./payment-platform'?{platform:()=>terminal}:n==='./navigation'?{navigate:(_p,url)=>navigations.push(url)}:createRequire(file)(n),getApp:()=>app,wx:{showToast:x=>notices.push(x)},Date:Clock,setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},console})
 function status(extra={}){return {active:true,status:'active',expires_at:2000,server_time:clock/1000,entitlements:['books'],plans:[],appearance:{effective:{theme:'sage',template:'journal',sticker:'cat'}},...extra}}
 return {member:module.exports,status,calls,notices,navigations,timers,device:x=>terminal=x,token:x=>token=x,time:x=>clock=x,respond:fn=>response=fn,page(){definition=module.exports.wrap({data:{},onShow(){},onHide(){}});return {...definition,route:'pages/me/index',data:{...definition.data},setData(p){Object.assign(this.data,p)}}}}
}

test('membership catalog cache and late responses are isolated by terminal as well as account',async()=>{
 const h=memberHarness();h.device('android');await h.member.load();assert.equal(h.calls.at(-1),'/membership?platform=android')
 let release;h.respond(()=>new Promise(r=>release=r));const old=h.member.load(true)
 h.device('ios');h.respond(async()=>h.status({plans:[{id:'quarter',price_cents:1150}]}));const next=await h.member.load()
 release(h.status({plans:[{id:'quarter',price_cents:990}]}));await assert.rejects(old,/已切换/)
 assert.equal(h.calls.at(-1),'/membership?platform=ios');assert.equal((await h.member.load()).plans[0].price_cents,1150)
})
test('member state cannot be restored by a previous account response',async()=>{
 const h=memberHarness();let resolve;h.respond(()=>new Promise(r=>resolve=r));const pending=h.member.load(true);h.token('bob');resolve(h.status());await assert.rejects(pending,/已切换/);assert.equal(h.member.effective().theme,'default')
 h.respond(async()=>h.status({active:false,status:'free',expires_at:null}));await h.member.load();assert.equal(h.member.effective().theme,'sage')
})
test('known expiry keeps free appearance while network errors keep saved appearance',async()=>{
 const h=memberHarness();await h.member.load();assert.equal(h.member.effective().theme,'sage');h.respond(async()=>{throw Error('offline')});await assert.rejects(h.member.load(true),/offline/);assert.equal(h.member.effective().theme,'sage');h.time(2000001);assert.equal(h.member.effective().theme,'sage');assert.equal(h.member.style().includes('#DDEADD'),true)
})
test('old backend hides premium operations; unavailable state requests retry without unlocking',async()=>{
 const h=memberHarness(),p=h.page();p._memberVisible=true;h.respond(async()=>{throw Object.assign(Error('missing'),{status:404})});assert.equal((await h.member.load()).supported,false);assert.equal(await h.member.ensure(p),false);assert.equal(h.navigations.length,0)
 h.member.reset();h.respond(async()=>{throw Error('offline')});assert.equal(await h.member.ensure(p),false);assert.match(h.notices.at(-1).title,/offline/)
})
test('account change during membership validation never navigates or grants an action',async()=>{
 const h=memberHarness(),p=h.page();p._memberVisible=true;let resolve;h.respond(()=>new Promise(r=>resolve=r));const pending=h.member.ensure(p);h.token('bob');resolve(h.status());assert.equal(await pending,false);assert.equal(h.navigations.length,0)
})
test('member lifecycle refreshes across account changes and clears expiration timer on hide',async()=>{
 const h=memberHarness(),p=h.page();p.onShow();await tick();assert.equal(p.data.memberActive,true);assert.equal(h.timers.length,1);h.token('bob');h.respond(async()=>h.status({active:false,status:'free',expires_at:null}));p.onShow();await tick();assert.equal(p.data.memberBookId,'all');assert.equal(p.data.memberActive,false);p.onHide();assert.equal(p._memberVisible,false)
})
test('report templates preserve data text without rendering legacy stickers or blank space',async()=>{
 const h=memberHarness();await h.member.load();const layout={width:720,height:100,commands:[{kind:'text',text:'¥420.00',x:50,y:80}]},styled=h.member.decorateLayout(layout);assert.equal(styled.height,100);assert.ok(!styled.commands.some(c=>c.kind==='image'));assert.equal(styled.commands.some(c=>c.text==='¥420.00'),true);h.time(2000001);assert.equal(h.member.decorateLayout(layout).height,100)
})
test('removed book selection falls back to all and account switching resets it',async()=>{
 const h=memberHarness(),p=h.page();p.route='pages/statistics/index';p._memberVisible=true;p.data.memberBookId='gone';p.data.month='2026-10';p.data.view='cash';let reloads=0;p.load=()=>reloads++
 h.respond(async path=>path.startsWith('/membership')?h.status({supported:true}):path==='/member/books'?{books:[{id:'default',name:'日常账本'}]}:{total:{limit_cents:null}})
 await p.memberRefresh(true);assert.equal(p.data.memberBookId,'all');assert.equal(p._memberBookId,'all');assert.equal(p.data.memberBookIndex,0);assert.equal(reloads,1)
 p.data.memberBookId='default';p._memberBookId='default';h.token('bob');p.onShow();await tick();assert.equal(p.data.memberBookId,'all');assert.equal(p._memberBookId,'all');p.onHide()
})
function toolsHarness(){
 const app={globalData:{token:'alice'},requireSession:()=>true},calls=[],modals=[],books=[{id:'default',name:'日常账本',revision:0}],api={request:async(path,options={})=>{calls.push({path,options});if(path==='/member/books')return {books};if(path.startsWith('/member/entries?'))return {entries:[],next_offset:null};return {}}}
 let definition,ensure=async()=>true
 const file=require.resolve('../miniprogram/pages/member-tools/index'),local=createRequire(file)
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:n=>n.endsWith('/api')?api:n.endsWith('/member')?{...realMember,wrap:d=>d,load:async()=>({active:true,supported:true}),ensure:()=>ensure()}:n.endsWith('/navigation')?{navigate(){},resetNavigation(){}}:local(n),Page:d=>definition=d,getApp:()=>app,wx:{showModal:o=>modals.push(o),showToast(){},setNavigationBarTitle(){}},setTimeout,clearTimeout,console})
 const page={...definition,data:structuredClone(definition.data),_seq:1,_visible:true,setData(p){for(const[k,v]of Object.entries(p)){const names=k.split('.');let r=this.data;while(names.length>1){const a=names.shift();r=r[a]||(r[a]={})}r[names[0]]=v}}};page.data.member={active:true};page.data.books=books
 return {page,app,calls,modals,api,ensure:fn=>ensure=fn}
}
test('book comic draft previews name and cover without writing or touching legacy sticker data',async()=>{
 const h=toolsHarness(),event=(field,value)=>({currentTarget:{dataset:{field}},detail:{value}});await h.page.newBook();assert.equal(h.page.data.bookPreview.name,'我的新账本');
 h.page.bookInput(event('name','旅行手记'));h.page.coverChange({detail:{value:'1'}});assert.match(h.page.data.bookPreview.coverPath,/book-covers\/travel/);assert.equal(h.calls.length,0);assert.equal(h.page.bookSticker,undefined);
 h.page.closeBookSheet();await h.page.newBook();assert.equal(h.page.data.bookPreview.name,'我的新账本');
 const b={id:'trip',name:'春游',cover:'home',sticker:'cat',order:2,revision:1};h.page.data.books.push(b);h.page.editBook({currentTarget:{dataset:{id:'trip'}}});assert.match(h.page.data.bookPreview.coverPath,/book-covers\/home/);h.page.bookInput(event('name','改名草稿'));assert.equal(b.name,'春游');assert.equal(b.sticker,'cat');assert.equal(h.page.data.bookForm.sticker,undefined);assert.equal(h.page.data.bookForm.order,undefined);assert.equal(h.calls.length,0);
 h.page.coverChange({detail:{value:'99'}});assert.equal(h.page.data.bookPreview.name,'改名草稿')
})
test('book keyboard avoidance lifts once and clears when hidden, closed or switched to another account',async()=>{
 const h=toolsHarness();h.page.bookWindowHeight=()=>700;await h.page.newBook();h.page.bookFocus({currentTarget:{dataset:{field:'name'}},detail:{}});h.page.bookKeyboardChange({detail:{height:300}});assert.equal(h.page.data.bookKeyboardInset,300);assert.equal(h.page.data.bookScrollHeight,210);assert.equal(h.page.data.bookScrollTarget,'book-field-name');
 h.page.bookWindowHeight=()=>400;h.page.onResize();assert.equal(h.page.data.bookKeyboardInset,0);assert.equal(h.page.data.bookScrollHeight,210);
 h.page.bookKeyboardChange({detail:{height:0}});assert.equal(h.page.data.bookKeyboardInset,0);assert.equal(h.page.data.bookScrollHeight,378);h.page.bookWindowHeight=()=>700;h.page.closeBookSheet();h.page.bookKeyboardChange({detail:{height:300}});assert.equal(h.page.data.bookKeyboardInset,0);
 await h.page.newBook();h.page.bookKeyboardChange({detail:{height:300}});h.app.globalData.token='bob';h.page.onShow();await tick();assert.equal(h.page.data.bookSheetOpen,false);assert.equal(h.page.data.bookKeyboardInset,0);assert.equal(h.page.data.bookPreview.name,'我的新账本')
})
test('appearance tabs preserve shared unapplied settings without writing',()=>{
 const h=toolsHarness();h.page._savedAppearance={theme:'default',template:'default',sticker:''};h.page.renderAppearancePreview=()=>{};
 for(const tab of ['cash','collection','page']){h.page.appearanceTab({currentTarget:{dataset:{tab}}});h.page.chooseAppearance({currentTarget:{dataset:{field:'theme',id:'sage'}}})}
 assert.equal(h.page.data.appearance.theme,'sage');assert.equal(h.page.data.appearanceDirty,true);assert.equal(h.page.data.appearancePreviewTab,'page');assert.equal(h.calls.length,0);h.page.onHide()
})
test('account switching during a premium confirmation cannot submit a mutation',async()=>{
 const h=toolsHarness();h.page.data.books.push({id:'book',revision:0});const pending=h.page.deleteBook({currentTarget:{dataset:{id:'book'}}});await tick();h.app.globalData.token='bob';h.modals[0].success({confirm:true});await pending;assert.equal(h.calls.length,0)
})
test('concurrent validation cannot submit a premium action twice',async()=>{
 const h=toolsHarness();let resolve;const gate=new Promise(r=>resolve=r);h.ensure(()=>gate);const p1=h.page.saveBook(),p2=h.page.saveBook();resolve(true);await Promise.all([p1,p2]);assert.equal(h.calls.filter(c=>c.options.method==='POST').length,1);assert.equal(h.page.data.error,'')
})
test('retired custom analysis links never load tools or legacy tags',()=>{
 const h=toolsHarness();h.page.onLoad({mode:'analysis'});h.page.onShow();assert.equal(h.page.data.retired,true);assert.equal(h.page.data.loading,false);assert.equal(h.calls.length,0);assert.equal(h.page.runAnalysis,undefined);assert.equal(h.page.addTag,undefined)
})
test('switching accounts clears old book and entry content while a new list is pending',async()=>{
 const h=toolsHarness();h.page._toolsAccount='alice';h.page.data.entries=[{id:'private-entry'}];h.page.data.activeBooks=[{id:'private-book'}];let finish
 h.api.request=path=>path==='/member/books'?new Promise(r=>finish=r):Promise.resolve({entries:[],next_offset:null});h.app.globalData.token='bob';h.page.onShow();await tick()
 assert.equal(h.page.data.entries.length,0);assert.equal(h.page.data.activeBooks.length,0);assert.equal(h.page.data.orderSupported,false)
 finish({books:[{id:'default',name:'日常账本',archived:false}],order_revision:0});await tick();assert.equal(h.page.data.activeBooks.length,1);assert.equal(h.page.data.activeBooks[0].id,'default');assert.ok(h.calls.every(c=>!c.path.includes('/tags')))
})
test('returning after an interrupted action clears its lock and reloads the current account',async()=>{
 const h=toolsHarness();h.page.data.busy=true;h.page.data.budgetSheetOpen=true;h.page.data.budgetDraftDirty=true;h.page._actionScope={token:'alice',seq:1};h.app.globalData.token='bob';h.page.onShow();await tick();assert.equal(h.page.data.busy,false);assert.equal(h.page._actionScope,null);assert.equal(h.page.data.budgetSheetOpen,false);assert.equal(h.page.data.budgetDraftDirty,false);assert.equal(h.page.data.loading,false)
})

test('membership expiry uses server time despite a wrong device clock',async()=>{
 const h=memberHarness();h.time(-9000000);h.respond(async()=>h.status({active:true,server_time:1000,expires_at:1002}));await h.member.load(true)
 assert.equal(h.member.now(),1000000);h.time(-8997000);assert.equal(h.member.now(),1003000)
})
test('appearance choices remain draft until apply and restore default requires apply',()=>{
 const h=toolsHarness();h.page._savedAppearance={theme:'default',template:'default',sticker:''}
 h.page.chooseAppearance({currentTarget:{dataset:{field:'theme',id:'pink'}}});assert.equal(h.page.data.appearance.theme,'pink');assert.equal(h.page.data.appearanceDirty,true);assert.equal(h.calls.length,0)
 h.page.chooseAppearance({currentTarget:{dataset:{field:'template',id:'journal'}}});assert.equal(h.page.data.appearance.template,'journal');assert.equal(h.calls.length,0)
 h.page.resetAppearance();assert.equal(h.page.data.appearanceDirty,false);assert.equal(h.page.data.appearance.theme,'default');assert.equal(h.calls.length,0)
})
test('leaving appearance discards pending preview and returning preserves an unapplied draft',async()=>{
 const h=toolsHarness();h.page.data.mode='appearance';h.page._toolsAccount='alice';h.page._appearanceLoaded=true;h.page._savedAppearance={theme:'default',template:'default',sticker:''};h.page.data.appearance={theme:'blue',template:'simple',sticker:'cat'};h.page.data.appearanceDirty=true
 h.page.onHide();h.page.onShow();await tick();assert.equal(h.page.data.appearance.theme,'blue');assert.equal(h.page.data.appearanceDirty,true);assert.equal(h.calls.length,0)
 h.app.globalData.token='bob';h.page.onShow();await tick();assert.equal(h.page.data.appearance.theme,'default');assert.equal(h.page.data.appearanceDirty,false)
})

function budgetRecord(extra={}){return {revision:4,total_cents:200000,category_cents:{food:80000},total:{limit_cents:200000,used_cents:34800,remaining_cents:165200,over_cents:0,percent:17,status:'normal'},categories:[{key:'food',limit_cents:80000,used_cents:22800,remaining_cents:57200,over_cents:0,percent:28,status:'normal'}],...extra}}
test('copying previous budget is a GET-only draft across a year boundary',async()=>{
 const h=toolsHarness();h.page.data.mode='budgets';h.page.data.month='2026-01';h.page.data.scope='all';h.page.data.budget=budgetRecord();h.api.request=async(path,options)=>{h.calls.push({path,options});return budgetRecord({revision:9,total_cents:180000,category_cents:{home:50000}})}
 await h.page.copyBudget();assert.equal(h.calls.length,1);assert.equal(h.calls[0].path,'/member/budget?month=2025-12&book_id=all');assert.equal(h.calls[0].options,undefined);assert.equal(h.page.data.budget.revision,4);assert.equal(h.page.data.budgetTotal,'1800.00');assert.equal(h.page.data.budgetDraftDirty,true);assert.equal(h.page.data.budgetSheetOpen,true)
})
test('budget save uses current revision and reviewed draft despite validation awaiting',async()=>{
 const h=toolsHarness();h.page.data.budget=budgetRecord();h.page.data.budgetTotal='1800.00';h.page.data.budgetCategories=[{id:'food',value:'600'}];h.page.data.budgetSheetOpen=true;let finish;h.ensure(()=>new Promise(r=>finish=r));h.page.load=async()=>{};const save=h.page.saveBudget();h.page.data.budgetTotal='999';finish(true);await save
 const writes=h.calls.filter(c=>c.options?.method==='PUT');assert.equal(writes.length,1);assert.equal(writes[0].options.revision,4);assert.equal(writes[0].options.data.total,'1800.00');assert.equal(writes[0].options.data.categories.food,'600');assert.equal(h.page.data.budgetSheetOpen,false)
})
test('budget conflict keeps the editor and user inputs for review',async()=>{
 const h=toolsHarness();h.page.data.budget=budgetRecord();h.page.data.budgetTotal='2300';h.page.data.budgetCategories=[];h.page.data.budgetSheetOpen=true;h.page.data.budgetDraftDirty=true;h.api.request=async()=>{throw Object.assign(Error('changed'),{status:409})};await h.page.saveBudget();assert.equal(h.page.data.budgetSheetOpen,true);assert.equal(h.page.data.budgetTotal,'2300');assert.equal(h.page.data.budgetDraftDirty,true);assert.match(h.page.data.error,/填写保留/)
})
test('late previous-budget response cannot replace another account draft',async()=>{
 const h=toolsHarness();h.page.data.budget=budgetRecord();let finish;h.api.request=()=>new Promise(r=>finish=r);const copy=h.page.copyBudget();await tick();h.app.globalData.token='bob';h.page.data.budgetTotal='new-account';finish(budgetRecord());await copy;assert.equal(h.page.data.budgetTotal,'new-account');assert.equal(h.page.data.budgetSheetOpen,false)
})
test('declining draft dismissal keeps the budget editor open without a write',async()=>{
 const h=toolsHarness();h.page.data.budgetSheetOpen=true;h.page.data.budgetDraftDirty=true;const close=h.page.closeBudgetSheet();h.modals[0].success({confirm:false});await close;assert.equal(h.page.data.budgetSheetOpen,true);assert.equal(h.calls.length,0)
})
test('free user cannot open an editable budget or save a new book',async()=>{
 const h=toolsHarness();h.ensure(async()=>false);h.page.data.budget=budgetRecord();await h.page.openBudget();await h.page.newBook();await h.page.saveBook();assert.equal(h.page.data.budgetSheetOpen,false);assert.equal(h.page.data.bookSheetOpen,false);assert.equal(h.calls.length,0)
})
test('retired calendar deep link never loads calendar or book data',()=>{
 const h=toolsHarness();h.page.onLoad({mode:'bills'});h.page.onShow();assert.equal(h.page.data.retired,true);assert.equal(h.page.data.loading,false);assert.equal(h.calls.length,0)
})
test('book sub-tabs retain loaded rows and selections while archived books stay separate',async()=>{
 const h=toolsHarness();h.api.request=async(path)=>{if(path==='/member/books')return {books:[{id:'default',name:'日常',archived:false},{id:'old',name:'旅行',archived:true}]};return {entries:[{id:'entry',name:'午餐',tags:[]}],next_offset:null}};await h.page.load();assert.equal(h.page.data.activeBooks.length,1);assert.equal(h.page.data.archivedBooks.length,1);h.page.chooseEntries({detail:{value:['entry']}});h.page.bookTabChange({currentTarget:{dataset:{tab:'list'}}});h.page.bookTabChange({currentTarget:{dataset:{tab:'entries'}}});assert.equal(h.page.data.entries[0].selected,true);assert.equal(h.page.data.selectedEntries[0],'entry')
})


test('free appearance loads and applies without reading membership or books or invoking premium validation',async()=>{
 const h=toolsHarness();h.page.data.mode='appearance';h.ensure(()=>{throw Error('premium guard must not run')});let saved={theme:'sage',template:'simple',sticker:'cat',revision:2};
 h.api.request=async(path,options={})=>{h.calls.push({path,options});assert.equal(path,'/member/appearance');if(options.method==='PUT'){assert.equal(options.revision,2);saved={...options.data,revision:3}}return {saved,effective:saved}}
 await h.page.load();assert.equal(h.page.data.appearance.theme,'sage');h.page.chooseAppearance({currentTarget:{dataset:{field:'theme',id:'blue'}}});assert.equal(h.calls.length,1);await h.page.applyAppearance();assert.equal(h.page.data.appearanceDirty,false);assert.equal(h.page.data.appearance.theme,'blue');assert.equal(h.page._appearanceRevision,3);assert.equal(h.calls.filter(c=>c.options.method==='PUT').length,1);h.page.onHide()
})
test('budget keyboard uses one avoidance strategy and restores the draft on blur and hide',async()=>{
 const h=toolsHarness();h.page.bookWindowHeight=()=>700;h.page.resetBudgetKeyboard();h.page.data.budgetSheetOpen=true;h.page.data.budgetTotal='88.50';h.page.budgetFocus({currentTarget:{dataset:{}},detail:{height:300}});assert.equal(h.page.data.budgetKeyboardInset,300);assert.equal(h.page.data.budgetScrollTarget,'budget-field-total');assert.equal(h.page.data.budgetScrollHeight,210)
 h.page.bookWindowHeight=()=>400;h.page.onResize();assert.equal(h.page.data.budgetKeyboardInset,0);assert.equal(h.page.data.budgetScrollHeight,210);h.page.budgetFocus({currentTarget:{dataset:{index:2}},detail:{}});assert.equal(h.page.data.budgetScrollTarget,'budget-field-2');h.page.budgetKeyboardChange({detail:{height:0}});assert.equal(h.page.data.budgetScrollHeight,378);h.page.onHide();assert.equal(h.page.data.budgetKeyboardInset,0);assert.equal(h.page.data.budgetTotal,'88.50')
})
test('budget card distinguishes loading, unset, available, overspent and failed and opens the current scope',async()=>{
 const card=require('../miniprogram/utils/budget-card');assert.equal(card.loading().kind,'loading');assert.equal(card.failed().kind,'error');assert.throws(()=>card.present({total:{}}))
 assert.equal(card.present({total:{limit_cents:null,used_cents:0}}).kind,'unset');assert.equal(card.present({total:{limit_cents:10000,used_cents:2500,remaining_cents:7500,percent:25}}).title,'剩余 ¥75.00');assert.equal(card.present({total:{limit_cents:10000,used_cents:12000,remaining_cents:-2000,percent:100}}).title,'已超支 ¥20.00')
 const h=memberHarness(),p=h.page();p.data.memberSupported=true;p.data.month='2026-10';p.data.memberBookId='trip';p.data.budgetCard=card.present({total:{limit_cents:null,used_cents:0}});await p.openBudgetCard();assert.equal(h.navigations.at(-1),'/pages/member-tools/index?mode=budgets&month=2026-10&book_id=trip');let retried=0;p.memberRefresh=()=>retried++;p.data.budgetCard=card.failed();p.openBudgetCard();assert.equal(retried,1)
})
test('free appearance snapshot remains scoped to its account and persists through membership expiration',()=>{
 const h=memberHarness();h.member.rememberAppearance({effective:{theme:'pink',template:'simple',sticker:'cat'}});assert.equal(h.member.effective().theme,'pink');h.token('bob');assert.equal(h.member.effective().theme,'default');h.member.reset();h.token('alice');assert.equal(h.member.effective().theme,'default')
})

test('an older membership response cannot overwrite a freshly applied free appearance',async()=>{
 const h=memberHarness();await h.member.load();let finish;h.respond(()=>new Promise(r=>finish=r));const old=h.member.load(true);h.member.rememberAppearance({effective:{theme:'blue',template:'simple',sticker:''}});finish(h.status());await assert.rejects(old,/已切换/);assert.equal(h.member.effective().theme,'blue')
})

test('budget refresh keeps failures distinct from unset and rejects an old book response',async()=>{
 const h=memberHarness(),p=h.page();p.route='pages/ledger/index';p._memberVisible=true;p.data.month='2026-10';let finish,fail=false
 h.respond(async path=>{if(path.startsWith('/membership'))return h.status();if(path==='/member/books')return {books:[{id:'trip',name:'旅行'}]};if(fail)throw Error('offline budget');return new Promise(r=>finish=r)})
 const old=p.memberRefresh(true);await tick();assert.equal(p.data.budgetCard.kind,'loading');p.data.memberBookId='trip';finish({total:{limit_cents:10000,used_cents:5000,remaining_cents:5000,percent:50}});await old;assert.equal(p.data.budgetCard.kind,'loading');fail=true;await p.memberRefresh(true);assert.equal(p.data.budgetCard.kind,'error');assert.equal(p.data.memberBudget,null);assert.equal(p.data.memberError,'')
})
