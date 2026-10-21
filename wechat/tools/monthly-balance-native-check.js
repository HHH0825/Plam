function(action,payload){
 const a=getApp(),p=getCurrentPages().slice(-1)[0];
 if(action==='setup'){
  if(a._monthlyBalanceQA)throw Error('Monthly fixture already active');
  const q={globalData:a.globalData,requireSession:a.requireSession,http:wx.cloud.callHTTPFunction,preview:wx.previewImage,setStorage:wx.setStorageSync,storage:new Map(),calls:[],samples:JSON.parse(payload),key:'recovery',previews:[]};
  a._monthlyBalanceQA=q;a.globalData={...a.globalData,token:'isolated-monthly-balance',expiresAt:Math.floor(Date.now()/1000)+3600,user:{id:990999,username:'本地月报验证',avatar_key:'cat'}};a.requireSession=()=>true;
  wx.setStorageSync=function(key,value){if(!q.storage.has(key))q.storage.set(key,wx.getStorageSync(key));return q.setStorage.call(wx,key,value)};
  wx.previewImage=function(o){q.previews.push(o.current);o.success?.({});o.complete?.({});};
  wx.cloud.callHTTPFunction=function(spec){const route=spec.path.split('?')[0].replace('/api/mp',''),method=(spec.method||'GET').toUpperCase();q.calls.push({route,method});let statusCode=200,data;
   if(method!=='GET'){statusCode=403;data={error:'本地验证禁止写入'};}
   else if(route==='/reports/monthly'){const report=q.samples.find(s=>s.key===q.key)?.report,month=spec.path.match(/[?&]month=([\d-]+)/)?.[1]||report?.month;if(!report){statusCode=500;data={error:'隔离样本未找到 '+q.key};}else data={...report,month,is_current:month===report.month};}
   else if(route==='/stats')data={total_items:0,net_cost_total:'0.00',purchase_total:'0.00',maintenance_total:'0.00',disposal_total:'0.00'};
   else if(route==='/insights')data={analysis_cards:[],months:[]};
   else if(route==='/items')data=[];
   else if(route==='/auth/me')data={user:a.globalData.user};
   else{statusCode=404;data={error:'未定义的隔离读取'};}
   const response={statusCode:200,data:JSON.stringify({palm_http:1,statusCode,data}),header:{}};setTimeout(()=>{spec.success?.(response);spec.complete?.(response)},0);return Promise.resolve(response);
  };return{fixtureOnly:true};
 }
 const q=a._monthlyBalanceQA;
 if(action==='restore'){
  if(q){for(const[key,value]of q.storage){if(value==='')wx.removeStorageSync(key);else q.setStorage.call(wx,key,value)}wx.setStorageSync=q.setStorage;wx.cloud.callHTTPFunction=q.http;wx.previewImage=q.preview;a.globalData=q.globalData;a.requireSession=q.requireSession;delete a._monthlyBalanceQA;}return{fixture:false};
 }
 if(!q)throw Error('No monthly fixture');
 if(action==='case'){q.key=payload;return p.route==='pages/insights/index'?p.loadMonthly():p.load();}
 if(action==='inspect')return{route:p.route,balance:(p.data.edition||p.data.monthly?.page)?.balance,month:p.data.month,report:p.data.report||p.data.monthly,error:p.data.error||p.data.monthlyError,calls:q.calls,imageKey:p._imageKey,previews:q.previews.length,samples:q.samples?.map(s=>s.key),key:q.key};
 if(action==='scroll')return new Promise(resolve=>wx.pageScrollTo({selector:payload,duration:0,complete:()=>setTimeout(()=>resolve(true),120)}));
 if(action==='export')return p.preview().then(()=>p.fallback(()=>p._visible&&p._token===a.globalData.token)).then(()=>{if(p.data.imageError&&!p.data.coverPath)throw Error(p.data.imageError);const f=wx.getFileSystemManager();return{image:f.readFileSync(p.data.imagePath,'base64'),cover:f.readFileSync(p.data.coverPath,'base64'),previews:q.previews.length};});
 if(action==='account-switch'){a.globalData={...a.globalData,token:'isolated-monthly-balance-B',user:{id:991000,username:'隔离账户B'}};p.onHide();return{report:p.data.report,edition:p.data.edition,imagePath:p.data.imagePath,coverPath:p.data.coverPath};}
 return true;
}
