const test=require('node:test'),assert=require('node:assert/strict')
const fold=require('../miniprogram/utils/tool-fold')
const app={globalData:{token:'alice-session',user:{id:1}}}
const page=route=>({route,data:{accountToolsExpanded:false,memberBookId:'all',memberBooks:[]},setData(p){Object.assign(this.data,p)}})
test('tool groups start folded, persist independently by stable account and page, and never store a token',()=>{
 const store=new Map(),storage={getStorageSync:k=>store.get(k),setStorageSync:(k,v)=>store.set(k,v)},ledger=page('pages/ledger/index'),stats=page('pages/statistics/index')
 fold.restore(ledger,app,storage);fold.restore(stats,app,storage);assert.equal(ledger.data.accountToolsExpanded,false);fold.toggle(ledger,app,storage);assert.equal(stats.data.accountToolsExpanded,false)
 const again=page(ledger.route);fold.restore(again,app,storage);assert.equal(again.data.accountToolsExpanded,true);assert.ok([...store.keys()].every(k=>!k.includes('alice-session')))
 app.globalData={token:'bob-session',user:{id:2}};fold.restore(again,app,storage);assert.equal(again.data.accountToolsExpanded,false)
 app.globalData={token:'alice-renewed',user:{id:1}};fold.restore(again,app,storage);assert.equal(again.data.accountToolsExpanded,true)
})
test('storage failures preserve in-page folding and leave month, book and budget untouched',()=>{
 const storage={getStorageSync(){throw Error('read')},setStorageSync(){throw Error('write')}},p=page('pages/ledger/index');p.data.month='2026-09';p.data.memberBookId='trip';p.data.memberBudget={total:123}
 fold.restore(p,app,storage);fold.toggle(p,app,storage);fold.restore(p,app,storage);assert.equal(p.data.accountToolsExpanded,true);assert.equal(p.data.month,'2026-09');assert.equal(p.data.memberBookId,'trip');assert.equal(p.data.memberBudget.total,123);fold.toggle(p,app,storage);assert.equal(p.data.accountToolsExpanded,false)
})
test('folded labels expose filters and failures without defaulting a failed read to all books',()=>{
 const p=page('pages/statistics/index');fold.hint(p,'error');assert.equal(p.data.accountToolsHint,'账本读取失败');p.data.memberBookId='trip';p.data.memberBooks=[{id:'trip',name:'很长的旅行账本'}];fold.hint(p,'ready');assert.equal(p.data.accountToolsFiltered,true);assert.equal(p.data.accountToolsHint,'很长的旅行账本');fold.hint(p,'error');assert.match(p.data.accountToolsHint,/旅行账本 · 读取失败/)
})
