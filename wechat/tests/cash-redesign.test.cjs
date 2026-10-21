const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{createRequire}=require('node:module')
const a=require('../miniprogram/utils/ledger-analytics'),fixture=require('./fixtures/cash-redesign.cjs'),api=require('../miniprogram/utils/api'),ledger=require('../miniprogram/utils/ledger'),me=require('../miniprogram/utils/me-cash'),destination=require('../miniprogram/utils/ledger-destination'),image=require('../miniprogram/utils/ledger-report-image')
const now='2026-10-14',tick=()=>new Promise(r=>setImmediate(r))
test('cash model reconciles gross refunds net and discoveries using exact cents',()=>{
 const m=a.snapshot(fixture.stats,'2026-10',now);assert.equal(m.summary.expenseText,'3,140.50');assert.equal(m.summary.netText,'2,859.50');assert.equal(m.topCategory,'餐饮');assert.equal(m.topDate,'10月8日');assert.equal(m.cutoff,now);assert.equal(m.rows.reduce((s,r)=>a.add(s,r.gross),'0'),'326850')
 for(const [g,r,i,label,net]of [['0.00','0.00','0.00','本月支出','本月收支持平'],['0.00','20.00','0.00','本月退款结余','本月净收入'],['20.00','5.00','15.00','本月支出','本月收支持平'],['0.00','0.00','80.00','本月支出','本月净收入']]){const x=a.snapshot(fixture.simple(g,r,i),'2026-10',now);assert.equal(x.summary.expense_label,label);assert.equal(x.summary.net_label,net);assert.equal(x.empty,g==='0.00')}
})
test('category grouping and equal amounts follow fixed order without losing large cents',()=>{
 const huge='900719925474099312345.67',raw=fixture.simple(huge,'0.01');let m=a.snapshot(raw,'2026-10',now);assert.equal(m.summary.expenseText,'900,719,925,474,099,312,345.66')
 const keys=['other','study','health','fun','home','shopping','transport','food'];raw.categories=keys.map(key=>({key,name:key,...fixture.totals('1.00')}));raw.summary=fixture.totals('8.00');raw.days=[{date:'2026-10-02',...fixture.totals('4.00')},{date:'2026-10-01',...fixture.totals('4.00')}]
 m=a.snapshot(raw,'2026-10',now);assert.equal(m.rows.length,6);assert.equal(m.rows[5].amountText,'3.00');assert.equal(m.topCategory,'food');assert.equal(m.topDate,'10月1日')
 assert.equal(a.snapshot(fixture.simple('1.00','0.00','0.00','2024-02'),'2024-02',now).cutoff,'2024-02-29')
})
test('malformed missing and inconsistent server fields cannot generate false charts',()=>{
 for(const alter of [r=>delete r.summary.refund,r=>r.categories[0].gross_expense='1.00',r=>r.days[0].date='2026-10-99',r=>r.days[0].date='2026-10-20',r=>r.summary.net_label='本月净支出',r=>r.month='2026-09',r=>r.categories.push(r.categories[0])]){const r=structuredClone(fixture.stats);alter(r);assert.throws(()=>a.snapshot(r,'2026-10',now))}
 assert.equal(a.validMonth('2026-13',now),false);assert.equal(a.validMonth('2026-11',now),false)
})
test('hidden preview export and cover never contain absolute amounts',()=>{
 const m=a.present(a.snapshot(fixture.stats,'2026-10',now),false),ctx={font:'',measureText:s=>({width:[...s].length*18})}
 assert.equal(m.summary.expenseDisplay,'••••');assert.equal(m.rows[0].display,'••••');assert.equal(m.rows[0].ratio>0,true)
 for(const cover of [false,true]){const p=image.plan(ctx,m,cover),texts=p.commands.filter(c=>c.kind==='text').map(c=>c.text).join('\n');assert.doesNotMatch(texts,/3,140|6,000|2,859|1,300|128\.00|¥/);assert.match(texts,/••••/)}
})
test('poster measured layout keeps huge values and long names inside dynamic bounds',()=>{
 const raw=fixture.simple('123456789012345678901234567890.01');raw.categories[0].name='很长的原有分类名称'.repeat(8)
 const m=a.present(a.snapshot(raw,'2026-10',now)),ctx={font:'',measureText(s){return{width:[...s].length*Number(this.font.match(/(\d+)px/)[1])}}},p=image.plan(ctx,m)
 for(const c of p.commands.filter(c=>c.kind==='text')){ctx.font=c.weight+' '+c.size+'px sans-serif';assert.ok(c.x+ctx.measureText(c.text).width<=666);assert.ok(c.y<p.height-20)}assert.ok(p.height>1300)
})
function harness(report=false){
 const original=api.request,render=image.render,oldToday=ledger.today,app={globalData:{token:'A'},requireSession:()=>true},calls=[],files=new Set()
 global.getApp=()=>app;ledger.today=()=>now
 global.wx={showToast:x=>calls.push(x),switchTab:x=>calls.push(x),getFileSystemManager:()=>({access({path,success,fail}){files.has(path)?success():fail()},unlink({filePath}){files.delete(filePath)}}),saveImageToPhotosAlbum:o=>{calls.push(o);o.success({})},showShareImageMenu:o=>{calls.push(o);o.success({})},previewImage:o=>{calls.push(o);o.success({})},canIUse:()=>true}
 api.request=async path=>path==='/auth/me'?{capabilities:{cash_ledger:1}}:path==='/ledger/settings'?{enabled:true}:fixture.stats
 let def;if(report){const f=require.resolve('../miniprogram/pages/ledger-report/index');vm.runInNewContext(fs.readFileSync(f,'utf8'),{require:createRequire(f),Page:d=>def=d,wx:global.wx,getApp:global.getApp,setInterval,clearInterval,Date})}else def={data:me.empty()}
 const p={...def,data:structuredClone(def.data),_visible:true,setData(v,cb){Object.assign(this.data,v);cb?.()}};if(report)p.onLoad({month:'2026-10'})
 image.render=async()=>{const name='temp/'+files.size;files.add(name);return name}
 return {p,app,calls,files,restore(){if(report)p.onUnload();me.stopClock(p);api.request=original;image.render=render;ledger.today=oldToday}}
}
test('personal cash loads independently and distinguishes disabled missing and failed capabilities',async()=>{
 const h=harness();try{await me.load(h.p);assert.deepEqual(h.p.data.cash.map(x=>x.display),['¥3,140.50','¥6,000.00','¥2,859.50']);await me.load(h.p,{capabilities:{}});assert.equal(h.p.data.cashSupported,false);assert.equal(h.p.data.cash,null)
 api.request=async()=>({enabled:false});await me.load(h.p,{capabilities:{cash_ledger:1}});assert.equal(h.p.data.cashEnabled,false);assert.equal(h.p.data.cashError,'')
 api.request=async()=>{throw Error('offline')};await me.load(h.p);assert.equal(h.p.data.cash,null);assert.match(h.p.data.cashError,/offline/)
 }finally{h.restore()}
})
test('personal cash rejects old account and superseded requests and measurements',async()=>{
 const h=harness();try{let resolve;api.request=()=>new Promise(r=>resolve=r);const old=me.load(h.p);h.app.globalData.token='B';resolve({capabilities:{cash_ledger:1}});await old;assert.equal(h.p.data.cash,null)
 h.p.setData({cash:[{display:'¥1.00'}]});let callback;wx.createSelectorQuery=()=>({in(){return this},select(){return this},selectAll(){return this},boundingClientRect(){return this},exec(cb){callback=cb}});me.measure(h.p);me.invalidate(h.p);callback([{width:300},[{dataset:{size:18},width:400}]]);assert.equal(h.p.data.cashLayout.stacked,false)
 }finally{h.restore()}
})
test('one time cash destination is account scoped and consumed once',()=>{
 const h=harness();try{destination.open(h.p);assert.equal(h.calls[0].url,'/pages/statistics/index');assert.equal(destination.take().month,'2026-10');assert.equal(destination.take(),null)
 h.p._cashNavigation=false;destination.open(h.p);h.app.globalData.token='B';assert.equal(destination.take(),null)
 }finally{h.restore()}
})
test('report saves and shares one snapshot and masks invalidate all cached images',async()=>{
 const h=harness(true);try{await h.p.load();await h.p.saveImage();const path=h.p.data.imagePath;await h.p.shareImage();assert.equal(h.p.data.imagePath,path);assert.ok(h.files.has(path))
 h.p.toggleAmounts({detail:{value:false}});assert.equal(h.files.has(path),false);assert.equal(h.p.data.imagePath,'');assert.equal(h.p.data.cashAnalysis.summary.expenseDisplay,'••••')
 await h.p.saveImage();h.app.globalData.token='B';await h.p.saveImage();assert.equal(h.p.data.cashAnalysis,null);assert.equal(h.files.size,0)
 }finally{h.restore()}
})
test('report native preview preserves snapshot; ordinary hide and refresh discard exports',async()=>{
 const h=harness(true);try{await h.p.load();await h.p.preview();const path=h.p.data.imagePath;h.p.onHide();h.p.onShow();assert.equal(h.p.data.imagePath,path);assert.equal(h.p.data.cashAnalysis.month,'2026-10')
 h.p._nativeUntil=0;h.p.onHide();assert.equal(h.p.data.cashAnalysis,null);assert.equal(h.files.size,0);h.p._visible=true;await h.p.load();assert.equal(h.p.data.cashAnalysis.month,'2026-10')
 }finally{h.restore()}
})
test('share fallback is a second explicit card tap and uses generic entry and masked cover',async()=>{
 const h=harness(true);try{await h.p.load();h.p.toggleAmounts({detail:{value:false}});wx.canIUse=()=>false;await h.p.shareImage();assert.equal(h.p.data.shareFallback,true);assert.ok(h.p.data.coverPath);const card=h.p.onShareAppMessage({from:'button'});assert.equal(card.path,'/pages/login/index');assert.equal(card.imageUrl,h.p.data.coverPath);assert.doesNotMatch(card.title,/3,140/)
 }finally{h.restore()}
})
test('cancelled sharing is silent, denied saving is recoverable, and double clicks export once',async()=>{
 const h=harness(true);try{await h.p.load();wx.showShareImageMenu=o=>o.fail({errMsg:'share:fail cancel'});await h.p.shareImage();assert.equal(h.p.data.imageError,'');assert.equal(h.p.data.shareFallback,false)
 wx.saveImageToPhotosAlbum=o=>o.fail({errMsg:'save:fail auth deny'});await h.p.saveImage();assert.match(h.p.data.imageError,/权限/)
 h.p.clearImages();let resolve,n=0;image.render=()=>{n++;return new Promise(r=>resolve=r)};const first=h.p.saveImage();await tick();await h.p.saveImage();assert.equal(n,1);h.p.monthChange({detail:{value:'2026-09'}});resolve('old-month-temp');await first;assert.notEqual(h.p.data.imagePath,'old-month-temp')
 }finally{h.restore()}
})
test('pending report reads cannot survive account changes or newer month requests',async()=>{
 const h=harness(true);try{
  const requests=[];api.request=path=>new Promise(resolve=>requests.push({path,resolve}));const old=h.p.load();h.app.globalData.token='B';requests[0].resolve({capabilities:{cash_ledger:1}});await old;assert.equal(h.p.data.cashAnalysis,null);assert.equal(requests.length,1)
  const first=h.p.load();requests[1].resolve({capabilities:{cash_ledger:1}});await tick();requests[2].resolve({enabled:true});await tick()
  h.p._requested='2026-09';const second=h.p.load();requests[4].resolve({capabilities:{cash_ledger:1}});await tick();requests[5].resolve({enabled:true});await tick();requests[6].resolve(fixture.simple('1.00','0.00','0.00','2026-09'));await second
  requests[3].resolve(fixture.stats);await first;assert.equal(h.p.data.cashAnalysis.month,'2026-09')
 }finally{h.restore()}
})
test('native report return across midnight refreshes instead of reusing yesterday snapshot',async()=>{
 const h=harness(true);try{await h.p.load();await h.p.preview();h.p.onHide();ledger.today=()=> '2026-10-15';h.p.onShow();await tick();await tick();assert.equal(h.p.data.cashAnalysis.cutoff,'2026-10-15');assert.equal(h.p.data.imagePath,'')
 }finally{h.restore()}
})
