const api = require('./api')
const ledger = require('./ledger')
const { readCards } = require('./discovery')
const { navigate } = require('./navigation')
const COLORS = ['#F4CE63', '#F4CCD9', '#E8DDC7', '#DCD8CF']
const count = n => Number.isSafeInteger(n) && n >= 0
function amount(value, signed = false) {
  if (typeof value !== 'string' || !(signed ? /^-?\d+\.\d{2}$/ : /^\d+\.\d{2}$/).test(value)) return null
  return /^-?0+\.00$/.test(value) ? '0.00' : value
}
function cents(value) { return value.replace('.', '').replace(/^0+(?=\d)/, '') }
function compare(a, b) { return a.length - b.length || (a > b ? 1 : a < b ? -1 : 0) }
function add(a, b) {
  let carry = 0, out = '', i = a.length - 1, j = b.length - 1
  while (i >= 0 || j >= 0 || carry) {
    const n = (i >= 0 ? Number(a[i--]) : 0) + (j >= 0 ? Number(b[j--]) : 0) + carry
    out = n % 10 + out; carry = Math.floor(n / 10)
  }
  return out.replace(/^0+(?=\d)/, '') || '0'
}
function decimal(value) { const s = value.padStart(3, '0'); return s.slice(0, -2) + '.' + s.slice(-2) }
function percent(n, total) {
  if (total === '0') return 0
  const an = n.slice(0, 14), at = total.slice(0, 14)
  return Math.max(0, Math.min(100, Number(an) / Number(at) * 10 ** (n.length - an.length - total.length + at.length) * 100))
}
function distribution(rows, purchase) {
  if (!Array.isArray(rows) || purchase === null || rows.some(r => !r || typeof r.name !== 'string' || !r.name.trim() || amount(r.amount) === null)) {
    return { available: false, error: '分类分布暂不可用，请重新读取或同步服务端。', rows: [], empty: false }
  }
  const sorted = rows.map((r, i) => ({ name: r.name, cents: cents(r.amount), order: i })).sort((a,b) => -compare(a.cents,b.cents) || a.order-b.order)
  const total = sorted.reduce((s,r) => add(s,r.cents), '0')
  if (compare(total, cents(purchase)) !== 0) return { available:false, error:'分类金额与购置合计不一致，请重新读取。', rows:[], empty:false }
  const grouped = sorted.length > 3 ? [...sorted.slice(0,3), {name:'其余分类',cents:sorted.slice(3).reduce((s,r)=>add(s,r.cents),'0')}] : sorted
  return { available:true, error:'', empty:total==='0', rows:grouped.map((r,i)=>({key:i,name:r.name,amountText:ledger.money(decimal(r.cents)),percent:percent(r.cents,total),color:COLORS[i]})) }
}
function presentStats(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !count(raw.total_items) && amount(raw.net_cost_total,true) === null) throw Error('物品统计返回不完整，请重新读取。')
  const keys = ['purchase_total','maintenance_total','fixed_expense_total','disposal_total']
  const labels = ['购置','维修','关联订阅／分期费用','处置回收']
  const net = amount(raw.net_cost_total,true), values = keys.map(key => amount(raw[key]))
  const states = ['active','idle','disposed'], stateLabels = ['使用中','闲置','已处置']
  const counts = states.map(k => raw.status_counts?.[k])
  const statesValid = counts.every(count) && (!count(raw.total_items) || counts.reduce((a,b)=>a+b,0) === raw.total_items)
  return { netText:net===null?'暂不可用':ledger.money(net), netAvailable:net!==null,
    breakdown:keys.map((key,i)=>({key,label:labels[i],available:values[i]!==null,text:values[i]===null?'暂不可用':ledger.money(values[i])})),
    states:states.map((key,i)=>({key,label:stateLabels[i],text:statesValid?String(counts[i]):'—',available:statesValid})),
    compatible:net!==null && values.every(v=>v!==null) && statesValid,
    distribution:distribution(raw.categories,values[0]) }
}
function reminders(raw) {
  const priority = ['manual_idle','warranty_due','warranty_expired','repair_leader','purchase_yoy','digital_share']
  return readCards(raw).map((card,i)=>({...card,order:i,priority:priority.includes(card.kind)?priority.indexOf(card.kind):priority.length}))
    .sort((a,b)=>a.priority-b.priority||a.order-b.order).slice(0,2)
    .map((card,i)=>({...card,paw:i===0?'/assets/purchase-entry/progress-paw.png':'/assets/item-doodle/paw.png'}))
}
function empty() { return { itemStats:null,itemStatsLoading:false,itemStatsError:'',itemReminders:[],itemInsightsLoading:false,itemInsightsError:'',itemMonth:ledger.today().slice(0,7),itemLayout:{main:32,small:18,stacked:false},itemMainSizes:[32,30,28],itemSmallSizes:[18,16,14] } }
function invalidate(page) {
  page._itemSequences = { stats:(page._itemSequences?.stats||0)+1, insights:(page._itemSequences?.insights||0)+1 }
  page._itemMeasure = null
}
function current(page, token) { return ledger.current(page,token) && page.data.view==='items' }
async function section(page, name, reuse=false) {
  const token=page._token, sequence=(page._itemSequences ||= {})[name]=(page._itemSequences[name]||0)+1
  const isStats=name==='stats', prefix=isStats?'itemStats':'itemInsights'
  const retained=isStats?!!page.data.itemStats:!!page._itemInsightsReady
  page.setData({[prefix+'Loading']:!retained,[prefix+'Error']:''})
  const valid=()=>current(page,token)&&page._itemSequences[name]===sequence
  try {
    const path=isStats?'/stats':'/insights'
    const raw=await (reuse?require('./display-cache').read(path):api.request(path))
    if(!valid())return
    if(!isStats)page._itemInsightsReady=true
    page.setData(isStats?{itemStats:presentStats(raw)}:{itemReminders:reminders(raw)})
  } catch(e) { if(valid())page.setData({[prefix+'Error']:e.message,...(retained?{}:isStats?{itemStats:null}:{itemReminders:[]})}) }
  finally { if(valid())page.setData({[prefix+'Loading']:false},()=>{if(isStats)measure(page)}) }
}
async function load(page,reuse=false) {
  const token=page._token, epoch=page._paneEpoch
  page.setData({itemMonth:ledger.today().slice(0,7)})
  await Promise.allSettled([section(page,'stats',reuse),section(page,'insights',reuse)])
  if(current(page,token)&&page._paneEpoch===epoch){measure(page);page.restoreScroll()}
}
function measure(page) {
  if(!current(page,page._token)||!page.data.itemStats||!wx.createSelectorQuery)return
  const attempt=page._itemMeasure={},token=page._token,seq=page._itemSequences?.stats
  wx.createSelectorQuery().in(page).select('.item-dashboard-main').boundingClientRect().select('.item-dashboard-breakdown').boundingClientRect().selectAll('.item-dashboard-probe').boundingClientRect().exec(r=>{
    if(!current(page,token)||page._itemMeasure!==attempt||seq!==page._itemSequences?.stats||!r?.[0]||!r[1]||!r[2]?.length)return
    const probes=Object.fromEntries(r[2].map(x=>[x.dataset.field+'-'+x.dataset.size,x.width]))
    const main=[32,30,28].find(s=>probes['net-'+s]<=r[0].width)||28
    const small=[18,16,14].find(s=>page.data.itemStats.breakdown.every(x=>probes[x.key+'-'+s]<=(r[1].width-12)/2))
    page.setData({itemLayout:{main,small:small||18,stacked:!small}})
  })
}
const methods = {
  loadItemStats(){return section(this,'stats')},loadItemInsights(){return section(this,'insights')},
  itemStatsInfo(){wx.showModal({title:'物品成本说明',content:'按全部未删除物品累计，包含已处置物品。购置＋维修＋关联物品已付订阅／分期费用－处置回收；分期本金不重复计入。与记账页按实际收付统计的口径不同。',showCancel:false})},
  itemAnalysis(e){const kind=e?.currentTarget?.dataset?.kind; navigate(this,'/pages/insights/index'+(kind?'?kind='+encodeURIComponent(kind):''))},
  itemMonthly(){navigate(this,'/pages/monthly/index?month='+ledger.today().slice(0,7))}
}
module.exports={empty,invalidate,load,measure,methods,presentStats,reminders,distribution,add,decimal}
