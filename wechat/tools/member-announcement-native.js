async function(action,value){
 const app=getApp();if(app.globalData.token!=='isolated-native-member')throw Error('Requires offline fixture');
 const settle=async()=>{for(let i=0;i<60;i++){const p=getCurrentPages().slice(-1)[0];if(p&&!p.data.loading){await new Promise(r=>setTimeout(r,150));return p}await new Promise(r=>setTimeout(r,100))}throw Error('Page not ready')};
 if(action==='open'){
  app.globalData.qaState=value.kind||'free';app.onShow({});
  await new Promise((resolve,reject)=>wx.redirectTo({url:'/pages/membership/index',success:resolve,fail:reject}));await settle()
 }
 const p=getCurrentPages().slice(-1)[0];if(p.route!=='pages/membership/index')throw Error('Wrong page');
 if(action==='close')p.closeAnnouncement();
 if(action==='reopen')p.openAnnouncement();
 if(action==='scroll-page')await new Promise(resolve=>wx.pageScrollTo({scrollTop:160,duration:0,complete:resolve}));
 if(action==='account'){app.globalData.user={...app.globalData.user,id:value};p.onShow();await settle()}
 await new Promise(r=>setTimeout(r,150));await p.qaNoticeLayout();
 return {open:p.data.announcementOpen,error:p.data.error,plans:p.data.plans.map(x=>x.id),selected:p.data.selected,active:p.data.membership?.active,promotion:!!p.data.promotion,layout:p.data.qaNoticeLayout}
}