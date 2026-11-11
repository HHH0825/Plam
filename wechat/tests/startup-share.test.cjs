const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const root=path.resolve(__dirname,'../miniprogram')
function runtime(transport='local_http'){
 const cache=new Map(),storage=new Map(),routes=[],requests=[],writes=[],timers=new Map();let definition,app,page,seq=0
 const wx={getStorageSync:k=>storage.get(k),setStorageSync(k,v){storage.set(k,v);writes.push(k)},removeStorageSync:k=>storage.delete(k),getWindowInfo:()=>({windowWidth:390,windowHeight:844}),getDeviceInfo:()=>({platform:'android'}),getSystemSetting:()=>({}),getSystemInfoSync:()=>({platform:'android',windowWidth:390,windowHeight:844}),getFileSystemManager:()=>({}),getPerformance:()=>({now:()=>Date.now()}),onKeyboardHeightChange(){},showToast(){},login:o=>o.success({code:'isolated-code'}),reLaunch:o=>routes.push(o),switchTab:o=>routes.push(o),cloud:{init(){},callHTTPFunction(){throw Error('No network allowed')}},request:o=>{requests.push(o);return {abort(){}}}}
 const context={wx,console,getApp:()=>app,getCurrentPages:()=>page?[page]:[],setTimeout:fn=>{timers.set(++seq,fn);return seq},clearTimeout:id=>timers.delete(id),Page:d=>definition=d,App:d=>app={...d,globalData:{...d.globalData}}}
 function load(name){let file=path.resolve(root,name);if(!path.extname(file))file+='.js';if(cache.has(file))return cache.get(file).exports
  const m={exports:{}};cache.set(file,m)
  if(file.endsWith('.json'))m.exports=JSON.parse(fs.readFileSync(file,'utf8'))
  else vm.runInNewContext(fs.readFileSync(file,'utf8'),{...context,module:m,exports:m.exports,require:n=>load(path.resolve(path.dirname(file),n))},{filename:file})
  return m.exports
 }
 const config=load('config');Object.assign(config,{LOCAL_BUILD:'cloud',API_TRANSPORT:transport,API_BASE:'http://127.0.0.1:9',DEV_LOGIN:true})
 load('app');app.onLaunch();app.onShow()
 return {load,app,wx,routes,requests,storage,writes,timers,cache,page(name){definition=null;load(name==='about'?'pages/login/about':'pages/'+name+'/index');page={...definition,route:'pages/'+name+'/index',data:structuredClone(definition.data),setData(p,done){for(const[k,v]of Object.entries(p)){const bits=k.split('.');let target=this.data;while(bits.length>1){const n=bits.shift();target=target[n]||(target[n]={})}target[bits[0]]=v}done?.()}};return page},setPage:p=>page=p}
}
const tick=()=>new Promise(r=>setImmediate(r))
function user(id=1){return {id,username:'测试猫'+id,avatar_key:'cat'}}
function session(id=1,credential='new-credential'){return {token:credential,expires_at:4102444800,user:user(id)}}
function connected(h,id=1,credential='old-credential'){h.app.globalData={token:'owner-'+id,accessToken:credential,expiresAt:4102444800,user:user(id)}}
function find(h,path){return h.requests.find(r=>r.url.endsWith('/api/mp'+path))}
async function finishLogin(h,id=1,credential='new-credential'){await tick();const r=[...h.requests].reverse().find(r=>r.url.endsWith('/auth/login'));assert.ok(r,'login request');r.success({statusCode:200,data:session(id,credential)});await tick()}

test('first entry stays on items, defers private lifecycle and starts one silent login',async()=>{
 const h=runtime(),p=h.page('items');assert.equal(p.data.entryBlocked,true);p.onLoad();p.onShow();p.onReady();p.onRouteDone();await tick();
 assert.equal(p.data.entryBlocked,true);assert.equal(p.data.sessionBusy,true);assert.equal(p._photos,undefined);assert.equal(h.routes.length,0);assert.equal(h.requests.length,1);assert.ok(h.requests[0].url.endsWith('/auth/login'));
 await finishLogin(h);assert.equal(p.data.entryBlocked,false);assert.ok(p._photos);assert.ok(find(h,'/items'));assert.equal(h.routes.length,0);p.onHide();p.onUnload()
})

