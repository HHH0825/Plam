const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs')
function harness(){
 let queryCallback,now=0,serial=0;const timers=new Map(),app={globalData:{token:'alice'}},p={_visible:true,_announcementKey:'test:1',data:{announcementOpen:true},setData(v){Object.assign(this.data,v)}};let closes=0
 const chain={in(){return this},select(){return this},boundingClientRect(){return this},exec(cb){queryCallback=cb}}
 const ctx={module:{exports:{}},getApp:()=>app,wx:{createSelectorQuery:()=>chain,getWindowInfo:()=>({windowHeight:800})},setTimeout:(f,ms)=>{const id=++serial;timers.set(id,{f,at:now+ms});return id},clearTimeout:id=>timers.delete(id)}
 vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/utils/member-announcement-motion'),'utf8'),ctx)
 return {motion:ctx.module.exports,p,app,close:()=>{closes++;p.setData({announcementOpen:false})},closes:()=>closes,query:r=>queryCallback(r),tick(ms){const target=now+ms;while(true){const item=[...timers].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!item)break;now=item[1].at;timers.delete(item[0]);item[1].f()}now=target},timers}
}
const panel={left:16,top:180,width:358,height:480},icon={left:245,top:40,width:32,height:32}
test('close measures the real icon, folds once, then acknowledges and pulses on arrival',()=>{
 const h=harness();h.motion.close(h.p,h.close);h.motion.close(h.p,h.close);h.query([panel,icon]);assert.equal(h.p.data.announcementClosing,true);assert.match(h.p.data.announcementFlightStyle,/--notice-dx:66px/);assert.match(h.p.data.announcementFlightStyle,/--notice-dy:-364px/);assert.equal(h.closes(),0)
 h.tick(559);assert.equal(h.p.data.announcementOpen,true);h.tick(1);assert.equal(h.closes(),1);assert.equal(h.p.data.announcementOpen,false);assert.equal(h.p.data.announcementPulse,true);h.tick(360);assert.equal(h.p.data.announcementPulse,false)
})
test('missing, malformed, offscreen or stalled measurements close safely without scrolling',()=>{
 for(const rects of [[],[panel,{...icon,top:-50}],[panel,{...icon,left:NaN}],[panel,{...icon,top:790}]]){
  const h=harness();h.motion.close(h.p,h.close);h.query(rects);assert.equal(h.closes(),1);assert.equal(h.p.data.announcementClosing,false);h.tick(1000);assert.equal(h.closes(),1)
 }
 const h=harness();h.motion.close(h.p,h.close);h.tick(200);assert.equal(h.closes(),1);h.query([panel,icon]);assert.equal(h.closes(),1)
})
test('leaving during an explicit close acknowledges once and cancels pending work',()=>{
 const h=harness();h.motion.close(h.p,h.close);h.query([panel,icon]);h.p._visible=false;h.motion.cancel(h.p);h.tick(1000);assert.equal(h.closes(),1);assert.equal(h.timers.size,0);assert.equal(h.p.data.announcementPulse,false)
})
test('account changes reject old callbacks and never acknowledge the other account',()=>{
 const h=harness();h.motion.close(h.p,h.close);h.app.globalData.token='bob';h.p._announcementKey='test:2';h.motion.cancel(h.p);h.query([panel,icon]);h.tick(1000);assert.equal(h.closes(),0);assert.equal(h.p.data.announcementClosing,false)
})

test('update notice offscreen and reduced-motion closes use a short fade without affecting member defaults',()=>{
 const h=harness();h.motion.close(h.p,h.close,{fadeFallback:true});h.query([panel,{...icon,top:-50}]);assert.equal(h.p.data.announcementFading,true);assert.equal(h.p.data.announcementOpen,true);assert.equal(h.p.data.announcementFlightStyle,'');h.tick(119);assert.equal(h.closes(),0);h.tick(1);assert.equal(h.closes(),1)
 const reduced=harness();reduced.motion.close(reduced.p,reduced.close,{fadeFallback:true,reducedMotion:true});assert.equal(reduced.p.data.announcementFading,true);reduced.tick(120);assert.equal(reduced.closes(),1)
 const stalled=harness();stalled.motion.close(stalled.p,stalled.close,{fadeFallback:true});stalled.tick(200);stalled.query([panel,icon]);assert.equal(stalled.p.data.announcementFading,true);stalled.tick(120);assert.equal(stalled.closes(),1)
})
