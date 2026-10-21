function(action,value){
 const a=getApp(),p=getCurrentPages().slice(-1)[0];
 if(action==='setup'){
  if(a._summaryAmountQA)throw Error('Summary fixture already active');
  const q={globalData:a.globalData,requireSession:a.requireSession,http:wx.cloud.callHTTPFunction,setStorage:wx.setStorageSync,storage:new Map(),calls:[],amount:'17551.90',net:'13547.00',mode:'normal',user:{id:991101,username:'微信用户1',avatar_key:'cat'}};
  a._summaryAmountQA=q;a.globalData={...a.globalData,token:'isolated-summary-amount',expiresAt:Math.floor(Date.now()/1000)+3600,user:q.user};a.requireSession=()=>true;
  wx.setStorageSync=function(key,value){if(!q.storage.has(key))q.storage.set(key,wx.getStorageSync(key));return q.setStorage.call(wx,key,value)};
  wx.cloud.callHTTPFunction=function(spec){const route=spec.path.split('?')[0].replace('/api/mp',''),method=(spec.method||'GET').toUpperCase();q.calls.push({route,method});let statusCode=200,data;
   if(method!=='GET'){statusCode=403;data={error:'隔离验证禁止写入'};}
   else if(route==='/reports/monthly')data={month:'2026-10',today:'2026-10-12',cutoff_date:'2026-10-12',is_current:true,has_activity:true,totals:{purchase_count:3,purchase_total:'14047.00',maintenance_total:'0.00',disposal_total:'500.00',cashflow_net:q.net},purchases:[],purchase_leaders:[],memories:[]};
   else if(route==='/auth/me')data={user:q.user,account_age_days:7};
   else if(route==='/stats'){data={held_items:6,held_purchase_total:q.amount,total_items:6,net_cost_total:'100.00',purchase_total:'14047.00',maintenance_total:'0.00',disposal_total:'500.00'};if(q.mode==='error'){statusCode=503;data={error:'模拟统计读取失败，请重试'};}if(q.mode==='legacy')data={total_items:6,purchase_total:'100.00'};}
   else if(route==='/insights')data={analysis_cards:[],months:[]};
   else if(route==='/items')data=[];
   else{statusCode=404;data={error:'未定义的隔离读取'};}
   const response={statusCode:200,data:JSON.stringify({palm_http:1,statusCode,data}),header:{}};setTimeout(()=>{spec.success?.(response);spec.complete?.(response)},0);return Promise.resolve(response);
  };return{fixtureOnly:true};
 }
 const q=a._summaryAmountQA;
 if(action==='restore'){
  if(q){for(const[key,value]of q.storage){if(value==='')wx.removeStorageSync(key);else q.setStorage.call(wx,key,value)}wx.setStorageSync=q.setStorage;wx.cloud.callHTTPFunction=q.http;a.globalData=q.globalData;a.requireSession=q.requireSession;delete a._summaryAmountQA;}return{fixture:false};
 }
 if(!q)throw Error('No summary fixture');
 if(action==='amount'){q.amount=value;return p.loadStats();}
 if(action==='net'){q.net=value;return p.loadMonthly();}
 if(action==='mode'){q.mode=value;return p.loadStats();}
 if(action==='inspect')return{route:p.route,visible:p._visible,navigationLocked:!!p._navigation,stack:getCurrentPages().map(p=>p.route),amount:p.data.heldAmount,display:p.data.heldAmountDisplay,compact:p.data.heldAmountCompact,amountDialog:p.data.amountDialog,amountLayout:p.data.amountLayout,monthlyLayout:p.data.monthlyLayout,error:p.data.statsError,barHidden:p.getTabBar?.()?.data.hidden,calls:q.calls};
 if(action==='geometry')return new Promise(resolve=>{const selectors=p.route==='pages/me/index'?['.overview-card','.amount-cell','.overview-money-scroll','.overview-money','.profile-divider','.logout-button']:['.brief-ledger','.brief-count','.brief-amount-scroll','.brief-balance-value'];const query=wx.createSelectorQuery().in(p);selectors.forEach(s=>query.select(s).boundingClientRect());query.exec(rects=>resolve({selectors,rects}));});
 if(action==='scroll')return new Promise(resolve=>wx.pageScrollTo({selector:value,duration:0,complete:()=>setTimeout(()=>resolve(true),120)}));
 if(action==='reset-account'){a.globalData={...a.globalData,token:'isolated-summary-amount',user:q.user};p.onShow();return true;}
 if(action==='account-switch'){a.globalData={...a.globalData,token:'isolated-summary-B',user:{id:991102}};p.onHide();return{amount:p.data.heldAmount,display:p.data.heldAmountDisplay,amountDialog:p.data.amountDialog};}
 return true;
}