test('valid session is reused without requesting wx.login or new credentials',()=>{
 const h=runtime();connected(h);const p=h.page('items');p.onLoad();p.onShow();assert.equal(p.data.entryBlocked,false);assert.equal(h.requests.some(r=>r.url.endsWith('/auth/login')),false);p.onHide();p.onUnload()
})

test('login failure stays on items, does not retry on show and permits an explicit retry',async()=>{
 const h=runtime(),p=h.page('items');p.onLoad();p.onShow();await tick();h.requests[0].fail();await tick();
 assert.equal(p.data.sessionBusy,false);assert.match(p.data.sessionError,/连接失败/);assert.equal(p.data.entryBlocked,true);p.onHide();p.onShow();await tick();assert.equal(h.requests.length,1);
 p.retrySession();p.retrySession();await tick();assert.equal(h.requests.length,2);await finishLogin(h);assert.equal(p.data.entryBlocked,false);p.onHide();p.onUnload()
})

test('public about and legacy entrance never request login before entering items',()=>{
 const h=runtime(),p=h.page('about');p.onLoad();p.onShow();assert.equal(h.requests.length,0);p.login();assert.equal(h.routes[0].url,'/pages/items/index');
 const names=[...h.cache.keys()].map(f=>path.relative(root,f).replaceAll('\\','/'));assert.ok(!names.includes('utils/api.js'))
 const old=runtime(),legacy=old.page('login');legacy.onLoad();assert.equal(old.requests.length,0);assert.equal(old.routes[0].url,'/pages/items/index')
})

test('auth navigation coalesces home redirects and reset can replace the current items page',()=>{
 const h=runtime(),nav=h.load('utils/session-navigation');nav.go(h.app,'home');nav.go(h.app,'home');assert.equal(h.routes.length,1);h.routes[0].fail();nav.go(h.app,'home');assert.equal(h.routes.length,2);
 h.routes[1].success();h.setPage({route:'pages/items/index'});assert.equal(nav.go(h.app,'home'),false);assert.equal(nav.go(h.app,'reset'),true);assert.equal(h.routes.at(-1).url,'/pages/items/index')
})

test('simultaneous 401 reads renew once, retain UI owner and replay reads with the new credential',async()=>{
 const h=runtime();connected(h);const api=h.load('utils/api'),one=api.request('/items'),two=api.request('/stats');const done=Promise.all([one,two]);
 h.requests[0].success({statusCode:401,data:{}});h.requests[1].success({statusCode:401,data:{}});await tick();assert.equal(h.requests.filter(r=>r.url.endsWith('/auth/login')).length,1);
 await finishLogin(h);const rereads=h.requests.filter(r=>r.header.Authorization==='Bearer new-credential');assert.equal(rereads.length,2);rereads.forEach(r=>r.success({statusCode:200,data:[]}));await done;
 assert.equal(h.app.globalData.token,'owner-1');assert.equal(h.app.globalData.accessToken,'new-credential');assert.equal(h.routes.length,0)
})

test('401 mutation is not replayed and its original request ID survives manual retry',async()=>{
 const h=runtime();connected(h);const api=h.load('utils/api'),options={method:'POST',data:{name:'旅行'}};
 const one=api.request('/member/books',options),failed=assert.rejects(one,/连接已恢复/);const id=h.requests[0].header['Idempotency-Key'];h.requests[0].success({statusCode:401,data:{}});await finishLogin(h);await failed;
 assert.equal(h.requests.filter(r=>r.url.endsWith('/member/books')).length,1);const retry=api.request('/member/books',options);assert.equal(h.requests.at(-1).header['Idempotency-Key'],id);h.requests.at(-1).success({statusCode:201,data:{id:'travel'}});await retry
})

test('identity change clears old private content before reopening items and rejects old results',async()=>{
 const h=runtime();connected(h);const p=h.page('items');p.onLoad();p.onShow();p.setData({items:[{name:'旧账户私密物品'}],shown:[{name:'旧账户私密物品'}]});
 const api=h.load('utils/api'),pending=api.request('/stats'),failed=assert.rejects(pending,/切换/);const r=h.requests.at(-1);r.success({statusCode:401,data:{}});await finishLogin(h,2,'account-two');await failed;
 assert.equal(h.app.globalData.user.id,2);assert.deepEqual(Array.from(p.data.items),[]);assert.equal(p.data.sessionBlocked,true);assert.equal(h.routes.at(-1).url,'/pages/items/index');p.onUnload()
})

