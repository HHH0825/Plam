async function(action,value){
 const app=getApp();if(!app._qaOffline)throw Error('Requires guarded offline project')
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),page=()=>getCurrentPages().slice(-1)[0]
 const route=async name=>{for(let i=0;i<60;i++){if(page()?.route===name)return;await pause(100)}throw Error('Route did not open')};
 const settle=async()=>{for(let i=0;i<60;i++){if((!page()?.data.loading||app._sessionPhase==='error')&&!app._loginAttempt){await pause(150);return}await pause(100)}throw Error('Offline page did not settle')}
 if(action==='mode'){app.clearSession();app._qaMode=value;await new Promise((resolve,reject)=>wx.reLaunch({url:'/pages/items/index',success:resolve,fail:reject}));await pause(450);if(value!=='loading')await settle()}
 if(action==='retry'){app._qaMode='ready';page().retrySession();await settle()}
 if(action==='about'){await new Promise((resolve,reject)=>wx.switchTab({url:'/pages/me/index',success:resolve,fail:reject}));await settle();page().about();await route('pages/login/about');await pause(250)}
 if(action==='profile'){await new Promise((resolve,reject)=>wx.navigateTo({url:'/pages/profile/index',success:resolve,fail:reject}));await route('pages/profile/index');await settle()}
 if(action==='profile-recovery'){
  page().nameInput({detail:{value:'连接恢复后保留的填写'}});app._qaMode='failure';try{await app.recoverSession(app.globalData.token,app.globalData.accessToken)}catch(_){}
  await pause(100);if(page().data.name!=='连接恢复后保留的填写')throw Error('Profile input lost');app._qaMode='ready';page().retrySession();await settle()
 }
 if(action==='bottom'){await new Promise(r=>wx.pageScrollTo({scrollTop:99999,duration:0,complete:r}));await pause(200)}
 const p=page(),window=wx.getWindowInfo()
 return {offline:app._qaOffline,route:p.route,phase:app._sessionPhase,blocked:!!p.data.entryBlocked,connectionBlocked:!!p.data.sessionBlocked,busy:!!p.data.sessionBusy,error:p.data.sessionError||p.data.error||'',loaded:p.data.loaded,name:p.data.name,navHidden:p.getTabBar?.()?.data.hidden,viewport:{width:window.windowWidth,height:window.windowHeight}}
}
