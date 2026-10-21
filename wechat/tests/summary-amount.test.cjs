const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module')
require('./local-config.cjs')
const {compactMoney}=require('../miniprogram/utils/compact-money'),layout=require('../miniprogram/utils/summary-layout')
for(const [input,expected]of [['0.00','¥0.00'],['9999.99','¥9,999.99'],['10000.00','约 ¥1.00万'],['17551.90','约 ¥1.76万'],['10049.99','约 ¥1.00万'],['10050.00','约 ¥1.01万'],['99999949.99','约 ¥9999.99万'],['99999950.00','约 ¥1.00亿'],['100000000.00','约 ¥1.00亿'],['100500000.00','约 ¥1.01亿'],['900719925474099350000.00','约 ¥9007199254740.99亿'],['999999999999999999999999.99','约 ¥10000000000000000.00亿'],[undefined,'—']])test('exact decimal abbreviation '+input,()=>assert.equal(compactMoney(input).display,expected))
test('monthly measures each size before stacking or scrolling without truncating',()=>{
 const probes={26:{width:180},24:{width:160},22:{width:145},20:{width:130}}
 assert.deepEqual(layout.chooseMonthly(278,64,probes),{kind:'columns',size:26,height:40,scroll:false})
 assert.deepEqual(layout.chooseMonthly(248,64,probes),{kind:'columns',size:22,height:34,scroll:false})
 assert.deepEqual(layout.chooseMonthly(210,64,probes),{kind:'stacked',size:20,height:31,scroll:false})
 assert.deepEqual(layout.chooseMonthly(140,64,probes),{kind:'stacked',size:20,height:31,scroll:true})
})
test('overview preserves three columns, then gives amount its own row',()=>{
 const probes={20:{width:140},18:{width:126},16:{width:112},count:{width:40},days:{width:40}}
 assert.deepEqual(layout.chooseOverview(350,probes),{kind:'columns',size:18,height:29,scroll:false})
 assert.deepEqual(layout.chooseOverview(260,probes),{kind:'stacked',size:20,height:31,scroll:false})
 assert.deepEqual(layout.chooseOverview(260,{...probes,20:{width:350}}),{kind:'stacked',size:20,height:31,scroll:true})
})
function harness(){
 const pending=[],modals=[],app={globalData:{token:'A'},requireSession:()=>true},file=require.resolve('../miniprogram/pages/me/index'),real=createRequire(file);let definition
 const wx={showModal:o=>modals.push(o)},deps={'../../utils/api':{request:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))}}
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:n=>deps[n]||real(n),Page:d=>definition=d,wx,getApp:()=>app})
 const bar={hidden:false,setData(d){Object.assign(this,d)}},page={...definition,getTabBar:()=>bar,data:structuredClone(definition.data),setData(p,cb){Object.assign(this.data,p);cb?.()}};page.onLoad();page._visible=true
 return{page,pending,modals,app,bar}
}
test('Me preserves exact overview during refresh failure and blocks stale dialogs and old accounts',async()=>{
 const h=harness(),p=h.page;let read=p.loadStats();h.pending[0].resolve({held_items:6,held_purchase_total:'17551.90'});await read
 assert.equal(p.data.heldAmount,'17,551.90');assert.equal(p.data.heldAmountDisplay,'约 ¥1.76万');p.amountInfo()
 assert.equal(p.data.amountDialog,true);assert.equal(p.data.heldAmount,'17,551.90');assert.equal(h.bar.hidden,true);p.closeAmount();assert.equal(h.bar.hidden,false)
 read=p.loadStats();p.amountInfo();assert.equal(p.data.amountDialog,false);assert.equal(p.data.heldAmount,'17,551.90')
 h.pending[1].reject(Error('network'));await read;assert.equal(p.data.heldAmountDisplay,'约 ¥1.76万');p.amountInfo();assert.equal(p.data.amountDialog,false)
 read=p.loadStats();h.pending[2].resolve({held_items:0,held_purchase_total:'0.00'});await read;p.amountInfo();assert.equal(p.data.amountDialog,true);assert.equal(p.data.heldAmount,'0.00')
 h.app.globalData.token='B';p.amountInfo();assert.equal(p.data.amountDialog,false);assert.equal(p.data.heldAmountDisplay,'—')
 p.onHide();assert.equal(p.data.heldAmount,'—');assert.equal(p.data.heldAmountCompact,false)
})
test('old backend and late stats cannot enable full-amount viewer',async()=>{
 const h=harness(),p=h.page;let read=p.loadStats();h.pending[0].resolve({total_items:20,purchase_total:'500.00'});await read;p.amountInfo();assert.equal(p.data.amountDialog,false)
 read=p.loadStats();p.onHide();h.pending[1].resolve({held_items:20,held_purchase_total:'100000.00'});await read;assert.equal(p.data.heldAmountDisplay,'—')
})
test('late layout measurements are rejected after account, request or visibility changes',()=>{
 const originalWx=global.wx,originalApp=global.getApp
 try{let finish;const app={globalData:{token:'A'}},p={_visible:true,_statsSequence:1,data:{amountLayout:layout.DEFAULT_OVERVIEW},setData(d){Object.assign(this.data,d)}}
 global.getApp=()=>app;global.wx={createSelectorQuery:()=>{const q={in:()=>q,select:()=>q,selectAll:()=>q,boundingClientRect:()=>q,exec:f=>{finish=f}};return q}}
 const rects=[{width:320},null,[{dataset:{size:20},width:40}]]
 for(const mutate of [()=>app.globalData.token='B',()=>p._statsSequence++,()=>p._visible=false]){
  app.globalData.token='A';p._visible=true;const before=p.data.amountLayout;layout.measureSummary(p,'overview');mutate();finish(rects);assert.equal(p.data.amountLayout,before)
 }
 }finally{global.wx=originalWx;global.getApp=originalApp}
})

test('measured font height expands amount row for large text',()=>{
 const probes={26:{width:110,height:54},20:{width:120,height:45},count:{width:40},days:{width:40}}
 assert.equal(layout.chooseMonthly(278,64,probes).height,57)
 assert.equal(layout.chooseOverview(350,probes).height,48)
})

test('incomplete legacy statistics keep the amount viewer disabled',async()=>{
 const h=harness(),read=h.page.loadStats();h.pending[0].resolve({held_purchase_total:'17551.90'});await read
 assert.equal(h.page.data.statsCompatible,false);h.page.amountInfo();assert.equal(h.page.data.amountDialog,false)
})
