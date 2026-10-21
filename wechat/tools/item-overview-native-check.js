function(action,value){
 const a=getApp(),p=getCurrentPages().slice(-1)[0];
 if(action==='setup'){
  if(a._overviewQA)throw Error('Fixture already active');
  const q={globalData:a.globalData,requireSession:a.requireSession,http:wx.cloud.callHTTPFunction,get:wx.getStorageSync,set:wx.setStorageSync,remove:wx.removeStorageSync,storage:new Map(),calls:[],...value};
  a._overviewQA=q;a.globalData={...a.globalData,token:'isolated-overview',expiresAt:Math.floor(Date.now()/1000)+3600,user:{id:991200,username:'物品统计验证',avatar_key:'cat'}};a.requireSession=()=>true;
  wx.getStorageSync=k=>q.storage.get(k)||'';wx.setStorageSync=(k,v)=>q.storage.set(k,v);wx.removeStorageSync=k=>q.storage.delete(k);
  wx.cloud.callHTTPFunction=function(spec){const route=spec.path.split('?')[0].replace('/api/mp',''),method=(spec.method||'GET').toUpperCase();q.calls.push({route,method});let statusCode=200,data=[];
   if(method!=='GET'){statusCode=403;data={error:'隔离验证禁止业务写入'};}
   else if(route==='/auth/me')data={user:a.globalData.user,capabilities:{storage_locations:true,item_cover_icons:true,cash_ledger:0}};
   else if(route==='/items')data=q.rows;
   else if(route==='/stats')data=q.stats;
   else if(route==='/insights')data=q.insights;
   else if(route==='/reports/monthly')data=q.report;
   else if(route==='/storage-locations')data={locations:[],unassigned_count:6};
   else if(/^\/items\/\d+$/.test(route))data={...q.rows[0],maintenance_records:[],usage_records:[],disposal:null};
   const response={statusCode:200,data:JSON.stringify({palm_http:1,statusCode,data}),header:{}};setTimeout(()=>{spec.success?.(response);spec.complete?.(response)},0);return Promise.resolve(response);
  };return true;
 }
 const q=a._overviewQA;
 if(action==='restore'){if(q){wx.getStorageSync=q.get;wx.setStorageSync=q.set;wx.removeStorageSync=q.remove;wx.cloud.callHTTPFunction=q.http;a.globalData=q.globalData;a.requireSession=q.requireSession;delete a._overviewQA;if(['pages/items/index','pages/statistics/index'].includes(p.route))p.onShow();}return true;}
 if(!q)throw Error('No overview fixture');
 if(action==='wait-route')return new Promise((resolve,reject)=>{const start=Date.now();function poll(){const current=getCurrentPages().slice(-1)[0];if(current?.route===value)return setTimeout(()=>resolve(true),150);if(Date.now()-start>4000)return reject(Error('Route did not settle: '+current?.route));setTimeout(poll,50)}poll()});
 if(action==='settle')return new Promise((resolve,reject)=>{const start=Date.now();function poll(){if(!p.data.loading&&!p.data.itemStatsLoading&&!p.data.itemInsightsLoading&&!p.data.cardsLoading&&!p.data.monthlyLoading&&!p.data.statsLoading)return setTimeout(()=>resolve(true),200);if(Date.now()-start>5000)return reject(Error('Page did not settle'));setTimeout(poll,50)}poll()});
 if(action==='reload'){p.onShow();return true;}
 if(action==='state')return{route:p.route,items:p.data.items?.length,shown:p.data.shown?.length,searchOpen:p.data.searchOpen,query:p.data.query,filterCount:p.data.filterCount,sortIndex:p.data.sortIndex,view:p.data.view,itemStats:p.data.itemStats,itemReminders:p.data.itemReminders?.map(r=>r.kind),itemStatsError:p.data.itemStatsError,itemInsightsError:p.data.itemInsightsError,targetKind:p._targetKind,anchorPending:p._anchorPending,scroll:p._scroll||0,calls:q.calls,writes:q.calls.filter(x=>x.method!=='GET').length};
 if(action==='search'){p.toggleSearch();p.search({detail:{value:'马克杯'}});return true;}
 if(action==='collapse'){p.toggleSearch();return true;}
 if(action==='clear'){p.clearSearch();return true;}
 if(action==='cancel-filter'){p.openFilters();p.chooseDraftStatus({currentTarget:{dataset:{index:2}}});p.closeFilters();return true;}
 if(action==='sort'){p.sortChange({detail:{value:4}});return true;}
 if(action==='view'){p.switchView({currentTarget:{dataset:{key:value}}});return true;}
 if(action==='bottom'){wx.pageScrollTo({scrollTop:99999,duration:0});return true;}
 if(action==='geometry')return new Promise(resolve=>{const selectors=['.collection-results-tools','.held-search-control','.held-search-region','.held-inline-input','.filter-control','.sort-picker','.search-wrap','.result-copy'];const query=wx.createSelectorQuery().in(p);selectors.forEach(s=>query.select(s).boundingClientRect());query.exec(rects=>resolve({selectors,rects,window:wx.getWindowInfo()}))});
 if(action==='dashboard-geometry')return new Promise(resolve=>{const selectors=['.item-dashboard','.item-dashboard-main','.item-dashboard-info','.item-dashboard-reminder','.item-dashboard-report'];const query=wx.createSelectorQuery().in(p);selectors.forEach(s=>query.select(s).boundingClientRect());query.exec(rects=>resolve({selectors,rects}))});
 return true;
}
