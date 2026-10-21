const time=require('./expense-progress')
const fields=['name','kind','status','amount','cycle','cycle_days','anchor_on','service_from','service_until','item_id','principal_total','periods','notes']
function cents(value){
 const s=String(value??'');if(!/^\d+(?:\.\d{1,2})?$/.test(s))return null
 const [a,b='']=s.split('.'),n=Number(a)*100+Number(b.padEnd(2,'0'))
 return Number.isSafeInteger(n)&&n<=99999999900?n:null
}
const money=n=>n===null||!Number.isSafeInteger(n)?'—':(n/100).toFixed(2)
function validDate(s){const n=Date.parse(s+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===s}
function following(f){
 if(!validDate(f.anchor_on))return ''
 if(f.kind==='installment'||f.cycle==='month')return time.monthOn(f.anchor_on,1)
 if(f.cycle==='quarter')return time.monthOn(f.anchor_on,3)
 if(f.cycle==='year')return time.monthOn(f.anchor_on,12)
 const n=Number(f.cycle_days);return Number.isInteger(n)&&n>0&&n<=3650?new Date(Date.parse(f.anchor_on+'T00:00:00Z')+n*86400000).toISOString().slice(0,10):''
}
function principal(f,row){
 const total=cents(f.principal_total),n=Number(f.periods),paid=row?cents(row.paid_principal||'0'):0
 if(total===null||!Number.isInteger(n)||n<1||n>600||total<n||paid===null||paid>total)return null
 const remaining=total-paid,index=row?.next_cycle_index||0
 return Math.min(remaining,index<n-1?Math.floor(total/n):remaining)
}
function validate(f,initial,today=time.today()){
 if(!String(f.name||'').trim())return '请填写订阅或分期名称'
 if(cents(f.amount)===null)return f.kind==='installment'?'请填写有效的每期利息／手续费':'请填写有效的每期费用'
 if(!validDate(f.anchor_on))return '请选择有效的付款安排日期'
 if(f.kind==='installment'&&principal(f)===null)return '请核对本金和期数，期数为1—600期，本金至少可分到每期1分'
 if(f.kind==='subscription'&&f.cycle==='days'&&(!Number.isInteger(Number(f.cycle_days))||Number(f.cycle_days)<1||Number(f.cycle_days)>3650))return '自定义周期请填写1—3650天'
 if(initial){
  if(!validDate(initial.paid_on)||initial.paid_on>today)return '实际付款日期不能晚于今天'
  const cost=cents(initial.amount),p=f.kind==='installment'?cents(initial.principal):0
  if(cost===null||p===null||cost+p<=0)return '本次实际付款金额需大于0，免费服务可仅保存计划'
  if(f.kind==='installment'&&p>cents(f.principal_total))return '本次已还本金不能超过本金总额'
 }
 return ''
}
function summary(f,initial,row){
 const cost=cents(f.amount),p=principal(f,row),n=Number(f.periods),total=cents(f.principal_total)
 const cycle={month:'每月',quarter:'每季',year:'每年',days:'每'+f.cycle_days+'天'}[f.cycle]||'每期'
 let title=f.kind==='installment'?`本金 ${money(total)} 元 · 分 ${f.periods||'—'} 期`:`${cycle} ${money(cost)} 元`
 let detail=f.kind==='installment'?`${row?'下期':'每期'}本金 ${money(p)} 元${cost===0?'，免息':`，每期额外费用 ${money(cost)} 元`}`:`${initial?'本期扣费':'下次付款'} ${f.anchor_on||'待填写'}`
 if(f.kind==='installment'&&!row&&p!==null&&total!==null&&n>0&&total%n)detail+=`；最后一期本金 ${money(total-p*(n-1))} 元`
 let note='仅保存计划，不会自动生成账目。',actual=''
 if(initial){const a=cents(initial.amount),b=f.kind==='installment'?cents(initial.principal):0;actual=money(a===null||b===null?null:a+b);note=`本次将记支出 ${actual} 元 · ${initial.paid_on}；`+(f.kind==='installment'&&total!==null&&b===total?'本次付款后本金已还清':`下次预计 ${following(f)||'待核对'}`)}
 return {title,detail,note,actual,principal:money(p)}
}
function clean(form){return Object.fromEntries([...fields,'_fees','_feeDraft','_initialDraft'].filter(k=>form[k]!==undefined).map(k=>[k,form[k]]))}
module.exports={fields,cents,money,principal,summary,validate,clean,following}