test('a repeated 401 stops recovery after one read retry and leaves a manual retry state',async()=>{
 const h=runtime();connected(h);const api=h.load('utils/api'),pending=api.request('/items'),failed=assert.rejects(pending,/连接已过期/);h.requests[0].success({statusCode:401,data:{}});await finishLogin(h);h.requests.at(-1).success({statusCode:401,data:{}});await failed;
 assert.equal(h.requests.filter(r=>r.url.endsWith('/auth/login')).length,1);assert.equal(h.app._sessionPhase,'error');assert.equal(h.app.hasSession(),false)
})

test('old 401 cannot clear another account and late old-credential 401 does not renew twice',async()=>{
 const h=runtime();connected(h);const api=h.load('utils/api'),old=api.request('/items');connected(h,2,'second');h.requests[0].success({statusCode:401,data:{}});await assert.rejects(old,/切换/);assert.equal(h.requests.length,1);
 connected(h);const a=api.request('/items'),b=api.request('/stats');const one=h.requests[1],two=h.requests[2];one.success({statusCode:401,data:{}});await finishLogin(h);h.requests.at(-1).success({statusCode:200,data:[]});await a;two.success({statusCode:401,data:{}});await tick();h.requests.at(-1).success({statusCode:200,data:{}});await b;assert.equal(h.requests.filter(r=>r.url.endsWith('/auth/login')).length,1)
})

test('same-account renewal keeps active cached reads valid rather than invalidating their pending epoch',async()=>{
 const h=runtime();connected(h);const cache=h.load('utils/display-cache');const read=cache.read('/stats');await tick();h.requests[0].success({statusCode:401,data:{}});await finishLogin(h);h.requests.at(-1).success({statusCode:200,data:{total:7}});assert.equal((await read).total,7)
})

test('late anonymous login cannot replace a switched account or persist its credentials',async()=>{
 const h=runtime(),old=h.app.login();await Promise.resolve();await Promise.resolve();h.app.clearSession();h.app.globalData={token:'isolated-B',expiresAt:4102444800,user:{id:2}}
 h.requests[0].success({statusCode:200,data:{token:'isolated-A',expires_at:4102444800,user:{id:1}}});await assert.rejects(old,/切换/);assert.equal(h.app.globalData.user.id,2);assert.equal(h.writes.filter(k=>k.startsWith('palmSession')).length,0)
})
test('all 26 pages share explicit public cards; private report menu does not expose its cover',()=>{
 const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8')),all=[...app.pages,...app.subPackages.flatMap(p=>p.pages.map(n=>p.root+'/'+n))]
 for(const route of all){const h=runtime(),p=h.page(route==='pages/login/about'?'about':route.split('/')[1]);p.data.report={private:true};p.data.cashAnalysis={private:true};p.data.coverPath='/private/cover.png';p._token=h.app.globalData.token
  const card=p.onShareAppMessage({from:'menu'});assert.equal(card.path,'/pages/items/index',route);assert.equal(card.imageUrl,'/assets/white-doodle/share-fallback.png',route);assert.ok(card.title.includes('猫爪物账'))
 }
 assert.equal(all.length,26)
})
test('invitation uses the current owner only, preserves opaque code and falls back while not ready',()=>{
 const h=runtime(),p=h.page('rewards'),code='a'.repeat(40);h.app.globalData.token='isolated-A';p._owner='isolated-A';p.data.inviteCode=code
 const card=p.onShareAppMessage({from:'button'});assert.equal(card.path,'/pages/items/index?invite='+code);assert.equal(card.imageUrl,'/pages/rewards/assets/invitation.png')
 h.app.globalData.token='isolated-B';assert.equal(p.onShareAppMessage({from:'menu'}).path,'/pages/items/index');p._owner='isolated-B';p.data.inviteCode='invalid';assert.equal(p.onShareAppMessage({from:'button'}).path,'/pages/items/index')
})
test('greeting reuses in-flight visit and deferred foreground visit does not repeat it',async()=>{
 const h=runtime();h.app.globalData={token:'isolated-A',expiresAt:4102444800,user:{id:1}};const r=h.load('utils/rewards'),model={balance:120,date:'2026-10-20',checkin:{},capacity:{},shop:{}}
 const visit=r.visit(),greeting=r.forGreeting();assert.equal(h.requests.length,1);h.requests[0].success({statusCode:200,data:model});await visit;await greeting;await r.visitForForeground();assert.equal(h.requests.length,1)
 r.foreground();const next=r.visitForForeground();assert.equal(h.requests.length,2);h.requests[1].success({statusCode:200,data:{...model,date:'2026-10-21'}});await next;assert.equal(r.current().date,'2026-10-21')
})
test('components are local dependencies and invitation stays within its image budget',()=>{
 const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));assert.equal(app.usingComponents,undefined)
 const login=JSON.parse(fs.readFileSync(path.join(root,'pages/login/index.json'),'utf8'));assert.deepEqual(Object.keys(login.usingComponents),['cat-loading']);assert.doesNotMatch(fs.readFileSync(path.join(root,'pages/login/index.wxml'),'utf8'),/<cat-feedback/)
 const png=fs.readFileSync(path.join(root,'pages/rewards/assets/invitation.png'));assert.ok(png.length<=45*1024);assert.equal(png.readUInt32BE(16),800);assert.equal(png.readUInt32BE(20),640)
})


