function(action) {
 const a=getApp(),p=getCurrentPages().slice(-1)[0];
 if(action==='setup'){
  if(a._meOverviewQA)return {active:true};
  const q={globalData:a.globalData,requireSession:a.requireSession,http:wx.cloud.callHTTPFunction,mode:'normal',calls:[],user:{id:990071,username:'微信用户1',avatar_key:'cat'}};
  a._meOverviewQA=q;a.globalData={...a.globalData,token:'isolated-me-overview-fixture',expiresAt:Math.floor(Date.now()/1000)+3600,user:q.user};a.requireSession=()=>true;
  wx.cloud.callHTTPFunction=function(spec){
   const route=spec.path.split('?')[0].replace('/api/mp',''),method=spec.method.toUpperCase();q.calls.push({route,method});
   let statusCode=200,data;
   if(method!=='GET'){statusCode=400;data={error:'本地排版验证禁止写入'};}
   else if(route==='/auth/me')data={user:q.user,account_age_days:128};
   else if(route==='/stats')data={held_items:28,held_purchase_total:'12680.00'};
   else if(route==='/items')data=[];
   else {statusCode=404;data={error:'本地验证未定义此读取'};}
   if(q.mode==='stats-error'&&route==='/stats'){statusCode=503;data={error:'模拟统计读取失败，请重试'};}
   if(q.mode==='profile-error'&&route==='/auth/me'){statusCode=503;data={error:'模拟资料读取失败，请重试'};}
   if(q.mode==='legacy'&&route==='/stats')data={total_items:99,purchase_total:'999999.00'};
   if(q.mode==='legacy'&&route==='/auth/me')data={user:q.user};
   if(q.mode==='empty'&&route==='/stats')data={held_items:0,held_purchase_total:'0.00'};
   if(q.mode==='empty'&&route==='/auth/me')data={user:q.user,account_age_days:1};
   const response={statusCode:200,data:JSON.stringify({palm_http:1,statusCode,data}),header:{}};
   setTimeout(()=>{spec.success?.(response);spec.complete?.(response);},0);return Promise.resolve(response);
  };return {active:true,remoteRequests:0};
 }
 const q=a._meOverviewQA;
 if(action==='restore'){if(q){a.globalData=q.globalData;a.requireSession=q.requireSession;wx.cloud.callHTTPFunction=q.http;delete a._meOverviewQA;}return {restored:true,remoteRequests:0};}
 if(!q)throw Error('No isolated fixture');
 if(action.startsWith('set-mode:')){q.mode=action.slice(9);return {mode:q.mode};}
 if(action.startsWith('mode:')){q.mode=action.slice(5);p.load();p.loadStats();return new Promise(resolve=>setTimeout(()=>resolve({mode:q.mode,heldItems:p.data.heldItems,amount:p.data.heldAmount,days:p.data.accountDays,statsError:p.data.statsError,error:p.data.error}),150));}
 if(action==='rename'){q.user={...q.user,username:'返回后已刷新'};return true;}
 if(action==='back'){const before=getCurrentPages().map(page=>page.route),trace=[];const original=wx.navigateBack;wx.navigateBack=function(spec){trace.push('called');return original.call(wx,{...spec,success:r=>trace.push(r.errMsg),fail:r=>{trace.push(r.errMsg);spec.fail?.(r);},complete:r=>trace.push(r.errMsg)});};try{p.back();}finally{wx.navigateBack=original;}return new Promise(resolve=>setTimeout(()=>resolve({before,trace,after:getCurrentPages().map(page=>page.route)}),300));}
 if(action==='measure')return new Promise(resolve=>{const query=wx.createSelectorQuery().in(p);['.profile-hero','.overview-card','#menu-settings','.logout-button'].forEach(s=>query.select(s).boundingClientRect());query.selectAll('.menu').boundingClientRect();query.exec(r=>resolve({route:p.route,rects:r,heldItems:p.data.heldItems,heldAmount:p.data.heldAmount,accountDays:p.data.accountDays,avatarFailed:p.data.avatarFailed,calls:q.calls}));});
 return {route:p.route,username:p.data.user?.username,heldItems:p.data.heldItems,statsError:p.data.statsError,error:p.data.error};
}
