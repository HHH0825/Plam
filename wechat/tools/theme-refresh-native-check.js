function(action,value){
 const a=getApp(),p=getCurrentPages().slice(-1)[0];
 if(action==='setup'){
  if(a._cashRedesignQA)throw Error('Fixture already active');
  const q={globalData:a.globalData,requireSession:a.requireSession,http:wx.cloud.callHTTPFunction,get:wx.getStorageSync,set:wx.setStorageSync,remove:wx.removeStorageSync,preview:wx.previewImage,hasSession:a.hasSession,login:a.login,storage:new Map(),calls:[],...value};
  a._cashRedesignQA=q;a.globalData={...a.globalData,token:'isolated-cash-redesign',expiresAt:Math.floor(Date.now()/1000)+3600,user:{id:991200,username:'微信用户1',avatar_key:'cat'}};a.requireSession=()=>true;a.hasSession=()=>false;q.loginCalls=0;a.login=()=>{q.loginCalls++;return q.loginError?Promise.reject(new Error('隔离验收：登录失败')):Promise.resolve()};
  wx.getStorageSync=k=>q.storage.get(k)||'';wx.setStorageSync=(k,v)=>q.storage.set(k,v);wx.removeStorageSync=k=>q.storage.delete(k);wx.previewImage=o=>{o.success?.({});o.complete?.({})};
  wx.cloud.callHTTPFunction=function(spec){const route=spec.path.split('?')[0].replace('/api/mp',''),method=(spec.method||'GET').toUpperCase();q.calls.push({route,method});let statusCode=200,data=[];
   if(method!=='GET'){statusCode=403;data={error:'隔离验证禁止业务写入'};}
   else if(route==='/auth/me')data={user:a.globalData.user,account_age_days:9,capabilities:{cash_ledger:1,storage_locations:true,item_cover_icons:true}};
   else if(route==='/ledger/settings')data={enabled:true};
   else if(route==='/ledger/statistics')data=q.ledger;
   else if(route==='/ledger/entries'){const date=spec.path.match(/[?&]date=([^&]+)/)?.[1]||null;data={date,entries:q.entries.filter(r=>!date||r.occurred_on===date),summary:q.ledger.summary,filtered_summary:q.ledger.summary,day_summaries:Object.fromEntries(q.ledger.days.map(r=>[r.date,r])),next_offset:null};}
   else if(route==='/stats')data=q.items;
   else if(route==='/insights')data=q.insights;
   else if(route==='/items')data=[];else if(route==='/reports/monthly')data=q.monthly;
   const response={statusCode:200,data:JSON.stringify({palm_http:1,statusCode,data}),header:{}};setTimeout(()=>{spec.success?.(response);spec.complete?.(response)},0);return Promise.resolve(response);
  };return true;
 }
 const q=a._cashRedesignQA;
 if(action==='restore'){if(q){if(p.route==='pages/ledger-report/index')p.invalidate();wx.getStorageSync=q.get;wx.setStorageSync=q.set;wx.removeStorageSync=q.remove;wx.cloud.callHTTPFunction=q.http;wx.previewImage=q.preview;a.globalData=q.globalData;a.requireSession=q.requireSession;if(typeof q.hasSession==='function')a.hasSession=q.hasSession;if(typeof q.login==='function')a.login=q.login;delete a._ledgerDestination;delete a._cashRedesignQA;if(['pages/me/index','pages/ledger/index','pages/statistics/index'].includes(p.route))p.onShow();}return true;}
 if(!q)throw Error('No cash redesign fixture');
 if(action==='wait-route')return new Promise((resolve,reject)=>{const start=Date.now();function poll(){const current=getCurrentPages().slice(-1)[0];if(current?.route===value)return setTimeout(()=>resolve(true),200);if(Date.now()-start>4000)return reject(Error('Route did not settle: '+current?.route));setTimeout(poll,50)}poll()});
 if(action==='settle')return new Promise((resolve,reject)=>{const start=Date.now();function poll(){if(!p.data.loading&&!p.data.cashLoading&&!p.data.statsLoading&&!p.data.dayLoading&&!p.data.imageBusy)return setTimeout(()=>resolve(true),200);if(Date.now()-start>6000)return reject(Error('Page did not settle'));setTimeout(poll,50)}poll()});
 if(action==='bottom'){wx.pageScrollTo({scrollTop:99999,duration:0});return true;}
 if(action==='geometry')return new Promise(resolve=>{const selectors=p.route==='pages/login/index'?['.welcome','.brand','.title-art','.subtitle','.welcome-art','.sample-card','.feature-hints','.login-button','.welcome-note']:p.route==='pages/statistics/index'?['.statistics-view-switch','#statistics-view-cash','.ledger-calendar']:['.page-heading','.heading-cat','.empty-cat','.cover-kitten'];const query=wx.createSelectorQuery().in(p);selectors.forEach(s=>query.select(s).boundingClientRect());query.exec(rects=>resolve({selectors,rects,window:wx.getWindowInfo()}))});
 if(action==='login-fail'){q.loginError=true;return p.login().then(()=>({busy:p.data.busy,error:p.data.error,calls:q.loginCalls}))}
 if(action==='login-double'){q.loginError=false;const before=q.loginCalls;let release;a.login=()=>{q.loginCalls++;return new Promise(r=>release=r)};const first=p.login(),second=p.login();release();return Promise.all([first,second]).then(()=>({calls:q.loginCalls-before,busy:p.data.busy}))}
 if(action==='existing-session'){a.hasSession=()=>true;if(p.route==='pages/login/index')p.onLoad();return true}
 if(action==='guest-session'){a.hasSession=()=>false;return true}
 if(action==='asset-errors'){p.logoError();for(const asset of ['title','hero','camera','food','feature','decor'])p.assetError({currentTarget:{dataset:{asset}}});return{fallback:p.data.titleFailed&&p.data.heroFailed&&p.data.foodFailed}}
 if(action==='wait-view')return new Promise((resolve,reject)=>{const start=Date.now();function poll(){if(p.data.view===value&&!p.data.loading&&!p.data.dayLoading&&!p.data.itemStatsLoading&&!p.data.itemInsightsLoading)return resolve(true);if(Date.now()-start>6000)return reject(Error('View did not settle'));setTimeout(poll,50)}poll()});
 if(action==='view-state')return{view:p.data.view,month:p.data.month,selectedDate:p.data.selectedDate,loading:p.data.loading,itemStatsLoading:p.data.itemStatsLoading,itemInsightsLoading:p.data.itemInsightsLoading,writes:q.calls.filter(x=>x.method!=='GET').length};
 if(action==='nav-state'){const b=p.getTabBar?.();return{route:p.route,mounted:!!b,hidden:b?.data.hidden,menuOpen:b?.data.menuOpen,selectedRoute:b?.data.selectedRoute};}
 if(action==='nav-open'){p.getTabBar().add();return true;}
 if(action==='nav-close'){p.getTabBar().closeMenu();return true;}
 if(action==='filter-open'){p.openFilters();return true;}
 if(action==='filter-close'){p.closeFilters();return true;}
 return true;
}
