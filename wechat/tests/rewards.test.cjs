const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module')
const fixture=(extra={})=>({date:'2026-10-17',server_time:1792234800,balance:120,revision:1,capacity:{base:20,extra:0,used:20,free_limit:20,limit:20,unlimited:false,can_add:false,max_extra:200},checkin:{today_claimed:false,today_reward:10,days:[5,5,5,5,8,10,12].map((amount,i)=>({date:`2026-10-${12+i}`,amount,claimed:i<5,today:i===5}))},shop:{next_price:60,max_extra:200,tiers:[{from:1,to:5,price:60},{from:6,to:20,price:100},{from:21,to:50,price:160},{from:51,to:100,price:200},{from:101,to:200,price:260}]},invitation:{code:'a'.repeat(40),reward:100},greeting:{period:'evening',title:'晚上好呀，喵～',message:'今天也辛苦啦。'},...extra})
function pageHarness(){
 const app={globalData:{token:'alice'},requireSession:()=>true},calls=[],notices=[];let definition,load=async()=>fixture(),mutate=async()=>fixture(),invite=async()=>({code:'a'.repeat(40)})
 const file=require.resolve('../miniprogram/pages/rewards/index'),local=createRequire(file)
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:n=>n.endsWith('/member')?{wrap:x=>x}:n.endsWith('/rewards')?{load:()=>load(),mutate:(...a)=>{calls.push(a);return mutate(...a)}}:n.endsWith('/api')?{request:()=>invite()}:n.endsWith('/navigation')?{resetNavigation(){},navigate:(...a)=>calls.push(a)}:local(n),getApp:()=>app,Page:d=>definition=d,setTimeout,clearTimeout,wx:{showToast:o=>notices.push(o),stopPullDownRefresh(){}},console})
 const page={...definition,data:structuredClone(definition.data),_visible:true,_seq:0,setData(p){Object.assign(this.data,p)}}
 return {page,app,calls,notices,load:f=>load=f,mutate:f=>mutate=f,invite:f=>invite=f}
}
test('shop shows server reward amounts and invitation failures do not hide the balance',async()=>{
 const h=pageHarness();h.load(async()=>fixture({invitation:{code:'',reward:100}}));h.invite(async()=>{throw Error('offline')});await h.page.load();await new Promise(setImmediate)
 assert.equal(h.page.data.model.balance,120);assert.equal(h.page.data.days[5].label,'第6天');assert.match(h.page.data.inviteError,/重试/)
 assert.equal(h.page.onShareAppMessage().path,'/pages/items/index')
 h.page.advertisement();assert.match(h.notices[0].title,/不能观看/);assert.equal(h.calls.length,0)
})

test('growth categories filter progress and a double tap claims only once',async()=>{
 const h=pageHarness(),rows=[{id:'visits_3',category:'visits',target:3,reward:10,progress:3,achieved:true,claimed:false},{id:'items_5',category:'items',target:5,reward:10,progress:2,achieved:false,claimed:false}]
 h.load(async()=>fixture({achievements:rows}));await h.page.load();await h.page.openGrowth();assert.equal(h.page.data.growthRows[0].id,'visits_3')
 let finish;h.mutate(()=>new Promise(r=>finish=r));const first=h.page.claimGrowth({currentTarget:{dataset:{id:'visits_3'}}});await h.page.claimGrowth({currentTarget:{dataset:{id:'visits_3'}}});assert.equal(h.calls.length,1)
 finish(fixture({awarded:10,balance:130,achievements:[{...rows[0],claimed:true},rows[1]]}));await first;assert.equal(h.page.data.model.balance,130);assert.equal(h.page.data.growthRows[0].claimed,true)
 h.page.changeGrowth({currentTarget:{dataset:{tab:'items'}}});assert.equal(h.page.data.growthRows[0].percent,40);await h.page.claimGrowth({currentTarget:{dataset:{id:'items_5'}}});assert.equal(h.calls.length,1);h.page.onHide()
})

