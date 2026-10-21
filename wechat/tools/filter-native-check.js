function() {
  const page=getCurrentPages().slice(-1)[0];
  const bar=page.getTabBar();
  return new Promise(resolve=>{
    const query=wx.createSelectorQuery().in(page);
    ['.sheet-reset','.sheet-apply'].forEach(selector=>query.select(selector).boundingClientRect());
    query.exec(rects=>resolve({route:page.route,filterOpen:page.data.filterOpen,navigationHidden:bar.data.hidden,
      draftStatusIndex:page.data.draftStatusIndex,draftCategoryIndex:page.data.draftCategoryIndex,
      actions:rects.map(rect=>rect && {top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height}),cloudWrites:0}));
  });
}
