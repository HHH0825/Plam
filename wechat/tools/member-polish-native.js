async function(template,tab){
 const app=getApp(),p=getCurrentPages().slice(-1)[0];
 if(app.globalData.token!=='isolated-native-member'||p.route!=='pages/member-tools/index')throw Error('Requires the offline appearance sandbox');
 for(const [field,id]of [['theme','blue'],['template',template],['sticker','cat']])p.chooseAppearance({currentTarget:{dataset:{field,id}}});
 p.appearanceTab({currentTarget:{dataset:{tab}}});
 await new Promise(resolve=>setTimeout(resolve,250));
 const start=Date.now();while(p.data.appearancePreviewLoading&&Date.now()-start<6000)await new Promise(resolve=>setTimeout(resolve,100));
 if(p.data.appearancePreviewError||!p.data.appearancePreviewPath||p.data.appearancePreviewLoading)throw Error(p.data.appearancePreviewError||'Preview did not settle');
 return {route:p.route,template,tab,dirty:p.data.appearanceDirty,base64:wx.getFileSystemManager().readFileSync(p.data.appearancePreviewPath,'base64')};
}