test('growth errors keep balance and a late claim cannot update another account',async()=>{
 const h=pageHarness(),rows=[{id:'visits_3',category:'visits',target:3,reward:10,progress:3,achieved:true,claimed:false}]
 h.load(async()=>fixture({achievements:rows}));await h.page.load();await h.page.openGrowth();h.mutate(async()=>{throw Error('离线，请重试')});await h.page.claimGrowth({currentTarget:{dataset:{id:'visits_3'}}});assert.equal(h.page.data.model.balance,120);assert.equal(h.page.data.busy,false);assert.match(h.page.data.growthError,/重试/)
 let finish;h.mutate(()=>new Promise(r=>finish=r));const claim=h.page.claimGrowth({currentTarget:{dataset:{id:'visits_3'}}});h.app.globalData.token='bob';h.load(async()=>fixture({balance:0,achievements:[]}));await h.page.load();finish(fixture({balance:130,awarded:10,achievements:rows}));await claim;assert.equal(h.page.data.model.balance,0);assert.equal(h.page.data.growthRows.length,0);assert.equal(h.page.data.busy,false)
})

const growthSample=()=>fixture({achievements:[{id:'visits_3',category:'visits',target:3,reward:10,progress:3,achieved:true,claimed:false},{id:'visits_7',category:'visits',target:7,reward:20,progress:3,achieved:false,claimed:false},{id:'items_5',category:'items',target:5,reward:10,progress:5,achieved:true,claimed:true}]})
test('collection entry derives pending and claimed counts without opening a window',async()=>{
 const h=pageHarness();h.load(async()=>growthSample());await h.page.load();assert.equal(h.page.data.growthOpen,false);assert.equal(h.page.data.growthPending,1);assert.equal(h.page.data.growthClaimed,1)
 await h.page.claimGrowth({currentTarget:{dataset:{id:'visits_3'}}});assert.equal(h.calls.length,0)
})
test('collection opens cached progress, preserves it on refresh failure and retries inside the window',async()=>{
 const h=pageHarness();h.load(async()=>growthSample());await h.page.load();let finish;h.load(()=>new Promise(r=>finish=r));const opening=h.page.openGrowth();assert.equal(h.page.data.growthOpen,true);assert.equal(h.page.data.growthLoading,true);assert.equal(h.page.data.growthRows.length,2)
 finish(growthSample());await opening;h.load(async()=>{throw Error('网络断开，请重试')});await h.page.refreshGrowth();assert.match(h.page.data.growthError,/重试/);assert.equal(h.page.data.growthPending,1);assert.equal(h.page.data.model.balance,120)
 h.load(async()=>growthSample());await h.page.refreshGrowth();assert.equal(h.page.data.growthError,'');assert.equal(h.page.data.growthLoading,false)
})
test('closing during collection refresh ignores the old response and does not reopen',async()=>{
 const h=pageHarness();h.load(async()=>growthSample());await h.page.load();let finish;h.load(()=>new Promise(r=>finish=r));const opening=h.page.openGrowth();h.page.closeGrowth();finish(fixture({balance:0,achievements:[]}));await opening
 assert.equal(h.page.data.growthOpen,false);assert.equal(h.page.data.growthLoading,false);assert.equal(h.page.data.model.balance,120)
})
test('closing during claim keeps the submission alive and updates wallet and entry without reopening',async()=>{
 const h=pageHarness();h.load(async()=>growthSample());await h.page.load();await h.page.openGrowth();let finish;h.mutate(()=>new Promise(r=>finish=r));const claim=h.page.claimGrowth({currentTarget:{dataset:{id:'visits_3'}}});h.page.closeGrowth();await h.page.load();assert.equal(h.page.data.busy,true)
 const model=growthSample();model.achievements[0].claimed=true;finish({...model,balance:130,awarded:10});await claim;assert.equal(h.page.data.model.balance,130);assert.equal(h.page.data.growthPending,0);assert.equal(h.page.data.growthClaimed,2);assert.equal(h.page.data.growthOpen,false);assert.equal(h.page.data.claimedFlash,'');assert.equal(h.page.data.busy,false)
})
test('reopening while a claim is pending cannot refresh older progress over its result',async()=>{
 const h=pageHarness();h.load(async()=>growthSample());await h.page.load();await h.page.openGrowth();let finish;h.mutate(()=>new Promise(r=>finish=r));const claim=h.page.claimGrowth({currentTarget:{dataset:{id:'visits_3'}}});h.page.closeGrowth();h.load(async()=>{throw Error('must not refresh while submitting')});await h.page.openGrowth();assert.equal(h.page.data.growthOpen,true);assert.equal(h.page.data.growthError,'')
 const model=growthSample();model.achievements[0].claimed=true;finish({...model,balance:130,awarded:10});await claim;assert.equal(h.page.data.growthPending,0);h.page.onHide()
})
test('collection category lasts within the page and resets on reentry and account switch',async()=>{
 const h=pageHarness();h.load(async()=>growthSample());await h.page.load();await h.page.openGrowth();h.page.changeGrowth({currentTarget:{dataset:{tab:'items'}}});h.page.closeGrowth();await h.page.openGrowth();assert.equal(h.page.data.growthTab,'items')
 h.page.onHide();h.page.onShow();await new Promise(setImmediate);assert.equal(h.page.data.growthTab,'visits');assert.equal(h.page.data.growthOpen,false)
 await h.page.openGrowth();let finish;h.load(()=>new Promise(r=>finish=r));const refresh=h.page.refreshGrowth();h.app.globalData.token='bob';h.load(async()=>fixture({balance:0,achievements:[]}));await h.page.load();finish(growthSample());await refresh;assert.equal(h.page.data.growthOpen,false);assert.equal(h.page.data.model.balance,0);assert.equal(h.page.data.growthClaimed,0)
})
test('collection, history, exchange and feedback dialogs never stack',async()=>{
 const h=pageHarness();h.load(async()=>growthSample());await h.page.load();h.page.setData({historyOpen:true});await h.page.openGrowth();assert.equal(h.page.data.growthOpen,false);h.page.setData({historyOpen:false,exchangeOpen:true});await h.page.openGrowth();assert.equal(h.page.data.growthOpen,false)
 h.page.setData({exchangeOpen:false});h.page.selectComponent=()=>({data:{greetingOpen:true}});await h.page.openGrowth();assert.equal(h.page.data.growthOpen,false);h.page.selectComponent=()=>({data:{}});await h.page.openGrowth();await h.page.history();await h.page.openExchange();assert.equal(h.page.data.historyOpen,false);assert.equal(h.page.data.exchangeOpen,false)
})

