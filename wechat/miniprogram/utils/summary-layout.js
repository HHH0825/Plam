const DEFAULT_MONTHLY={kind:'columns',size:26,height:40,scroll:true}
const DEFAULT_OVERVIEW={kind:'columns',size:20,height:31,scroll:true}
function chooseMonthly(width,countWidth,probes){
  const column=width-countWidth-14-20,full=width-20
  for(const size of [26,24,22,20])if(probes[size]?.width<=column)return{kind:'columns',size,height:Math.ceil(probes[size]?.height||size*1.4)+3,scroll:false}
  return{kind:'stacked',size:20,height:Math.ceil(probes[20]?.height||28)+3,scroll:(probes[20]?.width||0)>full}
}
function chooseOverview(width,probes){
  // Mirrors the card's 1 : 1.5 : 1 flex weights, padding and thin borders.
  const inner=width-10,column=inner*1.5/3.5-11,side=inner/3.5-11
  for(const size of [20,18,16])if(probes[size]?.width<=column&&(probes.count?.width||0)<=side&&(probes.days?.width||0)<=side)return{kind:'columns',size,height:Math.ceil(probes[size]?.height||size*1.4)+3,scroll:false}
  return{kind:'stacked',size:20,height:Math.ceil(probes[20]?.height||28)+3,scroll:(probes[20]?.width||0)>inner-10}
}
function measureSummary(page,kind){
  if(typeof wx==='undefined'||!wx.createSelectorQuery||!page._visible)return
  const overview=kind==='overview',field=overview?'amountLayout':'monthlyLayout',attempt={}
  page['_'+field+'Measure']=attempt
  const token=getApp().globalData.token,sequence=overview?page._statsSequence:page._sequences.monthly
  const current=()=>page._visible&&page['_'+field+'Measure']===attempt&&token===getApp().globalData.token&&sequence===(overview?page._statsSequence:page._sequences.monthly)
  try{wx.createSelectorQuery().in(page).select('.summary-region').boundingClientRect().select('.summary-count').boundingClientRect().selectAll('.summary-probe').boundingClientRect().exec(rects=>{
    if(!current())return
    const [region,count,rows=[]]=rects||[];if(!region?.width)return
    const probes=Object.fromEntries(rows.map(r=>[r.dataset.size,r]))
    if(!probes[overview?20:26])return
    const layout=overview?chooseOverview(region.width,probes):chooseMonthly(region.width,count?.width||64,probes)
    if(JSON.stringify(layout)!==JSON.stringify(page.data[field]))page.setData({[field]:layout})
  })}catch(_){/* Single-line scroll remains usable if measurement is unavailable. */}
}
module.exports={DEFAULT_MONTHLY,DEFAULT_OVERVIEW,chooseMonthly,chooseOverview,measureSummary}
