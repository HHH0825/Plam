async function(action,value){
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const page=()=>getCurrentPages()[getCurrentPages().length-1];
 if(action==='open'){
  await new Promise((resolve,reject)=>wx.navigateTo({url:value,success:resolve,fail:reject}));await wait(750);
 }else if(action==='tab'){
  getApp().globalData.qaAllowGreeting=true;
  await new Promise((resolve,reject)=>wx.switchTab({url:value,success:resolve,fail:reject}));await wait(1800);
 }
 const p=page();
 if(action==='layout'){await p.qaRewardLayout();await wait(80)}
 if(action==='checkin'){await p.checkin();await wait(80)}
 if(action==='exchange'){await p.openExchange();await wait(100)}
 if(action==='redeem'){await p.redeem();await wait(100)}
 if(action==='history'){await p.history();await wait(100)}
 if(action==='history-close')p.closeHistory();
 if(action==='capacity'){
  const f=p.selectComponent('#cat-feedback');f.setData({capacity:p.data.model.capacity,capacityOpen:true});await wait(300);
 }
 if(action==='capacity-close')p.selectComponent('#cat-feedback').closeCapacity();
 if(action==='greeting-close')p.selectComponent('#cat-feedback').closeGreeting();
 if(action==='greeting-go')p.selectComponent('#cat-feedback').goCheckin();
 if(action==='active'){getApp().globalData.qaState='active';await p.load();await wait(500)}
 const d=p.data,f=p.selectComponent('#cat-feedback')?.data;
 return {route:p.route,balance:d.model?.balance,claimed:d.model?.checkin?.today_claimed,extra:d.model?.capacity?.extra,limit:d.model?.capacity?.free_limit,days:d.days?.length,exchangeOpen:d.exchangeOpen,exchange:d.exchange,historyOpen:d.historyOpen,historyRows:d.transactions?.length,error:d.error,layout:d.qaRewardLayout,greetingOpen:f?.greetingOpen,greeting:f?.model?.greeting,capacityOpen:f?.capacityOpen,memberActive:d.membership?.active,memberExpiry:d.expiry,plans:d.plans?.length,announcementOpen:d.announcementOpen}
}
