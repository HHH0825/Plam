async function(action){
 const app=getApp();if(!app.globalData.token.startsWith('isolated-rewards-'))throw Error('Offline-only verification');
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),page=()=>getCurrentPages().slice(-1)[0];
 const tab=async n=>{await new Promise((resolve,reject)=>wx.switchTab({url:'/pages/'+n+'/index',success:resolve,fail:reject}));await wait(650)};
 const go=async url=>{await new Promise((resolve,reject)=>wx.navigateTo({url,success:resolve,fail:reject}));await wait(700)};
 if(action==='session-state')return{route:page().route,session:app.hasSession(),user:app.globalData.user,heroFailed:page().data.heroFailed,busy:page().data.busy||false,calls:app.globalData.qaLoginCalls};
 if(action==='benefits-state'){const d=page().data;return{route:page().route,free:d.freeFeatures?.length||0,member:d.memberFeatures?.length||0,error:d.catalogError||d.error||'',loading:!!d.catalogLoading,plans:d.membership?.plans?.length||0}}
 if(action==='guest-state'){const p=page();return{route:p.route,image:p.data.qaHeroMeta||{passed:false},heroFailed:p.data.heroFailed,error:p.data.error}}
 if(action==='guest'){
  app.globalData.qaSession=false;app.globalData.qaLoginCalls=0;app.globalData.qaLoginFail=false;app.hasSession=()=>app.globalData.qaSession;
  app.clearSession=()=>{app.globalData.qaSession=false;app.globalData.token='isolated-rewards-signedout';app.globalData.user=null};
  app.login=async()=>{app.globalData.qaLoginCalls=(app.globalData.qaLoginCalls||0)+1;if(app.globalData.qaLoginFail)throw Error('离线登录失败，请重试');app.globalData.qaSession=true;app.globalData.token='isolated-rewards-quality';app.globalData.user={id:8123,username:'离线验收',avatar_key:'cat'}};
  if(page().route!=='pages/login/index'){wx.navigateTo({url:'/pages/login/index'});await wait(900)}const p=page();for(let i=0;i<20&&!p.data.qaHeroMeta;i++)await wait(100);const image=p.data.qaHeroMeta||{passed:false,error:'Native image load event has not fired'};return{route:p.route,image,heroFailed:p.data.heroFailed,error:p.data.error};
 }
 if(action==='login-failure'){app.globalData.qaLoginFail=true;await page().login();return{route:page().route,error:page().data.error,busy:page().data.busy,calls:app.globalData.qaLoginCalls}}
 if(action==='login-success'){app.globalData.qaLoginFail=false;const p=page();await p.login();await wait(750);return{route:page().route,busy:p.data.busy,session:app.hasSession(),calls:app.globalData.qaLoginCalls}}
 if(action==='existing'){wx.navigateTo({url:'/pages/login/index'});await wait(2500);return{route:page().route,session:app.hasSession()}}
 if(action==='expired'){app.globalData.qaSession=false;await new Promise((resolve,reject)=>wx.reLaunch({url:'/pages/login/index',success:resolve,fail:reject}));await wait(450);return{route:page().route,session:app.hasSession(),heroFailed:page().data.heroFailed}}
 if(action==='logout'){app.globalData.qaSession=true;app.globalData.user={id:8123,username:'离线验收',avatar_key:'cat'};await tab('me');await page().logout();await wait(550);return{route:page().route,session:app.hasSession(),user:app.globalData.user,heroFailed:page().data.heroFailed}}
 if(action==='benefits'){
  app.globalData.qaSession=true;app.globalData.qaState='active';app.globalData.user={id:8123,username:'离线验收',avatar_key:'cat'};await tab('me');await go('/pages/membership/index');const p=page();if(p.data.announcementOpen){p.closeAnnouncement();await wait(700)}p.compareBenefits();return{requested:true};
 }
 if(action==='return'){page().returnMembership();return{requested:true}}
 throw Error('Unknown quality action');
}
