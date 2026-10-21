async function(action){
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),page=()=>getCurrentPages().slice(-1)[0],p=page();let special={};
 const scroll=()=>new Promise(resolve=>wx.createSelectorQuery().selectViewport().scrollOffset().exec(r=>resolve(r[0]?.scrollTop)));
 const rect=selector=>new Promise(resolve=>wx.createSelectorQuery().select(selector).boundingClientRect().exec(r=>resolve(r[0])));
 if(action==='entry'){await new Promise(r=>wx.pageScrollTo({selector:'.growth-entry',duration:0,complete:r}));await wait(120);getApp().globalData.qaEntryScroll=await scroll()}
 if(action==='open'){await p.openGrowth();await wait(100);special={bounds:await rect('.growth-dialog'),header:await rect('.growth-heading'),list:await rect('.growth-scroll')};getApp().globalData.qaGrowthHeader=special.header?.top}
 if(action==='items'){p.changeGrowth({currentTarget:{dataset:{tab:'items'}}});await wait(100)}
 if(action==='ledger'){p.changeGrowth({currentTarget:{dataset:{tab:'ledger'}}});await wait(100)}
 if(action==='scroll-check'){special={header:await rect('.growth-heading'),initial:getApp().globalData.qaGrowthHeader};}
 if(action==='close'){p.closeGrowth();await wait(150);special={scroll:await scroll(),original:getApp().globalData.qaEntryScroll}}
 if(action==='error'){getApp().globalData.qaGrowthError=true;await p.openGrowth();getApp().globalData.qaGrowthError=false}
 if(action==='retry')await p.refreshGrowth();
 if(action==='claim-close'){
  p.changeGrowth({currentTarget:{dataset:{tab:'visits'}}});getApp().globalData.qaSlowClaim=true;
  const task=p.claimGrowth({currentTarget:{dataset:{id:'visits_7'}}});await wait(100);p.closeGrowth();special={closedWhileBusy:p.data.busy&&!p.data.growthOpen};await task;getApp().globalData.qaSlowClaim=false;
 }
 if(action==='repeat')await p.claimGrowth({currentTarget:{dataset:{id:'visits_7'}}});
 if(action==='switch'){getApp().globalData.token='isolated-rewards-bob';p.onShow();await wait(1000)}
 const d=p.data;return {route:p.route,error:d.error,open:d.growthOpen,loading:d.growthLoading,windowError:d.growthError,tab:d.growthTab,rows:d.growthRows.length,balance:d.model?.balance,pending:d.growthPending,claimed:d.growthClaimed,flash:d.claimedFlash,busy:d.busy,...special};
}
