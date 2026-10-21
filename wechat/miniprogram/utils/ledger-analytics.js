// Decimal strings preserve cents; only drawing proportions use approximate numbers.
const ledger = require('./ledger')
const { calendarDate, monthLabel } = require('./ledger-calendar')
const COLORS = ['#F4CE63','#F2BACD','#A7BE95','#E7D5B4','#C9BFD9','#D9D6CD']
const ORDER = [...ledger.expense, ...ledger.automatic].map(x=>x[0])
function cmp(a,b){return a.length-b.length||(a>b?1:a<b?-1:0)}
function cents(s){if(typeof s!=='string'||!/^\d+\.\d{2}$/.test(s))throw Error('收支金额格式异常，请重新读取。');return s.replace('.','').replace(/^0+(?=\d)/,'')}
function add(a,b){let s='',carry=0,i=a.length-1,j=b.length-1;while(i>=0||j>=0||carry){const n=Number(a[i--]||0)+Number(b[j--]||0)+carry;s=n%10+s;carry=Math.floor(n/10)}return s||'0'}
function sub(a,b){if(cmp(a,b)<0)throw Error('金额相减方向异常');let s='',borrow=0,j=b.length-1;for(let i=a.length-1;i>=0;i--){let n=Number(a[i])-Number(b[j--]||0)-borrow;borrow=n<0?1:0;if(n<0)n+=10;s=n+s}return s.replace(/^0+(?=\d)/,'')}
function decimal(s){s=s.padStart(3,'0');return s.slice(0,-2)+'.'+s.slice(-2)}
function ratio(n,t){if(t==='0')return 0;const a=n.slice(0,14),b=t.slice(0,14);return Math.max(0,Math.min(1,Number(a)/Number(b)*10**(n.length-a.length-t.length+b.length)))}
function validMonth(month,now=ledger.today()){return typeof month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(month)&&month>='0001-01'&&month<=now.slice(0,7)}
function totals(raw){
 if(!raw)throw Error('收支统计暂不可用，请重新读取。')
 const gross=cents(raw.gross_expense),refund=cents(raw.refund),income=cents(raw.income),more=cmp(refund,gross)>0
 const expense=more?sub(refund,gross):sub(gross,refund),netBase=add(income,refund),direction=cmp(netBase,gross),net=direction<0?sub(gross,netBase):sub(netBase,gross)
 if(cents(raw.expense)!==expense||cents(raw.net)!==net)throw Error('收支合计不一致，请重新读取。')
 const expenseLabel=more?'本月退款结余':'本月支出',netLabel=direction>0?'本月净收入':direction<0?'本月净支出':'本月收支持平'
 if(raw.expense_label!==expenseLabel||raw.net_label!==netLabel)throw Error('收支方向不一致，请重新读取。')
 return {...raw,expense_label:expenseLabel,net_label:netLabel,grossText:ledger.money(decimal(gross)),expenseText:ledger.money(decimal(expense)),refundText:ledger.money(decimal(refund)),incomeText:ledger.money(decimal(income)),netText:ledger.money(decimal(net)),hasRefund:refund!=='0',gross,refundCents:refund,incomeCents:income}
}
function snapshot(raw,month,now=ledger.today()){
 if(!validMonth(month,now)||raw?.month!==month||!Array.isArray(raw.categories)||!Array.isArray(raw.days))throw Error('收支统计返回不完整，请同步服务端后重新读取。')
 const summary=totals(raw.summary),seen=new Set(),color=key=>COLORS[(ORDER.indexOf(key)<0?ORDER.length:ORDER.indexOf(key))%5]
 const categories=raw.categories.map(r=>{
  if(!r||typeof r.key!=='string'||!r.key||seen.has(r.key)||typeof r.name!=='string'||!r.name.trim())throw Error('收支分类格式异常。')
  seen.add(r.key);const s=totals(r);return {...s,key:r.key,name:r.name,color:color(r.key),order:ORDER.indexOf(r.key)<0?ORDER.length:ORDER.indexOf(r.key)}
 }).sort((a,b)=>-cmp(a.gross,b.gross)||a.order-b.order||a.key.localeCompare(b.key))
 for(const field of ['gross','refundCents'])if(categories.reduce((s,r)=>add(s,r[field]),'0')!==summary[field])throw Error('分类合计与月度金额不一致，请重新读取。')
 const cutoff=month===now.slice(0,7)?now:(()=>{const d=calendarDate(month);d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);return d.toISOString().slice(0,10)})()
 const dates=new Set(),days=raw.days.map(r=>{
  if(!r||typeof r.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||r.date.slice(0,7)!==month||dates.has(r.date)||calendarDate(month,Number(r.date.slice(8))).toISOString().slice(0,10)!==r.date)throw Error('每日统计日期异常。')
  dates.add(r.date);const s=totals(r);if(r.date>cutoff&&(s.gross!=='0'||s.incomeCents!=='0'||s.refundCents!=='0'))throw Error('每日统计包含未来收付，请重新读取。');return {...s,date:r.date}
 })
 for(const field of ['gross','refundCents','incomeCents'])if(days.reduce((s,r)=>add(s,r[field]),'0')!==summary[field])throw Error('每日合计与月度金额不一致，请重新读取。')
 const positive=categories.filter(r=>r.gross!=='0'),rest=positive.slice(5),grouped=positive.slice(0,5).map(r=>({...r}))
 if(rest.length)grouped.push({key:'__remaining',name:'其余分类',gross:rest.reduce((s,r)=>add(s,r.gross),'0'),color:COLORS[5]})
 const rows=grouped.map((r,index)=>({...r,color:COLORS[index],amountText:ledger.money(decimal(r.gross)),ratio:ratio(r.gross,summary.gross)}))
 const maxDay=days.filter(r=>r.gross!=='0').sort((a,b)=>-cmp(a.gross,b.gross)||a.date.localeCompare(b.date))[0]
 return {month,monthLabel:monthLabel(month),cutoff,summary,categories,rows,empty:summary.gross==='0',topCategory:positive[0]?.name||'',topDate:maxDay?Number(maxDay.date.slice(5,7))+'月'+Number(maxDay.date.slice(8))+'日':'',topDayAmount:maxDay?.grossText||''}
}
function present(model,show=true){
 const value=s=>show?'¥'+s:'••••',s=model.summary
 return {...model,summary:{...s,grossDisplay:value(s.grossText),expenseDisplay:value(s.expenseText),incomeDisplay:value(s.incomeText),netDisplay:value(s.netText),refundDisplay:value(s.refundText)},
  rows:model.rows.map(r=>({...r,display:value(r.amountText)})),categories:model.categories.map(r=>({...r,grossDisplay:value(r.grossText),refundDisplay:value(r.refundText),expenseDisplay:value(r.expenseText)})),showAmounts:show}
}
function drawRing(ctx,rows,x,y,r,width){
 ctx.lineWidth=width;ctx.strokeStyle='#EEEDE8';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke()
 let start=-Math.PI/2
 for(const row of rows){const size=row.ratio*Math.PI*2;if(size<=0)continue;const gap=rows.length>1?Math.min(.018,size/4):0;ctx.beginPath();ctx.strokeStyle=row.color;ctx.arc(x,y,r,start+gap,start+size-gap);ctx.stroke();start+=size}
}
module.exports={cents,add,sub,cmp,decimal,ratio,validMonth,totals,snapshot,present,drawRing}
