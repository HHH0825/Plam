function(action) {
 const a=getApp(),p=getCurrentPages().slice(-1)[0];
 if(action==='setup'){
  if(a._disposedQA)throw Error('Fixture already active');
  const q={globalData:a.globalData,requireSession:a.requireSession,http:wx.cloud.callHTTPFunction,toast:wx.showToast,calls:[],toasts:[],user:{id:990081,username:'微信用户1',avatar_key:'cat'}};
  q.rows=[{id:1,name:'陪我旅行的相机',category:'数码',icon_type:'digital',status:'active',holding_days:365,daily_net_cost:'1.28'},
   {id:2,name:'周末的帆布包',category:'日用',icon_type:'daily',status:'idle',holding_days:128,daily_net_cost:'0.32'},
   {id:3,name:'旧时的拍立得',category:'数码',icon_type:'digital',status:'disposed',holding_days:730,daily_net_cost:'0.82',is_pinned:true},
   {id:4,name:'曾经的小书桌',category:'家居',icon_type:'home',status:'disposed',holding_days:126,daily_net_cost:'-0.16'},
   {id:5,name:'跑过四季的单车',category:'出行',icon_type:'mobility',status:'disposed',holding_days:400,daily_net_cost:null,photo_url:'/items/5/photo',photo_version:'fixture'},
   {id:6,name:'一本慢慢读完的书',category:'阅读',icon_type:'books',status:'disposed',holding_days:50,daily_net_cost:'0.00'}].map(r=>({...r,purchase_price:'1280.00',purchase_date:'2025-10-11',net_cost:'600.00',daily_purchase_cost:'2.00',maintenance_total:'0.00',fixed_expense_total:'0.00',disposal_proceeds:r.status==='disposed'?'680.00':'0.00',notes:'隔离示例，仅用于验证',revision:1,maintenance_records:[],usage_records:[],storage_location_id:null,storage_location_name:'',disposal:r.status==='disposed'?{id:100+r.id,disposed_on:'2026-10-10',method:'sold',proceeds:'680.00',notes:''}:null}));
  q.journalKey='palmRequests:cloud_http_function:cloud1-example:palm-api:'+q.user.id;q.journal=wx.getStorageSync(q.journalKey);
  a._disposedQA=q;a.globalData={...a.globalData,token:'isolated-disposed-archive-qa',expiresAt:Math.floor(Date.now()/1000)+3600,user:q.user};a.requireSession=()=>true;
  wx.showToast=function(spec){q.toasts.push(spec.title);return q.toast.call(wx,spec);};
  wx.cloud.callHTTPFunction=function(spec){
   const route=spec.path.split('?')[0].replace('/api/mp',''),method=spec.method.toUpperCase(),id=Number(route.split('/')[2]),row=q.rows.find(r=>r.id===id);q.calls.push({route,method});
   let statusCode=200,data;
   if(method==='GET'&&route==='/items')data=q.empty?[]:q.rows.filter(r=>!r.deleted_at);
   else if(method==='GET'&&/^\/items\/\d+$/.test(route)&&row&&!row.deleted_at)data=row;
   else if(method==='GET'&&route==='/auth/me')data={user:q.user,account_age_days:128};
   else if(method==='GET'&&route==='/stats')data={held_items:q.rows.filter(r=>!r.deleted_at&&r.status!=='disposed').length,held_purchase_total:'2560.00'};
   else if(method==='GET'&&route==='/trash')data=q.rows.filter(r=>r.deleted_at).map(r=>({...r,expires_at:'2026-11-10T00:00:00Z'}));
   else if(method==='POST'&&/^\/items\/\d+\/disposal$/.test(route)&&row){row.status='disposed';row.disposal={...spec.data,id:100+row.id};row.revision++;data=row;}
   else if(method==='DELETE'&&/^\/disposal\/\d+$/.test(route)){const disposed=q.rows.find(r=>r.disposal?.id===Number(route.split('/')[2]));if(disposed){disposed.status='idle';disposed.disposal=null;disposed.revision++;data=disposed;}else{statusCode=404;data={error:'示例记录不存在'};}}
   else if(method==='DELETE'&&/^\/items\/\d+$/.test(route)&&row){row.deleted_at='2026-10-11T00:00:00Z';row.revision++;data={ok:true};}
   else if(method==='POST'&&/^\/trash\/\d+\/restore$/.test(route)&&row){row.deleted_at=null;row.revision++;data=row;}
   else {statusCode=404;data={error:'隔离验证：未定义请求或模拟照片读取失败'};}
   const response={statusCode:200,data:JSON.stringify({palm_http:1,statusCode,data}),header:{}};
   setTimeout(()=>{spec.success?.(response);spec.complete?.(response);},0);return Promise.resolve(response);
  };return {fixtureOnly:true};
 }
 const q=a._disposedQA;
 if(action==='restore'){if(q){if(q.journal)wx.setStorageSync(q.journalKey,q.journal);else wx.removeStorageSync(q.journalKey);if(q.photoCache&&q.photoLoad)q.photoCache.load=q.photoLoad;a.globalData=q.globalData;a.requireSession=q.requireSession;wx.cloud.callHTTPFunction=q.http;wx.showToast=q.toast;delete a._disposedQA;}return {restored:true,remoteWrites:0};}
 if(!q)throw Error('No fixture');
 const state=()=>({route:p.route,items:p.data.items?.map(i=>i.id),shown:p.data.shown?.map(i=>i.id),categories:p.data.categories,statusOptions:p.data.statusOptions,query:p.data.query,category:p.data.category,filterOpen:p.data.filterOpen,filterCount:p.data.filterCount,sortIndex:p.data.sortIndex,error:p.data.error,photos:p.data.photoStates,itemStatus:p.data.item?.status,navigationHidden:p.getTabBar?.()?.data?.hidden,toasts:q.toasts,calls:q.calls});
 if(action==='state')return state();
 if(action==='load')return p.load().then(()=>new Promise(resolve=>setTimeout(()=>resolve(state()),150)));
 if(action==='empty'){q.empty=true;return p.load().then(state);}
 if(action==='normal'){q.empty=false;return p.load().then(state);}
 if(action==='measure')return new Promise(resolve=>{const query=wx.createSelectorQuery().in(p);['.item-card','.sheet-apply','.sheet-reset','.filter-sheet','.empty-title','#menu-disposed'].forEach(s=>query.selectAll(s).boundingClientRect());query.exec(r=>resolve({state:state(),rects:r}));});
 if(action==='retry-setup'){p.disconnectPhotos();p.photoFailed({currentTarget:{dataset:{id:5}}});q.photoCache=p._photos;q.photoLoad=p._photos.load;p._photos.load=()=>Promise.resolve('/assets/white-doodle/type-mobility.png');return state();}
 if(action==='save'){p.setData({'form.disposed_on':'2026-10-11','form.proceeds':'680.00'});return p.save().then(state);}
 if(action==='delete-record'||action==='trash'){
  const original=wx.showModal;wx.showModal=spec=>{spec.success?.({confirm:true});};
  return p.remove().then(state).finally(()=>{wx.showModal=original;});
 }
 if(action==='restore-item')return p.restore({currentTarget:{dataset:{id:3}}}).then(()=>new Promise(resolve=>setTimeout(()=>resolve(state()),150)));
 return state();
}
