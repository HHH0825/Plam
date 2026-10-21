function(action){
 const a=getApp(),p=getCurrentPages().slice(-1)[0];
 if(action==='setup'){
  if(a._progressQA)throw Error('Progress fixture already active');
  const q={globalData:a.globalData,requireSession:a.requireSession,http:wx.cloud.callHTTPFunction,setStorage:wx.setStorageSync,storage:new Map(),calls:[]};
  const now=new Date(Date.now()+8*3600000).toISOString().slice(0,10),shift=n=>new Date(Date.parse(now+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  q.rows=[null,'999999999.99','0.00','-2.00'].map((cost,i)=>({id:990801+i,revision:0,name:['暂无成本','大金额收藏','零成本','负成本收藏'][i],category:'日用',icon_type:'daily',cover_mode:'icon',cover_icon_key:'cup',status:'active',purchase_date:'2026-06-07',purchase_price:'19.90',holding_days:126,daily_net_cost:cost,daily_purchase_cost:'0.16',net_cost:'19.90',maintenance_total:'0.00',fixed_expense_total:'0.00',disposal_proceeds:'0.00',notes:'本地隔离演示',photo_url:null,is_pinned:false,maintenance_records:[],usage_records:[],disposal:null,storage_location_id:990850,storage_location_name:'卧室'}));
  q.rows.push({...q.rows[3],id:990805,status:'disposed',name:'已处置的小收藏'});
  const normal={id:990861,revision:0,name:'视频会员',kind:'subscription',status:'active',amount:'30.00',cycle:'month',cycle_days:30,anchor_on:shift(20),service_from:shift(-11),service_until:shift(20),next_due_on:shift(20),next_cycle_index:0,paid_cost:'0.00',paid_principal:'0.00',remaining_principal:'6000.00',suggested_principal:'500.00',planned_payment:'508.00',principal_total:'6000.00',periods:12,paid_periods:0,payments:[],item_id:null,notes:''};
  q.plans=[normal,{...normal,id:990862,name:'即将到期的云空间',service_until:shift(3)},{...normal,id:990863,name:'已到期服务',service_until:shift(-2)},{...normal,id:990864,name:'仅填写到期日期',service_from:null},{...normal,id:990865,name:'电脑分期',kind:'installment',anchor_on:'2026-08-31',next_cycle_index:2,next_due_on:'2026-10-31'}];
  a._progressQA=q;a.globalData={...a.globalData,token:'isolated-progress-qa',expiresAt:Math.floor(Date.now()/1000)+3600,user:{id:990899,username:'本地进度条验证',avatar_key:'cat'}};a.requireSession=()=>true;
  wx.setStorageSync=function(key,value){if(!q.storage.has(key))q.storage.set(key,wx.getStorageSync(key));return q.setStorage.call(wx,key,value)};
  wx.cloud.callHTTPFunction=function(spec){const route=spec.path.split('?')[0].replace('/api/mp',''),method=(spec.method||'GET').toUpperCase();q.calls.push({route,method});let statusCode=200,data;
   if(method!=='GET'){statusCode=403;data={error:'本地验证禁止写入'};}
   else if(route==='/items')data=q.rows;
   else if(/^\/items\/\d+$/.test(route))data=q.rows.find(r=>r.id===Number(route.split('/')[2]));
   else if(route==='/auth/me')data={user:a.globalData.user,capabilities:{item_cover_icons:true}};
   else if(route==='/fixed-expenses')data={plans:q.plans,totals:{cents:'0.00',linked_cents:'0.00',unlinked_cents:'0.00',principal_cents:'0.00'}};
   else if(/^\/fixed-expenses\/\d+$/.test(route))data=q.plans.find(r=>r.id===Number(route.split('/')[2]));
   else if(route==='/storage-locations')data={locations:[{id:990850,name:'卧室',count:4}],unassigned_count:0};
   else{statusCode=404;data={error:'未定义的隔离读取'};}
   if(!data){statusCode=404;data={error:'记录不存在'};}
   const response={statusCode:200,data:JSON.stringify({palm_http:1,statusCode,data}),header:{}};setTimeout(()=>{spec.success?.(response);spec.complete?.(response)},0);return Promise.resolve(response);
  };return{fixtureOnly:true,remoteWrites:0,now};
 }
 const q=a._progressQA;
 if(action==='restore'){
  if(q){p.stopMidnight?.();for(const[key,value]of q.storage){if(value==='')wx.removeStorageSync(key);else q.setStorage.call(wx,key,value)}wx.setStorageSync=q.setStorage;wx.cloud.callHTTPFunction=q.http;a.globalData=q.globalData;a.requireSession=q.requireSession;delete a._progressQA;}return{fixture:false};
 }
 if(!q)throw Error('No progress fixture');
 if(action==='load')return p.load();
 if(action==='long-storage'){q.rows[0].storage_location_name='卧室书桌右侧第二层抽屉 · 常用物品'.repeat(3);return p.load();}
 if(action==='inspect')return{route:p.route,shown:p.data.shown?.map(r=>({id:r.id,name:r.name,progress:r.progress})),selected:p.data.selected,sortIndex:p.data.sortIndex,sortOptions:p.data.sortOptions,sortLabel:p.data.sortLabels?.[p.data.sortIndex],paying:p.data.paying,editing:p.data.editing,calls:q.calls,remoteWrites:0,fixtureOnly:true};
 if(action==='storage-geometry')return new Promise(resolve=>wx.createSelectorQuery().in(p).select('.detail-storage-row').boundingClientRect().select('.detail-storage-change').boundingClientRect().exec(rects=>resolve({rects})));
 if(action==='progress-geometry')return Promise.all(p.selectAllComponents('.expense-time-progress').map(c=>new Promise(resolve=>wx.createSelectorQuery().in(c).select('.time-track').boundingClientRect().select('.time-fill').boundingClientRect().select('.time-paw').boundingClientRect().exec(rects=>resolve({rects,progress:c.data.progress})))));
 return true;
}
