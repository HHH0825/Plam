async function(action){
 const app=getApp();if(!app.globalData.token.startsWith('isolated-rewards-'))throw Error('Offline fixture required');
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),page=()=>getCurrentPages().slice(-1)[0],event=(key,value)=>({currentTarget:{dataset:{key}},detail:{value}});
 const go=async()=>{await new Promise((resolve,reject)=>wx.navigateTo({url:'/pages/editor/index',success:resolve,fail:reject}));for(let i=0;i<100;i++){const p=page();if(p.route==='pages/editor/index'&&!p.data.coverCapabilityLoading&&!p.data.loading&&p.data.draftReady)return p;await wait(100)}throw Error('Offline editor not ready')};
 if(action==='picker'){
  for(const key of wx.getStorageInfoSync().keys)if(decodeURIComponent(key).includes('127.0.0.1:9')&&key.startsWith('wwj:new-draft:v1:'))wx.removeStorageSync(key);
  await new Promise((resolve,reject)=>wx.switchTab({url:'/pages/items/index',success:resolve,fail:reject}));await wait(300);app.globalData.qaCatalogue=3;const p=await go();p.openIconPicker();const total=p.data.iconRows.length;p.iconGroupChange(event('daily'));const daily=p.data.iconRows.length;p.iconSearch(event('','唇膏'));p.selectCoverIcon(event('lipstick'));await wait(250);
  return{capacityBlocked:!!p.selectComponent('#cat-feedback')?.data.capacityOpen,total,daily,result:p.data.iconRows[0].name,selected:p.data.iconSelected,version:p.data.coverCatalogueVersion,enabled:p.data.iconSelectionSupported};
 };
 if(action==='apply'){
  const p=page(),category=p.data.form.category,type=p.data.form.icon_type;p.closeIconPicker();const cancelled=!p.data.form.cover_icon_key;p.openIconPicker();p.iconSearch(event('','粉饼'));p.selectCoverIcon(event('compact'));await p.applyCoverIcon();p.input(event('name','随身补妆的小粉盒'));p.input(event('purchase_price','99.00'));await p.flushDraft();await wait(180);
  return{cancelled,key:p.data.form.cover_icon_key,art:p.data.coverArt,categoryUnchanged:category===p.data.form.category,typeUnchanged:type===p.data.form.icon_type,closed:!p.data.iconOpen};
 };
 if(action==='version2'){
  const p=page();app.globalData.qaCatalogue=2;await p.retryCoverCapability();p.openIconPicker();const total=p.data.iconRows.length;p.iconGroupChange(event('daily'));const daily=p.data.iconRows.length;p.selectCoverIcon(event('serum'));const blocked=p.data.iconSelected!=='serum';p.selectCoverIcon(event('perfume'));await p.applyCoverIcon();p.openIconPicker();await wait(180);
  return{total,daily,blocked,version:p.data.coverCatalogueVersion,note:p.data.coverCatalogueNote,oldIcon:p.data.form.cover_icon_key};
 };
 if(action==='version1'){
  const p=page();app.globalData.qaCatalogue=1;await p.retryCoverCapability();p.openIconPicker();const total=p.data.iconRows.length;p.selectCoverIcon(event('eyeshadow'));const blocked=p.data.iconSelected!=='eyeshadow';p.selectCoverIcon(event('camera'));await p.applyCoverIcon();p.openIconPicker();await wait(180);
  return{total,blocked,version:p.data.coverCatalogueVersion,note:p.data.coverCatalogueNote,oldIcon:p.data.form.cover_icon_key};
 };
 if(action==='retry'){
  const p=page();app.globalData.qaCatalogue=3;await p.retryCoverCapability();p.iconGroupChange(event(''));p.iconSearch(event('','面膜贴'));p.selectCoverIcon(event('sheet-mask'));await p.applyCoverIcon();return{key:p.data.form.cover_icon_key,art:p.data.coverArt,version:p.data.coverCatalogueVersion};
 };
 if(action==='account'){
  const p=page();p.openIconPicker();app.globalData.token='isolated-rewards-beauty-B';app.globalData.user={...app.globalData.user,id:902};p.onShow();return{closed:!p.data.iconOpen,rows:p.data.iconRows.length,key:p.data.form.cover_icon_key,disabled:!p.data.coverSupported,note:p.data.error};
 };
}
