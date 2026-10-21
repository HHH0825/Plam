async function(parent,child){
 const app=getApp();if(!app.globalData.token.startsWith('isolated-rewards-'))throw Error('Offline fixture required');
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),page=()=>getCurrentPages().slice(-1)[0];
 await new Promise((resolve,reject)=>wx.switchTab({url:'/pages/'+parent+'/index',success:resolve,fail:reject}));await wait(450);
 const owner=page(),bar=owner.getTabBar();if(!bar)throw Error('Missing custom navigation before transition');
 await new Promise((resolve,reject)=>wx.navigateTo({url:child,success:resolve,fail:reject}));await wait(350);
 const visited=page().route;if(page()===owner)throw Error('Child page did not open');
 await new Promise((resolve,reject)=>wx.navigateBack({delta:1,success:resolve,fail:reject}));await wait(650);
 const current=page(),returned=current.getTabBar(),boxes=await new Promise(resolve=>wx.createSelectorQuery().in(returned).selectAll('.tab-bar').boundingClientRect().exec(r=>resolve(r[0]||[])));
 return{parent,child,visited,route:current.route,samePage:current===owner,selected:returned.data.selectedRoute,hidden:returned.data.hidden,menuOpen:returned.data.menuOpen,customBars:boxes.length,barHeight:boxes[0]?.height||0,stack:getCurrentPages().length,error:current.data.error||''};
}