test('a stale checkin response uses the actual awarded amount and ads never mutate rewards',async()=>{
 const h=pageHarness();await h.page.load();h.mutate(async()=>fixture({awarded:5,balance:125}));await h.page.checkin();assert.equal(h.notices.at(-1).title,'领到5喵粒');const count=h.calls.length;h.page.advertisement();assert.equal(h.calls.length,count)
})

test('daily visit requests share in flight and never accept another account response',async()=>{
 const file=require.resolve('../miniprogram/utils/rewards'),app={globalData:{token:'alice'}},calls=[],pending=[];const module={exports:{}}
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,getApp:()=>app,require:n=>{assert.equal(n,'./api');return {request:(path,options)=>{calls.push({path,options});return new Promise(r=>pending.push(r))}}}})
 const r=module.exports,first=r.visit(),again=r.visit();assert.equal(first,again);assert.equal(calls.length,1);pending[0](fixture());await first;assert.equal((await r.visitIfNeeded(fixture())).balance,120);assert.equal(calls.length,1)
 const old=r.visit();app.globalData.token='bob';const bob=r.visit();pending[1](fixture({balance:130}));await assert.rejects(old,/切换/);pending[2](fixture({balance:0}));await bob;assert.equal(r.current().balance,0)
})

test('a visit receipt recovered after midnight still records the current server date',async()=>{
 const file=require.resolve('../miniprogram/utils/rewards'),module={exports:{}},dates=['2026-10-17','2026-10-18'];let calls=0
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,getApp:()=>({globalData:{token:'alice'}}),require:()=>({request:async()=>{calls++;return fixture({date:dates.shift()})}})})
 const result=await module.exports.visitIfNeeded(fixture({date:'2026-10-18'}));assert.equal(result.date,'2026-10-18');assert.equal(calls,2)
})
test('top sign-in and task sign-in share one request and use server date',async()=>{
 const h=pageHarness();await h.page.load();let finish
 h.mutate(()=>new Promise(r=>finish=r));const first=h.page.checkin();await h.page.checkin();assert.equal(h.calls.length,1)
 assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])),['checkin',{date:'2026-10-17'}])
 finish(fixture({balance:130,checkin:{...fixture().checkin,today_claimed:true}}));await first
 assert.equal(h.page.data.model.balance,130);await h.page.checkin();assert.equal(h.calls.length,1)
})
test('redeem presents fresh confirmation, prevents insufficient funds and double submissions',async()=>{
 const h=pageHarness();await h.page.load();h.load(async()=>fixture({balance:59}));await h.page.openExchange();assert.equal(h.page.data.exchange.remaining,-1);await h.page.redeem();assert.equal(h.calls.length,0)
 h.load(async()=>fixture());await h.page.openExchange();assert.equal(h.page.data.exchange.after,21)
 let finish;h.mutate(()=>new Promise(r=>finish=r));const first=h.page.redeem();await h.page.redeem();assert.equal(h.calls.length,1)
 finish(fixture({balance:60,capacity:{...fixture().capacity,extra:1,free_limit:21}}));await first
 assert.equal(h.page.data.exchangeOpen,false);assert.equal(h.page.data.model.balance,60)
})
test('late responses never present another account balance or invitation and hide clears confirmation',async()=>{
 const h=pageHarness();let finish;h.load(()=>new Promise(r=>finish=r));const p=h.page.load();h.app.globalData.token='bob';finish(fixture());await p;assert.equal(h.page.data.model,null)
 h.page.setData({exchangeOpen:true,exchange:{price:60}});h.page.onHide();assert.equal(h.page.data.exchangeOpen,false);assert.equal(h.page.data.exchange,null)
})
function feedbackHarness(){
 const app={globalData:{token:'alice'},_foreground:true},page={route:'pages/items/index',data:{loading:false},getTabBar:()=>({setData:p=>tabs.push(p)})},tabs=[],calls=[];let definition,load=async()=>fixture(),mutate=async()=>fixture({show:true})
 const file=require.resolve('../miniprogram/components/cat-feedback/index'),local=createRequire(file)
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:n=>n.endsWith('/rewards')?{load:()=>load(),mutate:(...args)=>{calls.push(args);return mutate(...args)},greetingArt:()=>'/assets/rewards/good-night.png'}:n.endsWith('/loading-activity')?{snapshot:()=>[]}:local(n),getApp:()=>app,getCurrentPages:()=>[page],Component:d=>definition=d,wx:{navigateTo:p=>calls.push(p)},setTimeout:()=>1,clearTimeout(){},console})
 const c={...definition.methods,data:structuredClone(definition.data),_visible:true,setData(p){Object.assign(this.data,p)}}
 return {c,app,page,tabs,calls,load:f=>load=f,mutate:f=>mutate=f}
}
test('daily greeting shows server content, closes independently and navigation does not sign in',async()=>{
 const h=feedbackHarness();await h.c.probeGreeting();assert.equal(h.c.data.greetingOpen,true);assert.equal(h.c.data.greetingArt,'/assets/rewards/good-night.png')
 h.c.goCheckin();assert.equal(h.c.data.greetingOpen,false);assert.equal(h.calls.at(-1).url,'/pages/rewards/index');assert.ok(!h.calls.some(c=>c[0]==='checkin'))
})
test('greeting does not stack on pending input, membership announcement or failed data',async()=>{
 const h=feedbackHarness();h.page.data.busy=true;await h.c.probeGreeting();assert.equal(h.calls.length,0)
 h.page.data.busy=false;h.page.route='pages/membership/index';await h.c.probeGreeting();assert.equal(h.calls.length,0)
 h.page.route='pages/items/index';h.load(async()=>{throw Error('offline')});await h.c.probeGreeting();assert.equal(h.calls.length,0);assert.equal(h.c.data.greetingOpen,false)
})
test('account switch during greeting request cannot show the previous account message',async()=>{
 const h=feedbackHarness();let finish;h.mutate(()=>new Promise(r=>finish=r));const p=h.c.probeGreeting();await new Promise(setImmediate);h.app.globalData.token='bob';finish(fixture({show:true}));await p;assert.equal(h.c.data.greetingOpen,false)
})
test('global loading activity settles independently and unsubscribed listeners stop receiving events',()=>{
 const a=require('../miniprogram/utils/loading-activity'),events=[];const stop=a.subscribe(x=>events.push(x.length)),one=a.begin('/items','GET','alice'),two=a.begin('/rewards/checkin','POST','alice');assert.equal(a.snapshot().length,2);one();one();assert.equal(a.snapshot().length,1);two();assert.equal(a.snapshot().length,0);stop();const n=events.length;a.begin('/stats','GET','alice')();assert.equal(events.length,n)
})
test('a greeting response received after hiding releases its undelivered server marker',async()=>{
 const h=feedbackHarness();let finish;h.mutate((_action,data)=>data.not_shown?Promise.resolve(fixture({show:false})):new Promise(r=>finish=r));const p=h.c.probeGreeting();await new Promise(setImmediate);h.c._visible=false;finish(fixture({show:true,delivery_token:'delivery-only-token'}));await p;assert.equal(h.c.data.greetingOpen,false);assert.equal(h.calls[1][1].not_shown,true);assert.equal(h.calls[1][1].delivery_token,'delivery-only-token')
})
function appHarness(saved){
 let definition;const data=[],file=require.resolve('../miniprogram/app'),local=createRequire(file)
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:n=>n==='./config'?{API_TRANSPORT:'local_http',API_BASE:'http://127.0.0.1',DEV_LOGIN:true,DEV_ACCOUNT:'preview'}:n.endsWith('/rewards')||n.endsWith('/member')?{reset(){},visit:async()=>null}:n.endsWith('/api')?{clearPhotos(){},request:async(p,o)=>{data.push({p,o});return {token:'a'.repeat(64),expires_at:4102444800,user:{id:5}}}}:local(n),App:d=>definition=d,setTimeout:()=>0,clearTimeout(){},wx:{getStorageSync:()=>saved,setStorageSync(){},removeStorageSync(){}},console})
 const app={...definition,globalData:structuredClone(definition.globalData)};return {app,data}
}
test('first login forwards opaque invitation once and an existing session ignores incoming invitations',async()=>{
 const code='b'.repeat(40),h=appHarness(null);h.app.onLaunch({query:{invite:code}});assert.equal(h.app._invitation,code);await h.app.login();assert.equal(h.data[0].o.data.invite_code,code);assert.equal(h.app._invitation,'')
 const existing=appHarness({token:'a'.repeat(64),expiresAt:4102444800,user:{id:1}});existing.app.onLaunch({query:{invite:code}});assert.equal(existing.app._invitation,'');assert.equal(existing.app.globalData.user.id,1)
})
test('capacity preflight waits for the draft prompt and keyboard to close',async()=>{
 const h=feedbackHarness();let reads=0;h.load(async()=>{reads++;return fixture()});h.page.route='pages/editor/index';h.page.data.draftPrompt=true;await h.c.probeGreeting();assert.equal(reads,0);assert.equal(h.c.data.capacityOpen,false)
 h.page.data.draftPrompt=false;h.app._keyboardHeight=280;await h.c.probeGreeting();assert.equal(reads,0)
 h.app._keyboardHeight=0;await h.c.probeGreeting();assert.equal(reads,1);assert.equal(h.c.data.capacityOpen,true)
})
