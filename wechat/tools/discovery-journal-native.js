async function(action){
 const app=getApp();if(!app.globalData.token.startsWith('isolated-rewards-'))throw Error('Offline fixture required');
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),page=()=>getCurrentPages().slice(-1)[0];
 const tab=async name=>{await new Promise((resolve,reject)=>wx.switchTab({url:'/pages/'+name+'/index',success:resolve,fail:reject}));for(let i=0;i<100&&page().route!=='pages/'+name+'/index';i++)await wait(100);await wait(300)};
 const ready=async()=>{for(let i=0;i<100;i++){const p=page();if(p.route==='pages/insights/index'&&!p.data.cardsLoading&&!p.data.statsLoading&&!p.data.monthlyLoading)return p;await wait(100)}throw Error('Offline discovery did not become ready')};
 const tap=(p,index,field)=>p.toggleCard({currentTarget:{dataset:{index,field}}});
 if(action==='me-shot'){await tab('me');return{route:page().route}};
 if(action==='metrics'){return new Promise(resolve=>wx.createSelectorQuery().selectAll('.item-link').boundingClientRect().selectAll('.item-name').boundingClientRect().selectAll('.item-link .chevron').boundingClientRect().exec(resolve))};
 if(action==='entry'){
  await tab('me');const menu=await new Promise(resolve=>wx.createSelectorQuery().in(page()).select('#menu-discover').boundingClientRect().exec(r=>resolve(!!r[0])));
  await tab('statistics');page().switchView({currentTarget:{dataset:{key:'items'}}});await wait(600);page().itemAnalysis({currentTarget:{dataset:{kind:'warranty_due'}}});const p=await ready();await wait(350);wx.pageScrollTo({scrollTop:0,duration:0});await wait(100);
  const geometry=await new Promise(resolve=>wx.createSelectorQuery().in(p).select('.item-link').boundingClientRect().select('.discovery-card').boundingClientRect().exec(resolve));
  return{fullWidth:geometry[0].width>=geometry[1].width-40,buttonHeight:geometry[0].height,removed:!menu,route:p.route,first:p.data.cards[0].kind,items:p.data.cards[0].shownItems.length,basis:p.data.cards[0].basisOpen,details:p.data.detailsOpen,trend:p.data.trendOpen,located:!p._anchorPending,error:p.data.cardsError};
 };
 if(action==='expand'){
  const p=page();tap(p,0,'basisOpen');tap(p,0,'itemsOpen');p.toggleDetails();p.toggleTrend();await wait(240);
  return{basis:p.data.cards[0].basisOpen,count:p.data.cards[0].shownItems.length,all:p.data.cards[0].items.length,details:p.data.detailsOpen,trend:p.data.trendOpen,art:p.data.cards[0].shownItems[0].art};
 };
 if(action==='refresh-failure'){
  const p=page(),before=JSON.stringify(p.data.cards);app.globalData.qaFailInsights=true;await p.loadCards();const retained=JSON.stringify(p.data.cards)===before,error=p.data.cardsError;app.globalData.qaFailInsights=false;await p.loadCards();
  return{retained,error,recovered:!p.data.cardsError,basis:p.data.cards[0].basisOpen,count:p.data.cards[0].shownItems.length};
 };
 if(action==='return'){
  const p=page();p.monthlyReport();for(let i=0;i<100&&page().route!=='pages/monthly/index';i++)await wait(100);const monthly=page().route;await new Promise((resolve,reject)=>wx.navigateBack({success:resolve,fail:reject}));await ready();
  return{monthly,route:page().route,basis:page().data.cards[0].basisOpen,details:page().data.detailsOpen,count:page().data.cards[0].shownItems.length};
 };
 if(action==='account'){
  const p=page();p.onHide();app.globalData.token='isolated-rewards-discovery-B';app.globalData.user={...app.globalData.user,id:902};app.globalData.qaFailInsights=true;p.onShow();const reset=!p.data.cards.length&&!p.data.detailsOpen&&!p.data.trendOpen;await wait(600);const error=p.data.cardsError,empty=p.data.cards.length===0;app.globalData.qaFailInsights=false;await p.loadCards();
  return{reset,empty,error,reloaded:p.data.cards.length>0,folded:!p.data.cards[0].basisOpen&&p.data.cards[0].shownItems.length===3};
 };
 if(action==='fresh'){
  await new Promise((resolve,reject)=>wx.navigateBack({success:resolve,fail:reject}));for(let i=0;i<100&&page().route!=='pages/statistics/index';i++)await wait(100);page().itemAnalysis({currentTarget:{dataset:{}}});const p=await ready();
  return{defaultFolded:!p.data.detailsOpen&&!p.data.trendOpen&&!p.data.cards[0].basisOpen,items:p.data.cards[0].shownItems.length,route:p.route};
 };
}
