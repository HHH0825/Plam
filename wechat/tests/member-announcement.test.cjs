const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs')
function harness(){
 const memory=new Map(),writes=[],app={globalData:{token:'secret-a',user:{id:1}}};let env='test'
 const storage={getStorageSync:k=>memory.get(k),setStorageSync:(k,v)=>{memory.set(k,v);writes.push(k)}}
 const ctx={module:{exports:{}},getApp:()=>app,wx:storage,require:()=>({serviceScope:()=>env})}
 vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/pages/membership/lib/member-announcement'),'utf8'),ctx)
 const page=()=>({data:{membership:{supported:true},promotion:{description:'公告'},feedbackMessage:'感谢支持',loading:false,error:'',announcementOpen:false},setData(p){Object.assign(this.data,p)}})
 return {notice:ctx.module.exports,app,storage,memory,writes,page,env:v=>env=v}
}
test('only an explicit close persists an acknowledgement, new page remains quiet and manual reopening works',()=>{
 const h=harness(),p=h.page();h.notice.present(p);assert.equal(p.data.announcementOpen,true);assert.equal(h.writes.length,0)
 h.notice.close(p);assert.equal(p.data.announcementOpen,false);assert.equal(h.writes.length,1);assert.ok(!h.writes[0].includes('secret'))
 const next=h.page();h.notice.present(next);assert.equal(next.data.announcementOpen,false);h.notice.open(next);assert.equal(next.data.announcementOpen,true)
})
test('account, environment and stale close events are isolated',()=>{
 const h=harness(),p=h.page();h.notice.present(p);h.app.globalData={token:'secret-b',user:{id:2}};h.notice.close(p);assert.equal(h.writes.length,0);assert.equal(p.data.announcementOpen,false)
 h.notice.present(p);assert.equal(p.data.announcementOpen,true);h.notice.close(p)
 h.app.globalData={token:'secret-a',user:{id:1}};h.notice.present(p);assert.equal(p.data.announcementOpen,true);h.notice.close(p)
 h.env('other');h.notice.present(p);assert.equal(p.data.announcementOpen,true)
})
test('storage failures still allow closing without repeated automatic openings in this session',()=>{
 const h=harness(),bad={getStorageSync(){throw Error('storage')},setStorageSync(){throw Error('storage')}};const p=h.page();h.notice.present(p,h.app,bad);h.notice.close(p,h.app,bad);h.notice.present(h.page(),h.app,bad);assert.equal(p.data.announcementOpen,false);const next=h.page();h.notice.present(next,h.app,bad);assert.equal(next.data.announcementOpen,false);h.notice.open(next);assert.equal(next.data.announcementOpen,true)
})
test('missing identity or unreadable/unsupported content is never acknowledged',()=>{
 const h=harness(),p=h.page();p.data.membership={supported:false};h.notice.present(p);assert.equal(p.data.announcementOpen,false);h.notice.close(p);assert.equal(h.writes.length,0)
 p.data.membership={supported:true};h.app.globalData.user=null;h.notice.present(p);assert.equal(p.data.announcementOpen,false)
 h.app.globalData.user={id:1};h.notice.present(p);assert.equal(p.data.announcementOpen,true)
 p.data.promotion=null;p.data.feedbackMessage='';h.notice.present(p);assert.equal(p.data.announcementOpen,false);h.notice.close(p);assert.equal(h.writes.length,0)
})


test('a new announcement version is unread and a stale close cannot acknowledge it',()=>{
 const h=harness(),p=h.page();p.data.announcementId='previous';h.notice.present(p);h.notice.close(p);
 p.data.announcementId='free-tools-month-290-v1';h.notice.close(p);assert.equal(h.writes.length,1);h.notice.present(p);assert.equal(p.data.announcementOpen,true);h.notice.close(p);assert.equal(h.writes.length,2);assert.ok(h.writes[1].endsWith(':free-tools-month-290-v1'))
})
