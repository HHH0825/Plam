function(action,value){
 const a=getApp(),p=getCurrentPages().slice(-1)[0];
 if(action==='setup'){
  if(a._toolbarQA)throw Error('Fixture already active');
  const q={globalData:a.globalData,requireSession:a.requireSession,http:wx.cloud.callHTTPFunction,get:wx.getStorageSync,set:wx.setStorageSync,remove:wx.removeStorageSync,storage:new Map(),calls:[],rows:Array.from({length:7},(_,i)=>({id:991201+i,name:i===0?'陪我旅行的相机':i%2?'周末的帆布包':'常用的马克杯',category:i===0?'摄影器材':i%2?'衣物':'日用',icon_type:i===0?'digital':i%2?'clothing':'daily',status:i===6?'disposed':i%2?'idle':'active',holding_days:129,purchase_date:'2026-06-09',purchase_price:'19.90',net_cost:'19.90',daily_net_cost:'0.15',daily_purchase_cost:'0.15',maintenance_total:'0.00',fixed_expense_total:'0.00',disposal_proceeds:'0.00',revision:1,cover_mode:'icon',cover_icon_key:i===0?'camera':null,storage_location_id:null,storage_location_name:null,notes:''}))};
  a._toolbarQA=q;a.globalData={...a.globalData,token:'isolated-toolbar',expiresAt:Math.floor(Date.now()/1000)+3600,user:{id:991200,username:'工具栏验证',avatar_key:'cat'}};a.requireSession=()=>true;
  wx.getStorageSync=k=>q.storage.get(k)||'';wx.setStorageSync=(k,v)=>q.storage.set(k,v);wx.removeStorageSync=k=>q.storage.delete(k);
  wx.cloud.callHTTPFunction=function(spec){const route=spec.path.split('?')[0].replace('/api/mp',''),method=(spec.method||'GET').toUpperCase();q.calls.push({route,method});let statusCode=200,data=[];
   if(method!=='GET'){statusCode=403;data={error:'隔离验证禁止业务写入'};}
   else if(route==='/auth/me')data={user:a.globalData.user,capabilities:{storage_locations:true,item_cover_icons:true,cash_ledger:0}};
   else if(route==='/items')data=q.rows;
   else if(/^\/items\/\d+$/.test(route))data={...q.rows.find(r=>r.id===Number(route.split('/').pop())),maintenance_records:[],usage_records:[],disposal:null};
   else if(route==='/storage-locations')data={locations:[],unassigned_count:6};
   else if(route==='/fixed-expenses')data={plans:[],totals:{monthly_total:'0.00',paid_total:'0.00',principal_paid_total:'0.00'}};
   else if(route==='/fixed-expenses/summary')data={monthly_total:'0.00',paid_total:'0.00',principal_paid_total:'0.00'};
   const response={statusCode:200,data:JSON.stringify({palm_http:1,statusCode,data}),header:{}};setTimeout(()=>{spec.success?.(response);spec.complete?.(response)},0);return Promise.resolve(response);
  };return true;
 }
 const q=a._toolbarQA;
 if(action==='restore'){if(q){wx.getStorageSync=q.get;wx.setStorageSync=q.set;wx.removeStorageSync=q.remove;wx.cloud.callHTTPFunction=q.http;a.globalData=q.globalData;a.requireSession=q.requireSession;delete a._toolbarQA;if(p.route==='pages/items/index')p.onShow();}return true;}
 if(!q)throw Error('No toolbar fixture');
 if(action==='wait-route')return new Promise((resolve,reject)=>{const start=Date.now();function poll(){const current=getCurrentPages().slice(-1)[0];if(current?.route===value)return setTimeout(()=>resolve(true),150);if(Date.now()-start>4000)return reject(Error('Route did not settle: '+value+'; current '+current?.route));setTimeout(poll,50)}poll()});
 if(action==='reload'){p.onShow();return true;}
 if(action==='navigate-back'){wx.navigateBack({delta:1});return true;}
 if(action==='state')return{route:p.route,items:p.data.items?.length,shown:p.data.shown?.length,searchOpen:p.data.searchOpen,query:p.data.query,filterCount:p.data.filterCount,sortIndex:p.data.sortIndex,category:p.data.form?.category,type:p.data.form?.icon_type,originalCategory:q.rows[0].category,writes:q.calls.filter(x=>x.method!=='GET').length};
 if(action==='search'){p.toggleSearch();p.search({detail:{value:'马克杯'}});return true;}
 if(action==='collapse'){p.toggleSearch();return true;}
 if(action==='clear'){p.clearSearch();return true;}
 if(action==='cancel-filter'){p.openFilters();p.chooseDraftStatus({currentTarget:{dataset:{index:2}}});p.closeFilters();return true;}
 if(action==='sort'){p.sortChange({detail:{value:4}});return true;}
 if(action==='category'){p.typeChange({detail:{value:1}});return true;}
 if(action==='geometry')return new Promise(resolve=>{const selectors=['.purchase-entries','.collection-results-tools','.held-search-control','.filter-control','.sort-picker','.search-wrap','.result-copy'];const query=wx.createSelectorQuery().in(p);selectors.forEach(s=>query.select(s).boundingClientRect());query.exec(rects=>resolve({selectors,rects,window:wx.getWindowInfo()}))});
 if(action==='editor-geometry')return new Promise(resolve=>wx.createSelectorQuery().in(p).selectAll('input[data-key="category"]').boundingClientRect().exec(r=>resolve({freeInputs:r[0]})));
 return true;
}
