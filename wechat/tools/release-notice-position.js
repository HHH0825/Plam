async function(){
 if(getCurrentPages().slice(-1)[0].route!=='pages/items/index')await new Promise((resolve,reject)=>wx.navigateBack({success:resolve,fail:reject}));
 await new Promise(r=>setTimeout(r,700));
 const p=getCurrentPages().slice(-1)[0],offset=()=>new Promise(resolve=>wx.createSelectorQuery().selectViewport().scrollOffset().exec(r=>resolve(r[0].scrollTop)));
 p.setData({error:'隔离滚动验收，仅用于本地页面位置检查。'.repeat(60)});await new Promise(r=>setTimeout(r,150));
 await new Promise(r=>wx.pageScrollTo({scrollTop:20,duration:0,complete:r}));await new Promise(r=>setTimeout(r,120));const before=await offset();
 p.openUpdateNotice();await new Promise(r=>setTimeout(r,150));p.closeUpdateNotice();await new Promise(r=>setTimeout(r,700));
 const after=await offset();p.setData({error:''});return {before,after,open:p.data.announcementOpen};
}
