function(action,value){
 const a=getApp(),p=getCurrentPages().slice(-1)[0];
 if(action==='setup'){
  if(a._itemsHeaderQA)throw Error('Header fixture already active');
  const q={globalData:a.globalData,requireSession:a.requireSession,http:wx.cloud.callHTTPFunction,setStorage:wx.setStorageSync,storage:new Map(),calls:[],rows:Array.from({length:7},(_,i)=>({id:991201+i,name:['陪我旅行的相机','周末的帆布包','常用的马克杯'][i%3],category:i%3?'日用':'数码',icon_type:i%3?'daily':'digital',status:i===6?'disposed':i%2?'idle':'active',holding_days:126,purchase_date:'2026-06-09',purchase_price:'19.90',net_cost:'19.90',daily_net_cost:'0.16',daily_purchase_cost:'0.16',maintenance_total:'0.00',fixed_expense_total:'0.00',disposal_proceeds:'0.00',revision:1,storage_location_name:null,notes:''}))};
  a._itemsHeaderQA=q;a.globalData={...a.globalData,token:'isolated-items-header',expiresAt:Math.floor(Date.now()/1000)+3600,user:{id:991200,username:'页头演示',avatar_key:'cat'},capabilities:{storage_locations:true,item_cover_icons:true}};a.requireSession=()=>true;
  wx.setStorageSync=function(key,val){if(!q.storage.has(key))q.storage.set(key,wx.getStorageSync(key));return q.setStorage.call(wx,key,val)};
  wx.cloud.callHTTPFunction=function(spec){const route=spec.path.split('?')[0].replace('/api/mp',''),method=(spec.method||'GET').toUpperCase();q.calls.push({route,method});let statusCode=200,data=[];
   if(method!=='GET'){statusCode=403;data={error:'隔离验证禁止写入'};}
   else if(route==='/items')data=q.rows;
   else if(/^\/items\/\d+$/.test(route))data={...q.rows.find(r=>r.id===Number(route.split('/').pop())),maintenance_records:[],usage_records:[],disposal:null};
   else if(route==='/storage-locations')data={locations:[],unassigned_count:6};
   else if(route==='/fixed-expenses/summary')data={monthly_total:'0.00',paid_total:'0.00',principal_paid_total:'0.00'};
   else if(route==='/auth/me')data={user:a.globalData.user,account_age_days:7,capabilities:{storage_locations:true,item_cover_icons:true}};
   else if(route==='/stats')data={held_items:6,held_purchase_total:'119.40'};
   const response={statusCode:200,data:JSON.stringify({palm_http:1,statusCode,data}),header:{}};setTimeout(()=>{spec.success?.(response);spec.complete?.(response)},0);return Promise.resolve(response);
  };p.onShow();return{fixtureOnly:true};
 }
 const q=a._itemsHeaderQA;
 if(action==='restore'){
  if(q){for(const[key,val]of q.storage){if(val==='')wx.removeStorageSync(key);else q.setStorage.call(wx,key,val)}wx.setStorageSync=q.setStorage;wx.cloud.callHTTPFunction=q.http;a.globalData=q.globalData;a.requireSession=q.requireSession;delete a._itemsHeaderQA;p.onShow();}return{fixture:false};
 }
 if(!q)throw Error('No header fixture');
 if(action==='wait-route')return new Promise((resolve,reject)=>{const started=Date.now();function poll(){const current=getCurrentPages().slice(-1)[0];if(current?.route===value)return setTimeout(()=>resolve({route:current.route}),150);if(Date.now()-started>4000)return reject(Error('Route did not settle: '+value+' got '+current?.route));setTimeout(poll,50)}poll()});
 if(action==='inspect')return{route:p.route,held:p.data.items?.length,shown:p.data.shown?.length,query:p.data.query,sort:p.data.sortIndex,heroArtError:p.data.heroArtError,detailReady:!!p.data.item,error:p.data.error||'',barHidden:p.getTabBar?.()?.data.hidden,calls:q.calls};
 if(action==='geometry')return new Promise(resolve=>{const selectors=['.collection-heading','.heading-copy','.collection-kitten','.held-subtitle','.search-wrap','.wishlist-entry','.subscription-entry','.storage-entry','.filter-control','.sort-picker'];const query=wx.createSelectorQuery().in(p);selectors.forEach(s=>query.select(s).boundingClientRect());query.exec(rects=>resolve({selectors,rects,window:wx.getWindowInfo()}))});
 if(action==='art-failure'){p.heroArtFailed();return true;}
 if(action==='reset-art'){p.setData({heroArtError:false});return true;}
 if(action==='sort'){p.sortChange({detail:{value:4}});return true;}
 return true;
}
