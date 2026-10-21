async function(action,value){
 const app=getApp();if(app.globalData.token!=='isolated-native-member')throw Error('Requires offline fixture project');
 if(!app._refineQA){const memory=new Map();app._refineQA={get:wx.getStorageSync,set:wx.setStorageSync};wx.getStorageSync=k=>memory.get(k);wx.setStorageSync=(k,v)=>memory.set(k,v)}
 const settle=async()=>{const start=Date.now();while(Date.now()-start<5000){const p=getCurrentPages().slice(-1)[0];if(!p.data.loading&&!p.data.statsLoading&&!p.data.cashLoading&&!p.data.catalogLoading){await new Promise(r=>setTimeout(r,150));return p}await new Promise(r=>setTimeout(r,80))}throw Error('Page did not settle')};
 if(action==='open'){app.globalData.qaState=value.kind||'active';const url=value.url;await new Promise((resolve,reject)=>{const method=url==='/pages/me/index'?'switchTab':'redirectTo';wx[method]({url,success:resolve,fail:reject})});await settle()}
 const p=getCurrentPages().slice(-1)[0];
 if(action==='book-tab')p.bookTabChange({currentTarget:{dataset:{tab:value}}});
 if(action==='book-editor')await p.newBook();
 if(action==='book-style'){p.bookInput({currentTarget:{dataset:{field:'name'}},detail:{value:'周末旅行手记'}});p.coverChange({detail:{value:'1'}});p.bookSticker({detail:{value:'2'}})}
 if(action==='no-sticker')p.bookSticker({detail:{value:'0'}});
 if(action==='book-keyboard'){p.bookFocus({currentTarget:{dataset:{field:'name'}},detail:{height:300}})}
 if(action==='close-book')p.closeBookSheet();
 if(action==='appearance-tab'){p.appearanceTab({currentTarget:{dataset:{tab:value}}});const start=Date.now();await new Promise(r=>setTimeout(r,200));while(p.data.appearancePreviewLoading&&Date.now()-start<8000)await new Promise(r=>setTimeout(r,100))}
 if(action==='appearance-style'){p.chooseAppearance({currentTarget:{dataset:{field:'theme',id:'sage'}}});p.chooseAppearance({currentTarget:{dataset:{field:'template',id:'journal'}}});p.chooseAppearance({currentTarget:{dataset:{field:'sticker',id:'cat'}}})}
 if(action==='budget-editor')await p.openBudget();
 if(action==='budget-copy')await p.copyBudget();
 if(action==='fold-note')p.toggleStartup();
 if(action==='fold-tools')p.toggleMemberTools();
 if(action==='service')p.toggleService();
 if(action==='restore'){wx.getStorageSync=app._refineQA.get;wx.setStorageSync=app._refineQA.set;delete app._refineQA;return true}
 await new Promise(r=>setTimeout(r,180));
 return {route:p.route,error:p.data.error||p.data.catalogError||'',memberActive:p.data.member?.active||p.data.membership?.active||p.data.memberActive,
  bookPreview:p.data.bookPreview,keyboardInset:p.data.bookKeyboardInset,appearanceTab:p.data.appearancePreviewTab,appearance:p.data.appearance,appearanceDirty:p.data.appearanceDirty,previewPath:!!p.data.appearancePreviewPath,previewError:p.data.appearancePreviewError,terms:p.data.service?.terms,
  bookTab:p.data.bookTab,bookSheetOpen:p.data.bookSheetOpen,budgetSheetOpen:p.data.budgetSheetOpen,budgetDraftDirty:p.data.budgetDraftDirty,
  budgetTotal:p.data.budgetTotal,startupExpanded:p.data.startupExpanded,serviceExpanded:p.data.serviceExpanded,memberToolsExpanded:p.data.memberToolsExpanded,
  tools:p.data.memberTools?.map(r=>r.mode),retired:p.data.retired,freeFeatures:p.data.freeFeatures,memberFeatures:p.data.memberFeatures};
}
