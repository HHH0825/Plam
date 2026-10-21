async function(action){
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),p=()=>getCurrentPages().slice(-1)[0];
 if(action==='layout'){await p().qaRewardLayout();await wait(100)}
 if(action==='claim'){await p().claimGrowth({currentTarget:{dataset:{id:'visits_7'}}});await wait(150)}
 if(action==='items'){p().changeGrowth({currentTarget:{dataset:{tab:'items'}}});await wait(80)}
 if(action==='ledger'){p().changeGrowth({currentTarget:{dataset:{tab:'ledger'}}});await wait(80)}
 if(action==='scroll'){await new Promise(r=>wx.pageScrollTo({selector:'.growth-card',duration:0,complete:r}));await wait(100)}
 if(action==='ad'){p().advertisement();await wait(80)}
 if(action==='switch'){getApp().globalData.token='isolated-rewards-bob';await p().onShow();await wait(1200)}
 if(action==='member'){await new Promise((resolve,reject)=>wx.navigateTo({url:'/pages/membership/index',success:resolve,fail:reject}));await wait(1000)}
 if(action==='notice'){p().openAnnouncement();await wait(180)}
 if(action==='close-notice'){p().closeAnnouncement();await wait(600)}
 const d=p().data;
 return {route:p().route,error:d.error,balance:d.model?.balance,tab:d.growthTab,rows:d.growthRows?.length,firstLabel:d.days?.[0]?.label,count:d.model?.checkin?.claimed_count,claimed:d.model?.achievements?.find(r=>r.id==='visits_7')?.claimed,ads:d.model?.advertisement,layout:d.qaRewardLayout,announcementOpen:d.announcementOpen,feedback:d.feedbackMessage,plans:d.plans?.length};
}
