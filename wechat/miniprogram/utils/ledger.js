const api = require('./api')
const { serviceScope } = require('./cloud-transport')
const expense = [['food','餐饮','bowl'],['transport','交通','bike'],['shopping','购物','backpack'],['home','居家','lamp'],['fun','娱乐','gamepad'],['health','健康','toiletries'],['study','学习','book'],['other','其他','storage-box']]
const income = [['salary','工资','folder'],['parttime','兼职','notebook'],['gift','红包礼金','storage-box'],['investment','投资收益','pen'],['bonus','奖金补贴','watch'],['business','经营收入','laptop'],['reimbursement','报销回款','folder'],['other','其他','storage-box']]
const automatic = [['purchase','物品购置','laptop'],['maintenance','维修','toolbox'],['subscription','订阅','notebook'],['installment','分期','phone'],['disposal','处置回收','camera']]
const sourceOptions = [{key:'',name:'全部来源'},...Object.entries({manual:'手动记账',purchase:'物品购置',maintenance:'维修支出',subscription:'订阅付款',installment:'分期付款',disposal:'处置回收',refund:'关联退款'}).map(([key,name])=>({key,name}))]
const kindOptions = [{key:'',name:'全部收付'},{key:'expense',name:'支出'},{key:'income',name:'收入'},{key:'refund',name:'退款'}]
function categories(kind){return (kind==='income'?income:expense).map(([key,name,icon])=>({key,name,art:'/assets/item-covers/'+icon+'.png'}))}
function today(){return new Date(Date.now()+8*3600000).toISOString().slice(0,10)}
// Creation timestamps are server instants, separate from the editable cash-flow date.
function recordedAt(value){
 if(typeof value!=='string')return null
 const m=/^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?([Zz]|[+-]\d{2}:\d{2})$/.exec(value)
 if(!m)return null
 const [year,month,day,hour,minute,second]=m.slice(1,7).map(Number),zone=m[7]
 if(year<1||month<1||month>12||day<1||hour>23||minute>59||second>59)return null
 const utc=new Date(0);utc.setUTCFullYear(year,month-1,day);utc.setUTCHours(hour,minute,second,0)
 if(utc.getUTCFullYear()!==year||utc.getUTCMonth()!==month-1||utc.getUTCDate()!==day)return null
 let offset=0
 if(!/^[Zz]$/.test(zone)){
  const hours=Number(zone.slice(1,3)),minutes=Number(zone.slice(4,6))
  if(hours>23||minutes>59)return null
  offset=(hours*60+minutes)*(zone[0]==='+'?1:-1)
 }
 const beijing=new Date(utc.getTime()+(480-offset)*60000)
 if(beijing.getUTCFullYear()<1||beijing.getUTCFullYear()>9999)return null
 const stamp=beijing.toISOString(),date=stamp.slice(0,10),time=stamp.slice(11,19)
 return {date,time,text:date+' '+time}
}
function money(value){const raw=String(value??'0.00'),m=/^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(raw);return m?m[1]+m[2].replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+(m[3]||'').padEnd(2,'0'):raw}
function cents(value){if(!/^\d+(?:\.\d{1,2})?$/.test(String(value)))throw Error('金额最多填写两位小数');const[a,b='']=String(value).split('.');const digits=(a+b.padEnd(2,'0')).replace(/^0+/,'')||'0';if(digits.length>11||digits.length===11&&digits>'99999999900'||digits==='0')throw Error('金额应大于零且不超过999,999,999元');return Number(digits)}
function row(value){const category=[...expense,...income,...automatic].find(c=>c[0]===value.category);return {...value,recordedAt:recordedAt(value.created_at),amountText:money(value.amount),direction:{expense:'支出',income:'收入',refund:'退款'}[value.kind],art:'/assets/item-covers/'+(category?.[2]||'storage-box')+'.png'}}
function summary(value){if(!value)return null;return {...value,grossText:money(value.gross_expense),expenseText:money(value.expense),incomeText:money(value.income),refundText:money(value.refund),netText:money(value.net)}}
function groups(list, daySummaries={}) {
 const out=[]
 for(const value of list){
  let last=out[out.length-1]
  if(!last||last.date!==value.occurred_on){
   const total=daySummaries[value.occurred_on]
   last={date:value.occurred_on,label:Number(value.occurred_on.slice(5,7))+'月'+Number(value.occurred_on.slice(8))+'日'+(value.occurred_on===today()?' · 今天':''),entries:[],totals:total?{...summary(total),grossText:money(total.gross_expense),hasRefund:total.refund!=='0.00'}:null}
   out.push(last)
  }
  last.entries.push(row(value))
 }
 return out
}
function moveMonth(month,delta){const[y,m]=month.split('-').map(Number),d=new Date(0);d.setUTCFullYear(y,m-1+delta,1);return d.toISOString().slice(0,7)}
function scope(){return serviceScope()+'|'+getApp().globalData.user?.id}
function current(page,token=page._token){return page._alive!==false&&page._visible!==false&&token===page._token&&token===getApp().globalData.token}
async function capability(reuse=false){const r=await (reuse?require('./display-cache').read('/auth/me'):api.request('/auth/me'));return r.capabilities?.cash_ledger===1}
function tabPage(statistics=false){return require('./ledger-tabs').create(statistics)}
module.exports={expense,income,automatic,categories,kindOptions,sourceOptions,today,recordedAt,money,cents,row,summary,groups,moveMonth,scope,current,capability,tabPage}
