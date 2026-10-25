const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module')
function loginHarness(){const file=require.resolve('../miniprogram/pages/login/about'),calls=[];let definition,session=false,login=()=>Promise.resolve(),count=0
 const app={globalData:{token:''},hasSession:()=>session,login:()=>{count++;return login()}},wx={getWindowInfo:()=>({windowWidth:390,windowHeight:753}),switchTab:o=>{calls.push(o.url);o.success?.()}}
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:n=>{if(n.endsWith('/session-navigation')){const m={exports:{}};vm.runInNewContext(fs.readFileSync(createRequire(file).resolve(n),'utf8'),{module:m,wx,getCurrentPages:()=>[]});return m.exports}return createRequire(file)(n)},Page:d=>definition=d,wx,getApp:()=>app})
 const page={...definition,data:{...definition.data},setData(p){Object.assign(this.data,p)}}
 return{page,calls,get count(){return count},session(v){session=v},login(fn){login=fn}}
}
test('about keeps the approved layout and starts recording without requesting credentials',()=>{
 const h=loginHarness();h.page.onLoad();assert.deepEqual(h.calls,[]);h.page.login();assert.equal(h.count,0);assert.deepEqual(h.calls,['/pages/items/index'])
})

test('about remains public even with a current session',()=>{
 const h=loginHarness();h.session(true);h.page.onLoad();assert.deepEqual(h.calls,[]);assert.ok(h.page.data.heroStyle)
})

test('all new login illustrations have independent failure fallbacks without changing authentication',()=>{
 const h=loginHarness();for(const asset of ['title','hero','camera','food','feature','decor']){h.page.assetError({currentTarget:{dataset:{asset}}});assert.equal(h.page.data[asset+'Failed'],true)}h.page.logoError();assert.equal(h.page.data.logoFailed,true);assert.equal(h.count,0)
})
test('approved sources are present, runtime budgets hold and stale geometric sources are retired',()=>{
 const source=path.resolve(__dirname,'../branding/theme-refresh-20261014'),app=path.resolve(__dirname,'../miniprogram')
 for(const [name,limit]of [['welcome',300*1024],['cats',200*1024]]){const manifest=JSON.parse(fs.readFileSync(path.join(source,name+'-manifest.json'),'utf8'));assert.ok(manifest.bytes<=limit);const dir=path.join(app,name==='welcome'?'pages/login/assets':'assets/white-doodle');for(const row of manifest.assets)assert.equal(fs.statSync(path.join(dir,row.name)).size,row.bytes)}
 for(const name of ['hero','title','cat-search','cat-book','cat-camera','cat-sleep'])assert.ok(fs.statSync(path.join(source,name+'-source.png')).size>0)
 for(const name of ['cat-search.svg','cat-book.svg','cat-camera.svg','cat-sleep.png'])assert.equal(fs.existsSync(path.join(app,'assets/white-doodle',name)),false)
 assert.doesNotMatch(fs.readFileSync(path.resolve(__dirname,'../tools/prepare-white-doodle.cjs'),'utf8'),/const cat =|cat\(kind\)|bookBody/)
})
