async function(name){
 const app=getApp();if(!app.globalData.token.startsWith('isolated-rewards-'))throw Error('Offline project required');
 const wait=ms=>new Promise(r=>setTimeout(r,ms));app.globalData.qaState='active';
 if(!['member-tools','editor','rewards','item','monthly','fixed-expenses','storage-locations','membership'].includes(name))throw Error('Unknown package');
  await new Promise((resolve,reject)=>wx.switchTab({url:'/pages/items/index',success:resolve,fail:reject}));
  const url='/pages/'+name+'/index'+(name==='item'?'?id=1':name==='member-tools'?'?mode=books':'');
  await new Promise((resolve,reject)=>wx.navigateTo({url,success:resolve,fail:reject}));
  for(let i=0;i<80;i++){const p=getCurrentPages().slice(-1)[0];if(p.route==='pages/'+name+'/index'&&!p.data.loading)break;await wait(100)}
  const p=getCurrentPages().slice(-1)[0];return {name,passed:p.route==='pages/'+name+'/index'&&!p.data.loading&&!p.data.error,route:p.route,error:p.data.error||'',cloudWrites:0,realPayments:0};
}