test('record submission keeps amount, operation ID and account draft across recovery without resending',async()=>{
 const h=runtime();connected(h);const p=h.page('ledger-record');p.onLoad({});p.onShow();
 find(h,'/auth/me').success({statusCode:200,data:{capabilities:{cash_ledger:1}}});await tick();find(h,'/ledger/settings').success({statusCode:200,data:{enabled:true}});await tick();
 p.change({currentTarget:{dataset:{key:'amount'}},detail:{value:'28.01'}});const operation=p._operation,saving=p.save(),write=h.requests.at(-1);assert.equal(write.method,'POST');write.success({statusCode:401,data:{}});await finishLogin(h);await saving;
 assert.equal(p.data.form.amount,'28.01');assert.equal(p._operation,operation);assert.equal(p.data.busy,false);assert.match(p.data.error,/连接已恢复/);assert.equal(h.requests.filter(r=>r.method==='POST'&&r.url.endsWith('/ledger/entries')).length,1);assert.equal(h.storage.get(p._draftKey).form.amount,'28.01');p.onHide();p.onUnload()
})

test('payment creation receives a recoverable failure and never repeats a checkout',async()=>{
 const h=runtime();connected(h);const api=h.load('utils/api'),pay=api.request('/pay/order',{method:'POST',data:{plan_id:'month',code:'fresh-login-code',platform:'android',expected_price_cents:290}}),failed=assert.rejects(pay,/连接已恢复/);
 h.requests[0].success({statusCode:401,data:{}});await finishLogin(h);await failed;assert.equal(h.requests.filter(r=>r.url.endsWith('/pay/order')).length,1);assert.ok(!h.writes.some(k=>k.includes('fresh-login-code')))
})

test('profile input survives same-account renewal and a return without replacing server data',async()=>{
 const h=runtime();connected(h);const p=h.page('profile');p.onLoad();p.onShow();find(h,'/auth/me').success({statusCode:200,data:{user:user()}});await tick();p.nameInput({detail:{value:'尚未保存的昵称'}});
 const saving=p.save(),write=h.requests.at(-1);write.success({statusCode:401,data:{}});await finishLogin(h);await saving;assert.equal(p.data.name,'尚未保存的昵称');assert.equal(p.data.busy,false);assert.match(p.data.error,/连接已恢复/);
 p.onHide();p.onShow();[...h.requests].reverse().find(r=>r.url.endsWith('/auth/me')).success({statusCode:200,data:{user:user()}});await tick();assert.equal(p.data.name,'尚未保存的昵称');p.onUnload()
})

test('reconnect draft confirmation can be cancelled and rapid taps open only one confirmation',async()=>{
 const h=runtime();connected(h);const p=h.page('profile');p.onLoad();p.onShow();find(h,'/auth/me').success({statusCode:200,data:{user:user()}});await tick();p.nameInput({detail:{value:'不要丢弃'}});
 const prompts=[];h.wx.showModal=o=>prompts.push(o);const one=p.reconnect(),two=p.reconnect();assert.equal(prompts.length,1);prompts[0].success({confirm:false});await Promise.all([one,two]);assert.equal(p.data.name,'不要丢弃');assert.equal(h.app.hasSession(),true);assert.equal(h.requests.some(r=>r.url.endsWith('/auth/logout')),false);p.onHide();p.onUnload()
})

