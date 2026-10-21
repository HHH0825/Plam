async function(action){
 const app=getApp();if(!app.globalData.token.startsWith('isolated-rewards-'))throw Error('Offline fixture required');
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),page=()=>getCurrentPages().slice(-1)[0];
 const tab=async name=>{await new Promise((resolve,reject)=>wx.switchTab({url:'/pages/'+name+'/index',success:resolve,fail:reject}));await wait(750)};
 const go=async url=>{await new Promise((resolve,reject)=>wx.navigateTo({url,success:resolve,fail:reject}));await wait(900)};
 const ready=async route=>{for(let i=0;i<60;i++){if(page().route===route&&!page().data.loading)return;await wait(100)}throw Error('Offline page did not become ready '+route)};
 const rect=selector=>new Promise(resolve=>wx.createSelectorQuery().in(page()).select(selector).boundingClientRect().exec(r=>resolve(r?.[0]?.height||0)));
 if(action==='state'){for(const key of wx.getStorageInfoSync().keys)if(key.startsWith('palmLedgerDraft:')&&key.includes('127.0.0.1:9'))wx.removeStorageSync(key);return{route:page().route,error:page().data.error||'',items:page().data.items?.length};};
 if(action==='fold'){
  await tab('ledger');const p=page();if(p.data.accountToolsExpanded){p.toggleAccountTools();await wait(400)}p.toggleAccountTools();await wait(35);const early=await rect('#account-tools-panel');await wait(300);const height=await rect('#account-tools-panel'),open=p.data.accountToolsExpanded,style=p.data.motionFolds.accountToolsExpanded;
  for(let i=0;i<6;i++)p.toggleAccountTools();await wait(450);const latest=p.data.accountToolsExpanded;p.toggleAccountTools();await wait(450);
  return{open,early,height,style,latest,final:p.data.accountToolsExpanded,jobs:Object.keys(p._motionJobs).length,error:p.data.error||''};
 };
 if(action==='statistics'){
  await tab('statistics');const p=page();p.switchView({currentTarget:{dataset:{key:'items'}}});await wait(500);const items=!!p.data.itemStats,hidden=await rect('#account-tools-panel')===0;
  for(const key of ['cash','items','cash','items','cash'])p.switchView({currentTarget:{dataset:{key}}});await wait(700);
  return{items,hidden,view:p.data.view,summary:!!p.data.summary,error:p.data.error||'',selectedBook:p.data.memberBookId};
 };
 if(action==='menu'){
  await tab('items');const bar=page().getTabBar();bar.add();await wait(230);const menuOpen=bar.data.menuOpen;bar.chooseEntry({currentTarget:{dataset:{action:'ledger'}}});await ready('pages/ledger-record/index');const p=page();p.kind({currentTarget:{dataset:{key:'income'}}});p.category({currentTarget:{dataset:{key:'bonus'}}});
  return{menuOpen,route:p.route,categories:p.data.categories.length,selected:p.data.form.category,phase:p.data.motionPanelClass,error:p.data.error||''};
 };
 if(action==='books'){
  app.globalData.qaState='active';await go('/pages/member-tools/index?mode=books');const p=page();await p.newBook();await wait(300);const open=p.data.bookSheetOpen;p.bookInput({currentTarget:{dataset:{field:'name'}},detail:{value:'春日的小收藏'}});p.bookFocus({currentTarget:{dataset:{}},detail:{height:180}});await wait(50);p.bookBlur();p.bookKeyboardChange({detail:{height:0}});
  const preview=p.data.bookPreview.name,hasDraft=p.data.bookForm.name;p.closeBookSheet();const closing=p.data.motionClosing;await wait(240);
  return{open,preview,hasDraft,closing,closed:!p.data.bookSheetOpen,inset:p.data.bookKeyboardInset,error:p.data.error||''};
 };
 if(action==='budget'){
  await go('/pages/member-tools/index?mode=budgets');const p=page();await p.openBudget();await wait(280);p.budgetInput({currentTarget:{dataset:{}},detail:{value:'3210'}});p.confirm=async()=>false;await p.closeBudgetSheet();const kept=p.data.budgetSheetOpen&&p.data.budgetTotal==='3210';p.budgetFocus({currentTarget:{dataset:{}},detail:{height:180}});p.budgetBlur();p.budgetKeyboardChange({detail:{height:0}});p.confirm=async()=>true;await p.closeBudgetSheet();const closing=p.data.motionClosing;await wait(240);
  return{kept,closing,closed:!p.data.budgetSheetOpen,inset:p.data.budgetKeyboardInset,error:p.data.error||''};
 };
 if(action==='growth'){
  await go('/pages/rewards/index');const p=page();await p.openGrowth();p.changeGrowth({currentTarget:{dataset:{tab:'items'}}});await wait(250);const open=p.data.growthOpen,count=p.data.growthRows.length;p.closeGrowth();p.closeGrowth();const closing=p.data.motionClosing;await wait(240);
  return{open,count,closing,closed:!p.data.growthOpen,jobs:Object.keys(p._motionJobs).length,error:p.data.error||''};
 };
 if(action==='growth-shot'){await page().openGrowth();await wait(250);return{open:page().data.growthOpen}};
 if(action==='announcement'){
  await go('/pages/membership/index');await new Promise(r=>wx.pageScrollTo({scrollTop:0,duration:0,complete:r}));await wait(150);const p=page();p.openAnnouncement();await wait(250);await new Promise(r=>wx.createSelectorQuery().in(p).select('.member-announcement-window').boundingClientRect().select('.member-announcement-icon').boundingClientRect().exec(r));p.closeAnnouncement();await wait(60);const flight=p.data.announcementFlightStyle,closing=p.data.announcementClosing;await wait(700);return{flight,closing,closed:!p.data.announcementOpen,error:p.data.error||''};
 };
 if(action==='account'){
  await tab('me');const p=page();if(!p.data.memberToolsExpanded)p.toggleMemberTools();await wait(30);p.onHide();const jobs=Object.keys(p._motionJobs).length;app.globalData.token='isolated-rewards-motion-second';app.globalData.user={...app.globalData.user,id:987654312};p.onShow();await wait(900);
  return{jobs,expanded:p.data.memberToolsExpanded,member:p.data.memberCard.kind,loading:p.data.loading,error:p.data.error||''};
 };
 if(action==='repeat'){
  const before=app.globalData.qaRequests||0;for(let i=0;i<2;i++)for(const name of ['ledger','items','statistics','me'])await tab(name);
  return{reads:(app.globalData.qaRequests||0)-before,visits:8,route:page().route,error:page().data.error||''};
 };
 throw Error('Unknown offline action');
}
