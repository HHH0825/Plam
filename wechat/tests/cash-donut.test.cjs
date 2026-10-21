const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module')
const file=require.resolve('../miniprogram/components/cash-donut/index'),source=fs.readFileSync(file,'utf8')
function harness({auto=false,missing=0,size=146,plain=false}={}){
 let definition,token='A',queries=0;const exports=[],removed=[],arcs=[],ctx={scale(){},clearRect(){},beginPath(){},stroke(){},arc(...args){arcs.push(args)}},node={getContext:()=>ctx}
 const wx={getWindowInfo:()=>({pixelRatio:3}),nextTick:queueMicrotask,getFileSystemManager:()=>({unlink(o){removed.push(o.filePath);o.success?.()}}),canvasToTempFilePath(o){exports.push(o);if(auto)queueMicrotask(()=>o.success({tempFilePath:'ring-'+exports.length+'.png'}))}}
 const realRequire=createRequire(file),localRequire=name=>name==='../../utils/photo-edit'?{nativeCall:(name,options,context)=>new Promise((resolve,reject)=>wx[name]({...options,success:resolve,fail:reject},context))}:realRequire(name)
 vm.runInNewContext(source,{require:localRequire,Component:d=>definition=d,wx,getApp:()=>({globalData:{token}})})
 const c={...definition.methods,data:{...definition.data,rows:[{ratio:1,color:'#F4CE63'}],size,plain,amount:'¥8.50'},setData(p,cb){Object.assign(this.data,p);cb?.()},createSelectorQuery(){return {select(){return this},fields(){return this},exec(cb){queries++;cb(queries<=missing?[]:[{node}])}}}}
 return {c,node,exports,removed,arcs,get queries(){return queries},ready(){definition.lifetimes.ready.call(c)},detach(){definition.lifetimes.detached.call(c)},account(t){token=t},flush:()=>new Promise(resolve=>setImmediate(resolve))}
}
test('exports the whole DPR canvas as transparent PNG, with ordinary image presentation',async()=>{
 const h=harness();h.ready();await h.flush();assert.equal(h.node.width,438);assert.equal(h.exports.length,1)
 const o=h.exports[0];assert.equal(o.fileType,'png');assert.equal(o.destWidth,438);assert.equal(o.width,undefined);assert.equal(o.canvas,h.node)
 o.success({tempFilePath:'current.png'});await h.flush();assert.equal(h.c.data.imagePath,'current.png');assert.equal(h.arcs[0][2],146*.37)
 const wxml=fs.readFileSync(file.replace('.js','.wxml'),'utf8'),css=fs.readFileSync(file.replace('.js','.wxss'),'utf8')
 assert.match(wxml,/<image[^>]+cash-donut-image/);assert.equal((wxml.match(/<canvas/g)||[]).length,1);assert.match(css,/\.cash-donut-renderer\{[^}]*position:fixed;left:-10000px/)
})
test('scroll, unchanged rows, amount and privacy-only updates do not regenerate',async()=>{
 const h=harness({auto:true});h.ready();await h.flush()
 for(let i=0;i<20;i++){h.c.data.amount='••••';h.c.data.rows=[{ratio:1,color:'#F4CE63',display:'••••'}];h.c.draw()}
 await h.flush();assert.equal(h.exports.length,1);assert.equal(h.c.data.imagePath,'ring-1.png')
})
test('serializes exports and coalesces rapid changes to the newest request',async()=>{
 const h=harness();h.ready();await h.flush()
 h.c.data.rows=[{ratio:.5,color:'#F2BACD'}];h.c.draw();h.c.data.rows=[{ratio:.3,color:'#A7BE95'}];h.c.draw();await h.flush();assert.equal(h.exports.length,1)
 h.exports[0].success({tempFilePath:'old.png'});await h.flush();assert.equal(h.exports.length,2);assert.deepEqual(h.removed,['old.png']);assert.equal(h.c.data.imagePath,'')
 h.exports[1].success({tempFilePath:'new.png'});await h.flush();assert.equal(h.c.data.imagePath,'new.png');assert.equal(h.c._pending,null)
})
test('account changes and detach reject late image results and release files',async()=>{
 for(const detached of [false,true]){const h=harness();h.ready();await h.flush();if(detached)h.detach();else h.account('B');h.exports[0].success({tempFilePath:'stale.png'});await h.flush();assert.equal(h.c.data.imagePath,'');assert.deepEqual(h.removed,['stale.png'])}
})
test('replacing and detaching clean only component-owned temporary files',async()=>{
 const h=harness({auto:true});h.ready();await h.flush();h.c.data.size=150;h.c.draw();await h.flush();assert.deepEqual(h.removed,['ring-1.png']);assert.equal(h.node.width,450);h.detach();assert.deepEqual(h.removed,['ring-1.png','ring-2.png'])
})
test('missing canvas has bounded retries and can retry after failure',async()=>{
 const h=harness({missing:3,auto:true});h.ready();await h.flush();assert.equal(h.queries,3);assert.equal(h.exports.length,0);assert.equal(h.c.data.renderError,true)
 h.c.draw();await h.flush();assert.equal(h.exports.length,1);assert.equal(h.c.data.renderError,false)
})
test('failed generation preserves amount and failed image events cannot clear newer paths',async()=>{
 const h=harness();h.ready();await h.flush();h.exports[0].fail({errMsg:'export failed'});await h.flush();assert.equal(h.c.data.renderError,true);assert.equal(h.c.data.amount,'¥8.50')
 h.c.draw();await h.flush();h.exports[1].success({tempFilePath:'fresh.png'});await h.flush()
 h.c.imageFailed({currentTarget:{dataset:{path:'old.png'}}});assert.equal(h.c.data.imagePath,'fresh.png')
 h.c.imageFailed({currentTarget:{dataset:{path:'fresh.png'}}});assert.equal(h.c.data.renderError,true);assert.deepEqual(h.removed,['fresh.png'])
})
test('report plain mode preserves export ring proportions; empty rows produce neutral ring',async()=>{
 const h=harness({auto:true,size:138,plain:true});h.c.data.rows=[];h.ready();await h.flush();assert.equal(h.arcs.length,1);assert.equal(h.arcs[0][2],109/2);assert.equal(h.c.data.renderError,false)
 h.c.data.plain=false;h.c.draw();await h.flush();assert.equal(h.exports.length,2);assert.equal(h.arcs[1][2],138*.37)
 const report=fs.readFileSync(require.resolve('../miniprogram/pages/ledger-report/index').replace('.js','.wxml'),'utf8');assert.match(report,/<cash-donut[^>]+plain=/);assert.doesNotMatch(report,/cash-report-preview-ring/)
})
