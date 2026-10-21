async function(action){
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),page=()=>getCurrentPages().slice(-1)[0];let special={};
 if(action==='open'){page().openUpdateNotice();await wait(160)}
 if(action==='close'){
  page().closeUpdateNotice();await wait(80);special={closing:page().data.announcementClosing,flight:page().data.announcementFlightStyle};await wait(650)
 }
 if(action==='filter'){page().openFilters();page().openUpdateNotice();await wait(100)}
 if(action==='filter-close'){page().closeFilters();await wait(80)}
 if(action==='greeting-block'){const f=page().selectComponent('#cat-feedback');f.setData({greetingOpen:true});page().openUpdateNotice();special={blocked:!page().data.announcementOpen};f.setData({greetingOpen:false})}
 if(action==='me'){await new Promise((resolve,reject)=>wx.switchTab({url:'/pages/me/index',success:resolve,fail:reject}));await wait(900)}
 if(action==='items'){await new Promise((resolve,reject)=>wx.switchTab({url:'/pages/items/index',success:resolve,fail:reject}));await wait(900)}
 if(action==='bob'){getApp().globalData.token='isolated-rewards-bob';getApp().globalData.user={...getApp().globalData.user,id:987654311};page().onShow();await wait(700)}
 if(action==='archive'){await new Promise((resolve,reject)=>wx.navigateTo({url:'/pages/disposed/index',success:resolve,fail:reject}));await wait(700)}
 if(action==='back'){await new Promise((resolve,reject)=>wx.navigateBack({success:resolve,fail:reject}));await wait(700)}
 const p=page(),d=p.data;
 const nodes=await new Promise(resolve=>wx.createSelectorQuery().selectAll('#menu-support').boundingClientRect().selectAll('#menu-feedback').boundingClientRect().selectAll('.item-update-entry').boundingClientRect().exec(resolve));
 return {route:p.route,open:d.announcementOpen,unread:d.updateNoticeUnread,noticeTitle:d.updateNotice?.title,filterOpen:d.filterOpen,supportCount:nodes[0].length,feedbackCount:nodes[1].length,entryCount:nodes[2].length,error:d.error,...special};
}
