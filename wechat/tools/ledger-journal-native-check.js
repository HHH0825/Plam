function(action,value){
 const a=getApp(),p=getCurrentPages().slice(-1)[0];
 if(action==='setup'){
  if(a._journalQA)throw Error('Fixture already active');
  const q={globalData:a.globalData,requireSession:a.requireSession,http:wx.cloud.callHTTPFunction,get:wx.getStorageSync,set:wx.setStorageSync,remove:wx.removeStorageSync,storage:new Map(),calls:[],fixtures:value};
  a._journalQA=q;a.globalData={...a.globalData,token:'isolated-journal',expiresAt:Math.floor(Date.now()/1000)+3600,user:{id:991299,username:'记账验证示例',avatar_key:'cat'}};a.requireSession=()=>true;
  wx.getStorageSync=k=>q.storage.get(k)||'';wx.setStorageSync=(k,v)=>q.storage.set(k,v);wx.removeStorageSync=k=>q.storage.delete(k);
  wx.cloud.callHTTPFunction=function(spec){const route=spec.path.split('?')[0].replace('/api/mp',''),method=(spec.method||'GET').toUpperCase();q.calls.push({route,method});let statusCode=200,data=[];
   if(method!=='GET'){statusCode=403;data={error:'隔离验证禁止业务写入'};}
   else if(route==='/auth/me')data={user:a.globalData.user,account_age_days:7,capabilities:{storage_locations:true,item_cover_icons:true,cash_ledger:1}};
   else if(route==='/ledger/settings')data={enabled:true};
   else if(route==='/ledger/entries'){const date=spec.path.match(/[?&]date=([^&]+)/)?.[1]||null,query=decodeURIComponent(spec.path.match(/[?&]q=([^&]+)/)?.[1]||''),entries=q.fixtures.entries.filter(r=>(!date||r.occurred_on===date)&&(!query||r.name.includes(query)));data={date,entries,summary:q.fixtures.summary,filtered_summary:date?q.fixtures.day_summaries[date]||{count:0,gross_expense:'0.00',income:'0.00',refund:'0.00',expense:'0.00',net:'0.00'}:q.fixtures.summary,day_summaries:q.fixtures.day_summaries,next_offset:null};}
   else if(route==='/ledger/statistics')data=q.fixtures.stats;
   else if(route==='/ledger/history')data={entries:q.fixtures.history,total:2,next_offset:null};
   else if(/^\/ledger\/entries\/[a-f0-9]{32}$/.test(route))data=q.fixtures.entries.find(r=>r.id===route.split('/').pop());
   else if(route==='/items')data=[{id:991201,name:'常用的机械键盘',category:'数码',icon_type:'digital',status:'active',purchase_price:'399.00',purchase_date:'2026-10-12',holding_days:2,net_cost:'399.00',daily_net_cost:'199.50',revision:1}];
   else if(route==='/storage-locations')data={locations:[],unassigned_count:1};
   const response={statusCode:200,data:JSON.stringify({palm_http:1,statusCode,data}),header:{}};setTimeout(()=>{spec.success?.(response);spec.complete?.(response)},0);return Promise.resolve(response);
  };return{fixtureOnly:true};
 }
 const q=a._journalQA;
 if(action==='restore'){if(q){wx.getStorageSync=q.get;wx.setStorageSync=q.set;wx.removeStorageSync=q.remove;wx.cloud.callHTTPFunction=q.http;a.globalData=q.globalData;a.requireSession=q.requireSession;delete a._journalQA;}return{fixture:false};}
 if(!q)throw Error('No cash ledger fixture');
 if(action==='state')return{route:p.route,error:p.data.error,ready:p.data.ready,enabled:p.data.enabled,rows:p.data.groups?.length||p.data.rows?.length||0,selectedCount:p.data.selectedCount,selectedDate:p.data.selectedDate,dayError:p.data.dayError,dayRows:p.data.dayEntries?.length,calendarDays:p.data.calendarCells?.filter(x=>!x.blank).length,kindIndex:p.data.kindIndex,query:p.data.query,bar:p.getTabBar?.()?.data,writes:q.calls.filter(c=>c.method!=='GET').length};
 if(action==='select-date'){p.selectDay({currentTarget:{dataset:{date:value}}});return true;}
 if(action==='cancel-filter'){p.filter({currentTarget:{dataset:{key:'kindIndex'}},detail:{value:2}});p.closeFilter();return true;}
 if(action==='search'){p.toggleSearch();p.search({detail:{value:'午餐'}});return true;}
 if(action==='journal-geometry')return new Promise(resolve=>{const t=setTimeout(()=>resolve({unavailable:true}),2000),query=wx.createSelectorQuery().in(p);query.select('.ledger-page').boundingClientRect().selectAll('.calendar-day').boundingClientRect().selectAll('.ledger-icon-button').boundingClientRect().select('.ledger-journal-panel').boundingClientRect().exec(r=>{clearTimeout(t);resolve({page:r[0],days:r[1],icons:r[2],panel:r[3],window:wx.getWindowInfo()})});});
 if(action==='geometry')return new Promise(resolve=>{const timer=setTimeout(()=>resolve({unavailable:true}),2000),query=wx.createSelectorQuery().in(p);query.select('.ledger-page').boundingClientRect().selectAll('.ledger-category').boundingClientRect().select('.ledger-primary').boundingClientRect().select('.ledger-row').boundingClientRect().selectAll('.ledger-check').boundingClientRect().exec(r=>{clearTimeout(timer);resolve({page:r[0],categories:r[1],save:r[2],row:r[3],checks:r[4],window:wx.getWindowInfo()})});});
 if(action==='large'){p.setData({summary:{...p.data.summary,expenseText:'12,345,678,901,234,567,890.01',netText:'12,345,678,901,234,567,890.01'}});return true;}
 if(action==='detail'){p.open({currentTarget:{dataset:{id:q.fixtures.entries[2].id}}});return true;}
 if(action==='history-select'){p.mode({currentTarget:{dataset:{key:'purchase:991201',mode:'paid'}}});return true;}
 if(action==='record-fill'){p.change({currentTarget:{dataset:{key:'amount'}},detail:{value:'28.00'}});p.change({currentTarget:{dataset:{key:'name'}},detail:{value:'午餐'}});return true;}
 if(action==='clear-draft'){p._dirty=false;wx.disableAlertBeforeUnload?.();return true;}
 if(action==='filter'){p.openFilter();return true;}
 return true;
}
