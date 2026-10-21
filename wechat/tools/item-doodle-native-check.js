function(action) {
  const page=getCurrentPages().slice(-1)[0];
  if(action==='fallback'){page.decorFailed();return {decorError:page.data.decorError,cloudWrites:0};}
  if(action==='retry-fixture'){
    page.disconnectPhotos();page._photos.release(page._photoOwner);page._sequence++;
    page._doodlePhotoSnapshot={photoPaths:page.data.photoPaths,photoStates:page.data.photoStates};
    const item=page.data.shown.find(item=>item.photo_url);
    if(!item)return {fixture:false};
    const paths={...page.data.photoPaths},states={...page.data.photoStates};
    delete paths[item.id];states[item.id]='error';page.setData({photoPaths:paths,photoStates:states});
    return {fixture:true,itemId:item.id,cloudWrites:0};
  }
  if(action==='restore-photo' && page._doodlePhotoSnapshot){page.setData(page._doodlePhotoSnapshot);delete page._doodlePhotoSnapshot;page.observePhotos();}
  return new Promise(resolve=>{
    const selectors=['.item-card','.item-art','.metric-value','.sketch-frame','.photo-retry'];
    const query=wx.createSelectorQuery().in(page);
    selectors.forEach(selector=>query.selectAll(selector).boundingClientRect());
    query.exec(rows=>{
      const layout={};selectors.forEach((selector,index)=>layout[selector]=(rows[index]||[]).map(rect=>({top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height})));
      resolve({route:page.route,layout:page.data.layout,filterOpen:page.data.filterOpen,decorError:page.data.decorError,navigationHidden:page.getTabBar().data.hidden,photos:Object.entries(page.data.photoStates).map(([id,state])=>({id,state})),measurements:layout,cloudWrites:0});
    });
  });
}
