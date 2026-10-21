async function(action,value){
 const app=getApp();if(app.globalData.token!=='isolated-native-member')throw Error('Requires offline fixture project');
 if(!app._refineQA){const memory=new Map();app._refineQA={get:wx.getStorageSync,set:wx.setStorageSync};wx.getStorageSync=k=>memory.get(k);wx.setStorageSync=(k,v)=>memory.set(k,v)}
 const settle=async()=>{const start=Date.now();while(Date.now()-start<5000){const p=getCurrentPages().slice(-1)[0];if(!p.data.loading&&!p.data.statsLoading&&!p.data.cashLoading&&!p.data.catalogLoading){await new Promise(r=>setTimeout(r,150));return p}await new Promise(r=>setTimeout(r,80))}throw Error('Page did not settle')};
 if(action==='open'){app.globalData.qaState=value.kind||'active';const url=value.url;await new Promise((resolve,reject)=>{const method=['/pages/me/index','/pages/statistics/index','/pages/ledger/index'].includes(url.split('?')[0])?'switchTab':'redirectTo';wx[method]({url,success:resolve,fail:reject})});await settle()}
 const p=getCurrentPages().slice(-1)[0];
 if(action==='pane'){p.switchView({currentTarget:{dataset:{key:value}}});await settle();await new Promise(r=>setTimeout(r,200));await p.qaLayout();}
 if(action==='layout')await p.qaLayout();
 if(action==='select-default'){p.memberBookChange({detail:{value:p.data.memberBooks.findIndex(b=>b.id==='default')}});await settle();}
 if(action==='member-error')p.setData({memberError:'会员工具读取失败示例'});
 if(action==='book-tab')p.bookTabChange({currentTarget:{dataset:{tab:value}}});
 if(action==='book-editor')await p.newBook();
 if(action==='book-cover'){p.bookInput({currentTarget:{dataset:{field:'name'}},detail:{value:'旅行与生活的小故事'}});p.coverChange({currentTarget:{dataset:{index:value}}})}
 if(action==='sort-start')await p.startBookSort();
 if(action==='sort-step')p.bookSortStep({currentTarget:{dataset:{index:value.index,step:value.step}}});
 if(action==='sort-cancel')p.cancelBookSort();
 if(action==='sort-save')await p.finishBookSort();
 if(action==='close-book')p.closeBookSheet();
 if(action==='drag-preview')await p.qaDrag(value.from,value.to);
 if(action==='drag-end')p.bookDragEnd();
 if(action==='drag-cancel')p.bookDragCancel();
 if(action==='budget-editor')await p.openBudget();
 if(action==='budget-copy')await p.copyBudget();
 if(action==='fold-note')p.toggleStartup();
 if(action==='fold-tools')p.toggleMemberTools();
 if(action==='service')p.toggleService();
 if(action==='restore'){wx.getStorageSync=app._refineQA.get;wx.setStorageSync=app._refineQA.set;delete app._refineQA;return true}
 await new Promise(r=>setTimeout(r,180));
 return {route:p.route,error:p.data.error||p.data.catalogError||'',memberActive:p.data.member?p.data.member.active:p.data.membership?p.data.membership.active:p.data.memberActive,
  bookPreview:p.data.bookPreview,keyboardInset:p.data.bookKeyboardInset,appearanceTab:p.data.appearancePreviewTab,appearance:p.data.appearance,appearanceDirty:p.data.appearanceDirty,previewPath:!!p.data.appearancePreviewPath,previewError:p.data.appearancePreviewError,terms:p.data.service?.terms,bookIds:p.data.activeBooks?.map(b=>b.id),sorting:p.data.bookSorting,sortDirty:p.data.bookSortDirty,sortPending:p.data.bookSortPending,dragId:p.data.dragBook?.id,dragTarget:p._bookDrag?.to,cover:p.data.bookForm?.cover,
  view:p.data.view,layout:p.data.qaLayout,selectedBook:p.data.memberBookId,itemStats:!!p.data.itemStats,featureCount:p.data.features?.length,analysisRemoved:!p.runAnalysis,tagsRemoved:!p.addTag,bookTab:p.data.bookTab,bookSheetOpen:p.data.bookSheetOpen,budgetSheetOpen:p.data.budgetSheetOpen,budgetDraftDirty:p.data.budgetDraftDirty,
  budgetTotal:p.data.budgetTotal,startupExpanded:p.data.startupExpanded,serviceExpanded:p.data.serviceExpanded,memberToolsExpanded:p.data.memberToolsExpanded,
  tools:p.data.memberTools?.map(r=>r.mode),retired:p.data.retired,freeFeatures:p.data.freeFeatures,memberFeatures:p.data.memberFeatures};
}