test('manual reconnect revokes once, coalesces clicks and returns to a fresh items page',async()=>{
 const h=runtime();connected(h);const p=h.page('profile');p.onLoad();p.onShow();find(h,'/auth/me').success({statusCode:200,data:{user:user()}});await tick();const a=h.app.reconnect(),b=h.app.reconnect();assert.equal(a,b);
 find(h,'/auth/logout').success({statusCode:204});await finishLogin(h);await a;assert.equal(h.requests.filter(r=>r.url.endsWith('/auth/logout')).length,1);assert.equal(h.routes.at(-1).url,'/pages/items/index');assert.equal(p.data.sessionBlocked,true);assert.equal(h.app.globalData.user.id,1);p.onUnload()
})

test('cancelled reads do not restart after auth and hidden pages defer their private initialization',async()=>{
 const h=runtime();connected(h);const api=h.load('utils/api'),read=api.request('/items'),failed=assert.rejects(read,/取消/);h.requests[0].success({statusCode:401,data:{}});read.cancel();await finishLogin(h);await failed;assert.equal(h.requests.filter(r=>r.url.endsWith('/items')).length,1);
 const fresh=runtime(),p=fresh.page('items');p.onLoad();p.onShow();p.onHide();await finishLogin(fresh);assert.equal(p._photos,undefined);p.onShow();await tick();assert.ok(p._photos);assert.equal(fresh.requests.filter(r=>r.url.endsWith('/items')).length,1);p.onHide();p.onUnload()
})


test('a read started during explicit reconnect waits without microtask recursion or account leakage',async()=>{
 const h=runtime();connected(h);const api=h.load('utils/api');const reconnect=h.app.reconnect();const queued=api.request('/items'),blocked=assert.rejects(queued,/账户已切换/);assert.equal(h.requests.length,1);
 find(h,'/auth/logout').success({statusCode:204});await finishLogin(h);await reconnect;await blocked;assert.equal(h.requests.filter(r=>r.url.endsWith('/items')).length,0)
})


test('cloud HTTP recovery sends the refreshed bearer and preserves a write journal across 401',async()=>{
 const h=runtime('cloud_http_function');connected(h,1,'a'.repeat(64));const calls=[];h.wx.cloud.callHTTPFunction=o=>{calls.push(o);return {abort(){}}};
 const reply=(i,status,data,header={})=>calls[i].success({data:{palm_http:1,statusCode:status,data},header});
 const api=h.load('utils/api'),options={method:'POST',data:{name:'旅行'}};const first=api.request('/member/books',options),rejected=assert.rejects(first,/连接已恢复/);const requestId=calls[0].header['Idempotency-Key'];reply(0,401,{});await tick();assert.equal(calls[1].path,'/api/mp/auth/login');
 reply(1,200,{expires_at:4102444800,user:user()},{'X-Palm-Session':'b'.repeat(64)});await rejected;
 assert.equal(h.app.globalData.token,'owner-1');assert.equal(h.app.globalData.accessToken,'b'.repeat(64));assert.equal(calls.length,2);
 const retry=api.request('/member/books',options);assert.equal(calls[2].header.Authorization,'Bearer '+'b'.repeat(64));assert.equal(calls[2].header['Idempotency-Key'],requestId);reply(2,201,{id:'c'.repeat(32)});await retry
})


test('renewed cache retains a real server credential for restarts and old-client compatibility',async()=>{
 const h=runtime();connected(h);const api=h.load('utils/api'),read=api.request('/items');h.requests[0].success({statusCode:401,data:{}});await finishLogin(h);h.requests.at(-1).success({statusCode:200,data:[]});await read;
 const saved=[...h.storage.entries()].find(([k])=>k.startsWith('palmSession'))[1];assert.equal(saved.token,'new-credential');assert.equal(saved.accessToken,'new-credential');h.app.onLaunch();assert.equal(h.app.globalData.token,'new-credential');assert.equal(h.app.hasSession(),true)
})
