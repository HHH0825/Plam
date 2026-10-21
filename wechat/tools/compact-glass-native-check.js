function() {
  const page=getCurrentPages().slice(-1)[0];
  const out={route:page.route,cloudWrites:0,visible:page._visible,itemCount:page.data.shown ? page.data.shown.length : undefined};
  return new Promise(resolve=>{
    const timer=setTimeout(()=>resolve({...out,measurementError:'selector timeout'}),2000);
    const finish=()=>{clearTimeout(timer);resolve(out)};
    const q=wx.createSelectorQuery().in(page);
    const selectors=['.page','.item-card','.menu','.cost-card','.detail-hero','.date-seal','.logout-button'];
    selectors.forEach(s=>q.selectAll(s).boundingClientRect());
    q.exec(rows=>{
      out.layout={}; selectors.forEach((s,i)=>out.layout[s]=(rows[i]||[]).map(r=>({top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height})));
      const bar=page.getTabBar && page.getTabBar();
      if(!bar){finish();return;}
      out.navigation={selected:bar.data.selected};finish();
    });
  });
}
