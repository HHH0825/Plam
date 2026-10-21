function(action,value){
 const a=getApp(),p=getCurrentPages().slice(-1)[0];
 if(action==='setup'){
  if(a._memberQA)throw Error('Fixture already active');
  const q={globalData:a.globalData,requireSession:a.requireSession,http:wx.cloud.callHTTPFunction,get:wx.getStorageSync,set:wx.setStorageSync,remove:wx.removeStorageSync,preview:wx.previewImage,storage:new Map(),calls:[],...value};
  a._memberQA=q;a.globalData={...a.globalData,token:'isolated-member-qa',expiresAt:Math.floor(Date.now()/1000)+3600,user:q.responses['/auth/me'].user};a.requireSession=()=>true;
  wx.getStorageSync=k=>q.storage.get(k)||'';wx.setStorageSync=(k,v)=>q.storage.set(k,v);wx.removeStorageSync=k=>q.storage.delete(k);wx.previewImage=o=>{o.success?.({});o.complete?.({})};
  wx.cloud.callHTTPFunction=function(spec){const path=spec.path.replace('/api/mp',''),route=path.split('?')[0],method=(spec.method||'GET').toUpperCase();q.calls.push({route,method});let statusCode=200,data=q.responses[path]||q.responses[route];
   if(method!=='GET'&&route!=='/member/analysis/run'){statusCode=403;data={error:'隔离验证禁止业务写入'};}
   else if(!data){statusCode=404;data={error:'隔离环境未提供数据'};}
   const response={statusCode:200,data:JSON.stringify({palm_http:1,statusCode,data}),header:{}};setTimeout(()=>{spec.success?.(response);spec.complete?.(response)},0);return Promise.resolve(response);
  };return true;
 }
 const q=a._memberQA;
 if(action==='restore'){if(q){p.onHide?.();wx.getStorageSync=q.get;wx.setStorageSync=q.set;wx.removeStorageSync=q.remove;wx.cloud.callHTTPFunction=q.http;wx.previewImage=q.preview;a.globalData=q.globalData;a.requireSession=q.requireSession;delete a._memberQA;}return true}
 if(!q)throw Error('No fixture');
 if(action==='navigate')return new Promise((resolve,reject)=>{const method=['/pages/items/index','/pages/ledger/index','/pages/statistics/index','/pages/me/index'].includes(value)?'switchTab':'redirectTo';wx[method]({url:value,success:()=>resolve(true),fail:reject})});
 if(action==='settle')return new Promise((resolve,reject)=>{const start=Date.now();function poll(){const page=getCurrentPages().slice(-1)[0];if(!page.data.loading&&!page.data.busy&&!page.data.cashLoading&&!page.data.statsLoading&&!page.data.coversLoading)return setTimeout(()=>resolve(true),300);if(Date.now()-start>6000)return reject(Error('Page did not settle: '+page.data.error));setTimeout(poll,60)}poll()});
 if(action==='state')return {route:p.route,loading:p.data.loading,error:p.data.error,memberError:p.data.memberError,memberActive:p.data.memberActive,selected:p.data.selected,plans:p.data.plans,member:p.data.member,membership:p.data.membership,books:p.data.books,entries:p.data.entries,budget:p.data.budget,bills:p.data.bills,analysis:p.data.analysis,appearance:p.data.appearance,layout:p.data.reportLayout,memberReportPath:p.data.memberReportPath,writes:q.calls.filter(r=>r.method!=='GET'&&r.route!=='/member/analysis/run').length};
 if(action==='free'){Object.assign(q.responses['/membership'],{active:false,status:'free',entitlements:[],expires_at:null});return p.load()}
 if(action==='active'){Object.assign(q.responses['/membership'],{active:true,status:'active',entitlements:['ad_free','books','analysis','budgets','appearance'],expires_at:Math.floor(Date.now()/1000)+3600});return p.load()}
 if(action==='expired'){Object.assign(q.responses['/membership'],{active:false,status:'expired',entitlements:[],expires_at:Math.floor(Date.now()/1000)-3600});return p.load()}
 if(action==='open-feature')return p.open({currentTarget:{dataset:{mode:value}}});
 if(action==='open-entry')return p.memberOpen();
 if(action==='analysis'){p.setData({filters:q.filters});return p.runAnalysis()}
 if(action==='preview'){p.chooseAppearance({currentTarget:{dataset:{field:'theme',id:'sage'}}});p.chooseAppearance({currentTarget:{dataset:{field:'template',id:'journal'}}});p.chooseAppearance({currentTarget:{dataset:{field:'sticker',id:'cat'}}});return true}
 if(action==='theme'){const saved={revision:1,theme:value||'sage',template:'journal',sticker:'cat'};q.responses['/membership'].appearance={saved,effective:saved};q.responses['/member/appearance']={saved,effective:saved};return p.memberRefresh(true)}
 if(action==='select'){p.select({currentTarget:{dataset:{id:value}}});return true}
 if(action==='bottom'){wx.pageScrollTo({scrollTop:99999,duration:0});return true}
 if(action==='top'){wx.pageScrollTo({scrollTop:0,duration:0});return true}
 if(action==='export')return p.preview().then(()=>{if(!p.data.imagePath)throw Error(p.data.imageError||'No report image');return {base64:wx.getFileSystemManager().readFileSync(p.data.imagePath,'base64')}});
 if(action==='geometry')return new Promise(resolve=>{const selectors=['.page','.member-plans','.member-purchase','.member-free','.bill-grid','.summary-grid','.appearance-preview'],query=wx.createSelectorQuery().in(p);selectors.forEach(s=>query.select(s).boundingClientRect());query.exec(rects=>resolve({selectors,rects,window:wx.getWindowInfo()}))});
 return true;
}
