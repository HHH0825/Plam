const api=require('./api'),ledger=require('./ledger'),analytics=require('./ledger-analytics'),destination=require('./ledger-destination')
function empty(){return {cash:null,cashLoading:true,cashError:'',cashSupported:true,cashEnabled:false,cashMonth:ledger.today().slice(0,7),cashMonthNumber:Number(ledger.today().slice(5,7)),cashLayout:{size:18,stacked:false},cashSizes:[18,16,14]}}
function invalidate(page){page._cashSequence=(page._cashSequence||0)+1;page._cashMeasure=null;page._cashNavigation=false}
async function load(page,account,reuse=false){
 const sequence=page._cashSequence=(page._cashSequence||0)+1,token=getApp().globalData.token,month=ledger.today().slice(0,7)
 const current=()=>page._visible&&sequence===page._cashSequence&&token===getApp().globalData.token
 const retained=page.data.cash&&page.data.cashMonth===month
 page.setData({...retained?{cashLoading:false,cashError:''}:empty(),cashMonth:month,cashMonthNumber:Number(month.slice(5))})
 const read=path=>reuse?require('./display-cache').read(path):api.request(path)
 try{
  account=account||await read('/auth/me');if(!current())return
  if(account.capabilities?.cash_ledger!==1){page.setData({cashSupported:false,cash:null});return}
  const settings=await read('/ledger/settings');if(!current())return
  if(typeof settings?.enabled!=='boolean')throw Error('收支设置暂不可用，请同步服务端。')
  if(!settings.enabled){page.setData({cashEnabled:false,cash:null});return}
  page.setData({cashEnabled:true})
  const raw=await read('/ledger/statistics?month='+month);if(!current())return
  if(raw?.month!==month)throw Error('本月收支返回异常，请重新读取。')
  const s=analytics.totals(raw.summary)
  require('./display-cache').present(page,{cash:[{key:'expense',label:s.expense_label==='本月退款结余'?'退款结余':'支出',display:'¥'+s.expenseText},{key:'income',label:'收入',display:'¥'+s.incomeText},{key:'net',label:s.net_label.replace('本月','').replace('收支持平','持平'),display:'¥'+s.netText}]})
 }catch(e){if(current())page.setData({...(retained?{}:{cash:null}),cashError:e.message})}
 finally{if(current())page.setData({cashLoading:false},()=>measure(page))}
}
function measure(page){
 if(!page._visible||!page.data.cash||!wx.createSelectorQuery)return
 const attempt=page._cashMeasure={},token=getApp().globalData.token,sequence=page._cashSequence
 wx.createSelectorQuery().in(page).select('.me-cash-grid').boundingClientRect().selectAll('.me-cash-probe').boundingClientRect().exec(r=>{
  if(!page._visible||attempt!==page._cashMeasure||token!==getApp().globalData.token||sequence!==page._cashSequence||!r?.[0]||!r[1]?.length)return
  const size=[18,16,14].find(size=>r[1].filter(p=>Number(p.dataset.size)===size).every(p=>p.width<=(r[0].width-24)/3))
  page.setData({cashLayout:{size:size||18,stacked:!size}})
 })
}
function stopClock(page){clearInterval(page._cashClock)}
function startClock(page){stopClock(page);page._cashDay=ledger.today();page._cashClock=setInterval(()=>{if(page._visible&&page._cashDay!==ledger.today()){page._cashDay=ledger.today();load(page)}},30000);page._cashClock?.unref?.()}
module.exports={empty,invalidate,load,measure,startClock,stopClock,methods:{loadCash(){return load(this)},cashStatistics(){destination.open(this)},enableCash(){destination.open(this,true)}}}
