const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const root=path.resolve(__dirname,'../miniprogram')
function runtime(){
 const cache=new Map(),storage=new Map(),routes=[],requests=[],writes=[],timers=new Map();let definition,app,page,seq=0
 const wx={getStorageSync:k=>storage.get(k),setStorageSync(k,v){storage.set(k,v);writes.push(k)},removeStorageSync:k=>storage.delete(k),getWindowInfo:()=>({windowWidth:390,windowHeight:844}),getDeviceInfo:()=>({platform:'android'}),getSystemSetting:()=>({}),getSystemInfoSync:()=>({platform:'android',windowWidth:390,windowHeight:844}),getFileSystemManager:()=>({}),getPerformance:()=>({now:()=>Date.now()}),onKeyboardHeightChange(){},showToast(){},login:o=>o.success({code:'isolated-code'}),reLaunch:o=>routes.push(o),switchTab:o=>routes.push(o),cloud:{init(){},callHTTPFunction(){throw Error('No network allowed')}},request:o=>{requests.push(o);return {abort(){}}}}
 const context={wx,console,getApp:()=>app,getCurrentPages:()=>page?[page]:[],setTimeout:fn=>{timers.set(++seq,fn);return seq},clearTimeout:id=>timers.delete(id),Page:d=>definition=d,App:d=>app={...d,globalData:{...d.globalData}}}
 function load(name){let file=path.resolve(root,name);if(!path.extname(file))file+='.js';if(cache.has(file))return cache.get(file).exports
  const m={exports:{}};cache.set(file,m)
  if(file.endsWith('.json'))m.exports=JSON.parse(fs.readFileSync(file,'utf8'))
  else vm.runInNewContext(fs.readFileSync(file,'utf8'),{...context,module:m,exports:m.exports,require:n=>load(path.resolve(path.dirname(file),n))},{filename:file})
  return m.exports
 }
 const config=load('config');Object.assign(config,{API_TRANSPORT:'local_http',API_BASE:'http://127.0.0.1:9',DEV_LOGIN:true})
 load('app');app.onLaunch();app.onShow()
 return {load,app,wx,routes,requests,storage,writes,timers,cache,page(name){definition=null;load('pages/'+name+'/index');page={...definition,route:'pages/'+name+'/index',data:structuredClone(definition.data),setData(p,done){Object.assign(this.data,p);done?.()}};return page},setPage:p=>page=p}
}
test('unauthenticated entry does not initialize private list or feedback; one redirect waits for ready',()=>{
 const h=runtime(),p=h.page('items');p.onLoad();p.onShow();assert.equal(p.data.entryBlocked,true);assert.equal(p._photos,undefined);assert.equal(h.requests.length,0);assert.equal(h.routes.length,0)
 p.onReady();assert.equal(h.routes.length,0);p.onRouteDone();h.app.requireSession();assert.equal(h.routes.length,1);assert.equal(h.routes[0].url,'/pages/login/index');p.onHide();p.onUnload();assert.equal(h.requests.length,0)
})
test('login page can render and share without importing membership, API, feedback or greeting',()=>{
 const h=runtime(),p=h.page('login');p.onLoad();p.onShow();assert.equal(h.requests.length,0)
 const names=[...h.cache.keys()].map(f=>path.relative(root,f).replaceAll('\\','/'))
 for(const f of ['utils/member.js','utils/api.js','utils/rewards.js','components/cat-feedback/index.js'])assert.ok(!names.includes(f),f)
 assert.equal(p.onShareAppMessage({from:'menu'}).path,'/pages/items/index')
})
test('auth navigation coalesces redirects, releases failures and discards obsolete queued account',()=>{
 const h=runtime(),nav=h.load('utils/session-navigation');nav.go(h.app,'login');nav.go(h.app,'login');assert.equal(h.routes.length,1)
 h.routes[0].fail();nav.go(h.app,'login');assert.equal(h.routes.length,2)
 h.app.globalData.token='isolated-A';nav.go(h.app,'home');h.app.globalData.token='isolated-B';h.routes[1].success();assert.equal(h.routes.length,2)
 h.setPage({route:'pages/login/index'});assert.equal(nav.go(h.app,'login'),false)
})
test('simultaneous 401s cause one logout navigation; old 401 cannot clear new account',async()=>{
 const h=runtime();h.app.globalData={token:'isolated-A',expiresAt:4102444800,user:{id:1}};const api=h.load('utils/api')
 const one=api.request('/items'),two=api.request('/stats');const results=Promise.allSettled([one,two])
 h.requests[0].success({statusCode:401,data:{error:'expired'}});h.requests[1].success({statusCode:401,data:{error:'expired'}});await results
 assert.equal(h.routes.length,1);assert.equal(h.app.globalData.token,'')
 h.app.globalData={token:'isolated-B',expiresAt:4102444800,user:{id:2}};const old=api.request('/items');h.app.globalData={token:'isolated-C',expiresAt:4102444800,user:{id:3}}
 h.requests[2].success({statusCode:401,data:{error:'expired'}});await assert.rejects(old,/切换/);assert.equal(h.app.globalData.token,'isolated-C');assert.equal(h.routes.length,1)
})
test('late anonymous login cannot replace a switched account or persist its credentials',async()=>{
 const h=runtime(),old=h.app.login();await Promise.resolve();await Promise.resolve();h.app.clearSession();h.app.globalData={token:'isolated-B',expiresAt:4102444800,user:{id:2}}
 h.requests[0].success({statusCode:200,data:{token:'isolated-A',expires_at:4102444800,user:{id:1}}});await assert.rejects(old,/切换/);assert.equal(h.app.globalData.user.id,2);assert.equal(h.writes.filter(k=>k.startsWith('palmSession')).length,0)
})
test('all 24 pages share explicit public cards; private report menu does not expose its cover',()=>{
 const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8')),all=[...app.pages,...app.subPackages.flatMap(p=>p.pages.map(n=>p.root+'/'+n))]
 for(const route of all){const h=runtime(),p=h.page(route.split('/')[1]);p.data.report={private:true};p.data.cashAnalysis={private:true};p.data.coverPath='/private/cover.png';p._token=h.app.globalData.token
  const card=p.onShareAppMessage({from:'menu'});assert.equal(card.path,'/pages/items/index',route);assert.equal(card.imageUrl,'/assets/white-doodle/share-fallback.png',route);assert.ok(card.title.includes('猫爪物账'))
 }
 assert.equal(all.length,24)
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
