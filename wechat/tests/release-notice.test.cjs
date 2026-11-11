const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
function harness(storage=new Map(),content={id:'first-release-v1',title:'初次见面，喵～',paragraphs:['这是第一版，感谢使用。']}){
 const app={globalData:{token:'token-alice',user:{id:1}}},module={exports:{}},writes=[],tabs=[],callbacks=[];let env='isolated-a',failRead=false,failWrite=false,defer=false,feedback={}
 const motion={cancel(p){p.setData({announcementOpen:false,announcementBusy:false,announcementClosing:false})},close(p,done){done()}}
 vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/utils/release-notice'),'utf8'),{module,exports:module.exports,getApp:()=>app,require:n=>n==='./release-notice-content'?content:n==='./member-announcement-motion'?motion:n==='./cloud-transport'?{serviceScope:()=>env}:{setTabBarHidden:(_p,v)=>tabs.push(v)},wx:{getStorageSync:k=>{if(failRead)throw Error('storage unavailable');return storage.get(k)},setStorageSync:(k,v)=>{if(failWrite)throw Error('storage full');writes.push([k,v]);storage.set(k,v)}}})
 const definition=module.exports.wrap({data:{filterOpen:false,searchFocus:false},openFilters(){this.setData({filterOpen:true})}})
 const p={...definition,data:structuredClone(definition.data),setData(v,cb){Object.assign(this.data,v);if(cb){if(defer)callbacks.push(cb);else cb()}},selectComponent:()=>({data:feedback})}
 return{p,app,content,storage,writes,tabs,valid:module.exports.valid,show:()=>p.onShow(),defer:v=>defer=v,flush:()=>callbacks.splice(0).forEach(fn=>fn()),env:v=>env=v,failRead:v=>failRead=v,failWrite:v=>failWrite=v,feedback:v=>feedback=v}
}
test('entering items only shows an unread badge; successfully rendered content acknowledges it',()=>{
 const h=harness();h.show();assert.equal(h.p.data.updateNoticeUnread,true);assert.equal(h.p.data.announcementOpen,false);assert.equal(h.writes.length,0)
 h.defer(true);h.p.openUpdateNotice();assert.equal(h.p.data.updateNoticeUnread,true);assert.equal(h.writes.length,0);h.flush();assert.equal(h.p.data.updateNoticeUnread,false);assert.equal(h.writes.length,1);assert.equal(h.writes[0][1],true);assert.doesNotMatch(h.writes[0][0],/token-alice|palmMemberAnnouncement/)
 h.p.closeUpdateNotice();h.p.openUpdateNotice();assert.equal(h.p.data.announcementOpen,true);h.flush();assert.equal(h.p.data.updateNoticeUnread,false)
})
test('read receipts survive restarts and isolate users, environments and content IDs',()=>{
 const store=new Map(),first=harness(store);first.show();first.p.openUpdateNotice();const next=harness(store);next.show();assert.equal(next.p.data.updateNoticeUnread,false)
 next.app.globalData={token:'token-bob',user:{id:2}};next.show();assert.equal(next.p.data.updateNoticeUnread,true);assert.equal(next.p.data.announcementOpen,false)
 next.env('isolated-b');next.show();assert.equal(next.p.data.updateNoticeUnread,true);next.p.openUpdateNotice();next.p.closeUpdateNotice();next.content.paragraphs=['修改同一公告的措辞'];next.show();assert.equal(next.p.data.updateNoticeUnread,false)
 next.content.id='second-release-v1';next.show();assert.equal(next.p.data.updateNoticeUnread,true)
})
test('storage failures keep this session read without storing credentials or message content',()=>{
 const h=harness();h.failRead(true);h.failWrite(true);h.show();h.p.openUpdateNotice();assert.equal(h.p.data.updateNoticeUnread,false);h.p.onHide();h.show();assert.equal(h.p.data.updateNoticeUnread,false);assert.equal(h.writes.length,0)
 const next=harness(h.storage);next.show();assert.equal(next.p.data.updateNoticeUnread,true)
 const restored=harness(new Map([['palmUpdateNotice:v1:isolated-a:1:first-release-v1',true]]));restored.show();restored.failRead(true);restored.show();assert.equal(restored.p.data.updateNoticeUnread,false)
})
test('failed configuration, leaving before render and switching accounts never acknowledge old content',()=>{
 const h=harness();h.show();h.defer(true);h.p.openUpdateNotice();h.p.onHide();h.flush();assert.equal(h.writes.length,0)
 h.show();h.p.openUpdateNotice();h.app.globalData={token:'bob',user:{id:2}};h.show();h.flush();assert.equal(h.writes.length,0);assert.equal(h.p.data.updateNoticeUnread,true);assert.equal(h.p.data.announcementOpen,false)
 for(const content of [{id:'x',title:'',paragraphs:['x']},{id:'bad id',title:'x',paragraphs:['x']},{id:'x',title:'x',paragraphs:[]}]){const bad=harness(new Map(),content);bad.show();bad.p.openUpdateNotice();assert.equal(bad.p.data.updateNotice,null);assert.equal(bad.writes.length,0)}
})
test('update notice and filters, greetings, capacity prompts or focused input never overlap',()=>{
 const h=harness();h.show();h.p.data.filterOpen=true;h.p.openUpdateNotice();assert.equal(h.p.data.announcementOpen,false);h.p.data.filterOpen=false
 for(const feedback of [{greetingOpen:true},{capacityOpen:true}]){h.feedback(feedback);h.p.openUpdateNotice();assert.equal(h.p.data.announcementOpen,false)}
 h.feedback({});h.p.data.searchFocus=true;h.p.openUpdateNotice();assert.equal(h.p.data.announcementOpen,false);h.p.data.searchFocus=false;h.p.openUpdateNotice();h.p.openFilters();assert.equal(h.p.data.filterOpen,false);assert.equal(h.p.data.announcementOpen,true)
 h.p.onHide();assert.equal(h.p.data.announcementOpen,false);assert.equal(h.tabs.at(-1),false)
})

test('direct local apology notice opens once on entry, remains readable, and never acknowledges a hidden page',async()=>{
 const content={...require('../miniprogram/utils/release-notice-content')},h=harness(new Map(),content);h.app.globalData.localMode=true
 h.show();assert.equal(h.p.data.announcementOpen,false);await Promise.resolve();assert.equal(h.p.data.announcementOpen,true);assert.equal(h.p.data.updateNoticeUnread,false)
 h.p.closeUpdateNotice();h.p.onHide();h.show();await Promise.resolve();assert.equal(h.p.data.announcementOpen,false);h.p.openUpdateNotice();assert.equal(h.p.data.announcementOpen,true)
 const hidden=harness(new Map(),{...content,id:'shutdown-hidden'});hidden.show();hidden.p.onHide();await Promise.resolve();assert.equal(hidden.writes.length,0)
 const text=content.paragraphs.join('');assert.match(text,/朋友还不多/);assert.match(text,/这次切换不迁移原云端资料/);assert.match(text,/真诚道歉/);assert.match(text,/完全免费/);assert.doesNotMatch(text,/确认迁移|关停日期会另行通知|已经删除|已销毁/);assert.match(text,/只保存在你当前手机/);assert.match(text,/小程序之外/)
})
