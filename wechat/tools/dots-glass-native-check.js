function(action) {
 const a=getApp(),p=getCurrentPages().slice(-1)[0];
 if(action==='setup'){
  if(a._dotsQA)throw Error('Fixture already active');
  const q={globalData:a.globalData,requireSession:a.requireSession,hasSession:a.hasSession,http:wx.cloud.callHTTPFunction,calls:[],photoPath:Object.values(p.data.photoPaths||{})[0]||'/assets/welcome-collection/camera.png',cache:p._photos,photoLoad:p._photos.load,photoPeek:p._photos.peek,photoSync:p._photos.sync,user:{id:990082,username:'微信用户1',avatar_key:'cat'}};
  q.rows=Array.from({length:10},(_,i)=>({id:990082+i,name:i%2?'常用的马克杯':'陪我旅行的相机',category:'日常用品',icon_type:'daily',status:i%3?'active':'idle',holding_days:126+i,purchase_price:'19.90',purchase_date:'2026-06-07',net_cost:'19.90',daily_net_cost:'0.16',daily_purchase_cost:'0.16',maintenance_total:'0.00',fixed_expense_total:'0.00',disposal_proceeds:'0.00',notes:'本地隔离演示，不写入账户',revision:1,photo_url:'/items/'+(990082+i)+'/photo',photo_version:'isolated',maintenance_records:[],usage_records:[],storage_location_id:null,storage_location_name:'',disposal:null}));
  a._dotsQA=q;a.globalData={...a.globalData,token:'isolated-dots-glass-qa',expiresAt:Math.floor(Date.now()/1000)+3600,user:q.user};a.requireSession=()=>true;a.hasSession=()=>false;
  q.cache.load=()=>Promise.resolve(q.photoPath);q.cache.peek=()=>Promise.resolve(q.photoPath);q.cache.sync=()=>{};
  wx.cloud.callHTTPFunction=function(spec){const route=spec.path.split('?')[0].replace('/api/mp',''),method=spec.method.toUpperCase();q.calls.push({route,method});let statusCode=200,data;
   if(method!=='GET'){statusCode=403;data={error:'隔离验证禁止写入'};}
   else if(route==='/items')data=q.rows;
   else if(/^\/items\/\d+$/.test(route))data=q.rows.find(r=>r.id===Number(route.split('/')[2]));
   else if(route==='/auth/me')data={user:q.user,account_age_days:128};
   else if(route==='/stats')data={held_items:10,held_purchase_total:'199.00'};
   else if(route==='/storage-locations')data={locations:[],unassigned:10};
   else if(route==='/wishlist')data=[];
   else if(route==='/fixed-expenses')data={rows:[],totals:{}};
   else{statusCode=404;data={error:'未定义的隔离示例读取'};}
   const response={statusCode:200,data:JSON.stringify({palm_http:1,statusCode,data}),header:{}};setTimeout(()=>{spec.success?.(response);spec.complete?.(response);},0);return Promise.resolve(response);
  };return {fixtureOnly:true,usingCachedRealPhoto:q.photoPath.startsWith('http://tmp/')};
 }
 const q=a._dotsQA;
 if(action==='restore'){
  if(q){q.cache.load=q.photoLoad;q.cache.peek=q.photoPeek;q.cache.sync=q.photoSync;a.globalData=q.globalData;a.requireSession=q.requireSession;a.hasSession=q.hasSession;wx.cloud.callHTTPFunction=q.http;delete a._dotsQA;}
  return {restored:true};
 }
 if(!q)throw Error('No fixture');
 const state=()=>({route:p.route,filterOpen:p.data.filterOpen,shown:p.data.shown?.length,loading:p.data.loading,error:p.data.error,scroll:p._scroll??p._scrollTop,hidden:p.getTabBar?.()?.data.hidden,fallback:p.getTabBar?.()?.data.glassFallback,calls:q.calls});
 if(action==='state')return state();
 if(action==='load')return p.load().then(()=>new Promise(resolve=>setTimeout(()=>resolve(state()),200)));
 if(action==='expanded'){p.setData({factsExpanded:true});return state();}
 if(['fallback','enhanced','no-blur'].includes(action)){p.getTabBar().setData({glassFallback:action==='fallback',glassNoBlur:action==='no-blur'});return state();}
 if(action==='measure')return new Promise(resolve=>{const query=wx.createSelectorQuery().in(p);['.page','.item-card','.sheet-apply','.sheet-reset','.filter-sheet','.facts','.detail-storage-row'].forEach(s=>query.selectAll(s).boundingClientRect());query.exec(r=>{const bar=p.getTabBar?.();if(!bar){resolve({state:state(),rects:r});return;}const qb=wx.createSelectorQuery().in(bar);['.tab-bar','.tab','.add','.glass-surface'].forEach(s=>qb.selectAll(s).boundingClientRect());qb.exec(b=>resolve({state:state(),rects:r,bar:b}));});});
 if(action==='align-photo')return new Promise(resolve=>{const query=wx.createSelectorQuery().in(p);query.select('#item-990087 .thumbnail').boundingClientRect();query.exec(r=>{if(!r[0])throw Error('Missing photo target');const qb=wx.createSelectorQuery().in(p.getTabBar());qb.select('.tab-bar').boundingClientRect();qb.exec(b=>{const top=Math.round(r[0].top+(p._scroll||0)-(b[0].top+b[0].height/2-r[0].height/2));wx.pageScrollTo({scrollTop:top,duration:0,success:()=>setTimeout(()=>resolve({scrollTop:top,photo:r[0],bar:b[0]}),300)});});});});
 return state();
}
