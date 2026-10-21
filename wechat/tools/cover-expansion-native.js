async function(action){
 const app=getApp();if(!app.globalData.token.startsWith('isolated-rewards-'))throw Error('Offline fixture required');
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),page=()=>getCurrentPages().slice(-1)[0];
 const event=(key,value)=>({currentTarget:{dataset:{key}},detail:{value}});
 const go=async()=>{await new Promise((resolve,reject)=>wx.navigateTo({url:'/pages/editor/index',success:resolve,fail:reject}));for(let i=0;i<100;i++){const p=page();if(p.route==='pages/editor/index'&&!p.data.coverCapabilityLoading&&!p.data.loading&&p.data.draftReady)return p;await wait(100)}throw Error('Offline editor not ready')};
 if(action==='picker'){
  for(const key of wx.getStorageInfoSync().keys)if(decodeURIComponent(key).includes('127.0.0.1:9')&&key.startsWith('wwj:new-draft:v1:'))wx.removeStorageSync(key);
  await new Promise((resolve,reject)=>wx.switchTab({url:'/pages/items/index',success:resolve,fail:reject}));await wait(300);app.globalData.qaLegacy=false;const p=await go();
  p.openIconPicker();const total=p.data.iconRows.length;p.iconGroupChange(event('digital'));const digital=p.data.iconRows.length;p.iconSearch(event('', '移动电源'));p.selectCoverIcon(event('power-bank'));await wait(200);
  return{capacityBlocked:!!p.selectComponent('#cat-feedback')?.data.capacityOpen,route:p.route,total,digital,result:p.data.iconRows[0].name,selected:p.data.iconSelected,version:p.data.coverCatalogueVersion,enabled:p.data.iconSelectionSupported};
 };
 if(action==='apply'){
  const p=page(),category=p.data.form.category,type=p.data.form.icon_type;p.closeIconPicker();const cancelled=!p.data.form.cover_icon_key;p.openIconPicker();p.iconSearch(event('','键盘'));p.selectCoverIcon(event('keyboard'));await p.applyCoverIcon();p.input(event('name','陪我写作的无线键盘'));p.input(event('purchase_price','199.00'));await p.flushDraft();await wait(180);
  return{cancelled,key:p.data.form.cover_icon_key,art:p.data.coverArt,categoryUnchanged:category===p.data.form.category,typeUnchanged:type===p.data.form.icon_type,closed:!p.data.iconOpen};
 };
 if(action==='legacy'){
  const p=page();app.globalData.qaLegacy=true;await p.retryCoverCapability();p.openIconPicker();const total=p.data.iconRows.length;p.selectCoverIcon(event('power-bank'));const blocked=p.data.iconSelected!=='power-bank';p.selectCoverIcon(event('camera'));await p.applyCoverIcon();p.openIconPicker();await wait(180);
  return{total,blocked,version:p.data.coverCatalogueVersion,note:p.data.coverCatalogueNote,oldIcon:p.data.form.cover_icon_key,visible:p.data.iconOpen};
 };
 if(action==='retry'){
  const p=page();app.globalData.qaLegacy=false;await p.retryCoverCapability();const count=p.data.iconRows.length;p.iconGroupChange(event(''));p.iconSearch(event('','香氛'));p.selectCoverIcon(event('perfume'));await p.applyCoverIcon();return{count,key:p.data.form.cover_icon_key,art:p.data.coverArt,version:p.data.coverCatalogueVersion};
 };
 if(action==='account'){
  const p=page();p.openIconPicker();app.globalData.token='isolated-rewards-covers-B';app.globalData.user={...app.globalData.user,id:902};p.onShow();return{closed:!p.data.iconOpen,rows:p.data.iconRows.length,key:p.data.form.cover_icon_key,disabled:!p.data.coverSupported,note:p.data.error};
 };
}
