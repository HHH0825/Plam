function(action) {
 const a=getApp(),p=getCurrentPages().slice(-1)[0];
 if(action==='setup'){
  if(a._coverQA)throw Error('Cover fixture already active');
  const q={globalData:a.globalData,requireSession:a.requireSession,http:wx.cloud.callHTTPFunction,setStorage:wx.setStorageSync,keys:new Set(),writes:[],supported:true};
  q.rows=['camera','cup','tablet'].map((key,i)=>({id:990701+i,revision:0,name:['一起去旅行的相机','每天喝水的杯子','随身小平板'][i],category:['摄影收藏','日常用品','数码'][i],icon_type:['digital','daily','digital'][i],cover_mode:'icon',cover_icon_key:key,status:'active',purchase_date:'2026-10-01',purchase_price:'199.00',holding_days:10,daily_net_cost:'19.90',daily_purchase_cost:'19.90',net_cost:'199.00',notes:'本地隔离演示',photo_url:null,photo_version:null,maintenance_records:[],usage_records:[],maintenance_total:'0.00',fixed_expense_total:'0.00',disposal_proceeds:'0.00',storage_location_id:null,storage_location_name:'',disposal:null}));
  const template=q.rows[0];q.rows=[['相机','1999.00',1],['大金额收藏','999999999.99',126],['长天数物品','-12.34',99999999],['零成本','0.00',119],['暂无成本',null,4],['极端金额','999999999999999999999999999999.99',999999999999]].map(([name,daily,days],i)=>({...template,id:990701+i,name,daily_net_cost:daily,holding_days:days,net_cost:daily||'0.00'}));q.rows[0].is_pinned=true;q.rows.push({...q.rows[1],id:990708,name:'已处置的大金额收藏',status:'disposed'});
  a._coverQA=q;a.globalData={...a.globalData,token:'isolated-cover-qa',expiresAt:Math.floor(Date.now()/1000)+3600,user:{id:990799,username:'图标验证',avatar_key:'cat'}};a.requireSession=()=>true;
  wx.setStorageSync=function(key,value){q.keys.add(key);return q.setStorage.call(wx,key,value)};
  wx.cloud.callHTTPFunction=function(spec){const path=spec.path.split('?')[0].replace('/api/mp',''),method=(spec.method||'GET').toUpperCase();let statusCode=200,data;
   if(method==='GET'){
    if(path==='/auth/me')data={user:a.globalData.user,capabilities:{item_cover_icons:q.supported}};
    else if(path==='/items')data=q.rows;
    else if(/^\/items\/\d+$/.test(path))data=q.rows.find(r=>r.id===Number(path.split('/')[2]));
    else if(path==='/storage-locations')data={locations:[],unassigned_count:q.rows.length};
    else{statusCode=404;data={error:'未定义的隔离读取'};}
   }else if((path==='/items'&&method==='POST')||(/^\/items\/\d+$/.test(path)&&method==='PUT')){
    const payload=typeof spec.data==='string'?JSON.parse(spec.data):spec.data;
    const prior=method==='POST'?{...q.rows[0],id:990710+q.writes.length,revision:-1}:q.rows.find(r=>r.id===Number(path.split('/')[2]));
    data={...prior,...payload,revision:prior.revision+1,photo_url:null,photo_version:null};q.rows=q.rows.filter(r=>r.id!==data.id).concat([data]);q.writes.push({method,path,data:payload});statusCode=method==='POST'?201:200;
   }else{statusCode=403;data={error:'隔离验证禁止其他写入'};}
   if(!data){statusCode=404;data={error:'记录不存在'};}
   const response={statusCode:200,data:JSON.stringify({palm_http:1,statusCode,data}),header:{}};setTimeout(()=>{spec.success?.(response);spec.complete?.(response)},0);return Promise.resolve(response)
  };return {fixtureOnly:true,remoteWrites:0};
 }
 const q=a._coverQA;
 if(action==='restore'){
  if(q){for(const key of q.keys)wx.removeStorageSync(key);wx.setStorageSync=q.setStorage;wx.cloud.callHTTPFunction=q.http;a.globalData=q.globalData;a.requireSession=q.requireSession;delete a._coverQA;}return {fixture:false}
 }
 if(!q)throw Error('No cover fixture');
 if(action==='unavailable'){q.supported=false;return p.retryCoverCapability()}
 if(action==='supported'){q.supported=true;return p.retryCoverCapability()}
 if(action==='load')return p.load();
 if(action==='fill'){p.setData({'form.name':'新收藏的小手机','form.category':'我的数码','form.purchase_price':'128.00'});return true}
 if(action==='inspect')return {route:p.route,form:p.data.form,coverSupported:p.data.coverSupported,iconOpen:p.data.iconOpen,rows:p.data.iconRows?.length,writes:q.writes,remoteWrites:0,fixtureOnly:true};
 if(action==='metrics')return new Promise(resolve=>{const query=wx.createSelectorQuery().in(p);['.metric-region','.metric-available','.metric-probe','.daily-number','.metric-scroll'].forEach(s=>query.selectAll(s).boundingClientRect());query.exec(rects=>resolve({rects,layouts:p.data.metricLayouts||p.data.costLayout,route:p.route}))});
 if(action==='geometry')return new Promise(resolve=>{const query=wx.createSelectorQuery().in(p);['.cover-sheet','.cover-close','.cover-sheet-footer','.cover-feedback','.cover-grid-scroll'].forEach(s=>query.selectAll(s).boundingClientRect());query.exec(rects=>resolve({rects,window:wx.getWindowInfo().windowHeight}))});
 if(action==='feedback-return'){const before={query:p.data.iconQuery,group:p.data.iconGroup,selected:p.data.iconSelected,form:JSON.stringify(p.data.form)};p.onHide();p.onShow();return{before,after:{query:p.data.iconQuery,group:p.data.iconGroup,selected:p.data.iconSelected,form:JSON.stringify(p.data.form)}};}
 if(action==='measure')return new Promise(resolve=>{const query=wx.createSelectorQuery().in(p);['.cover-sheet','.cover-sheet-footer','.cover-option','.cover-choices button'].forEach(s=>query.selectAll(s).boundingClientRect());query.exec(rects=>resolve({rects,window:wx.getWindowInfo().windowHeight}))});
 return true;
}
