const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const base=path.resolve(__dirname,'../../test-results/local-builds'),root=path.resolve(__dirname,'../miniprogram'),pages=app=>[...app.pages,...app.subPackages.flatMap(p=>p.pages.map(n=>p.root+'/'+n))]
test('direct local build retains every route and package budget',()=>{
 const source=pages(JSON.parse(fs.readFileSync(path.join(root,'app.json'))))
 for(const variant of ['local']){const project=path.join(base,variant),manifest=JSON.parse(fs.readFileSync(path.join(base,variant+'-manifest.json')));assert.deepEqual(pages(JSON.parse(fs.readFileSync(path.join(project,'app.json')))),source);assert.ok(manifest.sourcePackages.mainBytes<=1450000);assert.ok(manifest.builtPackages.mainBytes<=1450000);for(const page of source)for(const ext of ['js','json','wxml','wxss'])assert.ok(fs.existsSync(path.join(project,page+'.'+ext)),page);assert.equal(manifest.uploaded,false)}
 for(const variant of ['local']){assert.doesNotMatch(fs.readFileSync(path.join(base,variant,'pages/me/index.wxml'),'utf8'),/menu-rewards/);assert.equal(fs.existsSync(path.join(base,variant,'assets/rewards/wallet-cat.png')),false)}
})
test('final local dependency graph contains no business network, login, payment or invitation implementation',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(base,'local-manifest.json')))
 for(const row of manifest.files.filter(r=>r.name.endsWith('.js'))){const text=fs.readFileSync(path.join(base,'local-source',row.name),'utf8');assert.doesNotMatch(text,/wx\.(?:cloud|login|request|uploadFile|downloadFile|requestPayment|requestVirtualPayment)\b|Bearer\s|session_token|CLOUDBASE_ENV_ID/,row.name)}
 for(const name of ['utils/cloud-http.js','utils/photo-transfer.js','pages/membership/lib/virtual-payment.js','pages/local-data/lib/cloud-migration.js'])assert.ok(!manifest.files.some(r=>r.name===name),name)
 for(const name of ['pages/me/index.wxml','pages/local-data/index.wxml','components/cat-feedback/index.wxml'])assert.doesNotMatch(fs.readFileSync(path.join(base,'local-source',name),'utf8'),/签到|打卡|bindtap="checkin"|bindtap="goCheckin"/);
 assert.equal(manifest.publicationMode,'direct-local');assert.equal(manifest.automaticCloudMigration,false);assert.doesNotMatch(fs.readFileSync(path.join(base,'local-source/pages/local-data/index.wxml'),'utf8'),/迁移|旧云端|快照/);
 const config={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(base,'local','config.js'),'utf8'),{module:config});assert.equal(config.exports.LOCAL_BUILD,'local')
})
test('final local startup waits for durable data without touching a cloud session',async()=>{
 let definition,read=0,request=0,resolveOpen
 const pending=new Promise(resolve=>resolveOpen=resolve),runtime={open(){return pending}},wx={getStorageSync(){throw Error('must not read credentials')},cloud:new Proxy({},{get(){throw Error('cloud SDK forbidden')}}),login(){throw Error('login forbidden')},request(){request++;throw Error('network forbidden')}}
 vm.runInNewContext(fs.readFileSync(path.join(base,'local-source/app.js'),'utf8'),{App:d=>definition=d,wx,require:n=>{assert.equal(n,'./local-core/runtime');return runtime},setTimeout,clearTimeout})
 const app={...definition,globalData:{...definition.globalData}};app.onLaunch();assert.equal(app._sessionPhase,'connecting');assert.equal(app.requireSession(),false)
 resolveOpen({business:{async request(p){read++;assert.equal(p,'/auth/me');return {user:{id:1,username:'本机'}}}}});await app.ensureSession();assert.equal(app._sessionPhase,'ready');assert.equal(app.globalData.user.username,'本机');assert.equal(app.requireSession(),true);assert.equal(read,1);assert.equal(request,0)
})
