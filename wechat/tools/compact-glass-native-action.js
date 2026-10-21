function(action) {
  const p=getCurrentPages().slice(-1)[0];
  if(!p)return {ok:false,reason:'no current page'};
  if(action==='add') { const bar=p.getTabBar();bar.add();bar.add();return {triggered:'duplicate add',from:p.route}; }
  if(action==='items') {p.getTabBar().switchTab({currentTarget:{dataset:{index:0}}});return {triggered:'switch items',from:p.route};}
  if(action==='my') {p.getTabBar().switchTab({currentTarget:{dataset:{index:1}}});return {triggered:'switch My',from:p.route};}
  if(action==='fixture') {const paths={...p.data.photoPaths};const shown=Array.from({length:20},(_,i)=>{const source=p.data.items[i%p.data.items.length];if(paths[source.id])paths[9000+i]=paths[source.id];return {...source,id:9000+i,photo_url:null}});p.setData({shown,photoPaths:paths});return {fixtureItems:shown.length,cloudWrites:0};}
  if(action==='state')return {route:p.route,stack:getCurrentPages().map(x=>x.route),selected:p.getTabBar && p.getTabBar() ? p.getTabBar().data.selected : null};
}
