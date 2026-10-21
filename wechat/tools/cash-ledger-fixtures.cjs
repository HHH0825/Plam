const ledger=require('../miniprogram/utils/ledger')
const summary={count:7,gross_expense:'13547.00',expense:'13497.00',expense_label:'本月支出',income:'8000.00',refund:'50.00',net:'5497.00',net_label:'本月净支出'}
const entries=[
 {id:'a'.repeat(32),name:'午餐',kind:'expense',category:'food',category_name:'餐饮',amount:'28.00',occurred_on:'2026-10-13',source:'manual',source_name:'手动记账',notes:'和朋友吃顿饭',state:'active',editable:true,revision:1,item_id:null,item_name:'',refunded:'0.00',refunds:[],changes:[]},
 {id:'b'.repeat(32),name:'键盘部分退款',kind:'refund',category:'purchase',category_name:'物品购置',amount:'50.00',occurred_on:'2026-10-13',source:'refund',source_name:'关联退款',state:'active',editable:true,revision:1,parent_id:'c'.repeat(32)},
 {id:'c'.repeat(32),name:'常用的机械键盘',kind:'expense',category:'purchase',category_name:'物品购置',amount:'399.00',occurred_on:'2026-10-12',source:'purchase',source_name:'物品购置',state:'active',editable:false,revision:1,item_id:991201,item_name:'常用的机械键盘',item_available:true,refunded:'50.00',refunds:[{id:'b'.repeat(32),amount:'50.00',occurred_on:'2026-10-13'}],changes:[]},
 {id:'d'.repeat(32),name:'十月工资',kind:'income',category:'salary',category_name:'工资',amount:'8000.00',occurred_on:'2026-10-10',source:'manual',source_name:'手动记账',state:'active',editable:true,revision:1},
 {id:'e'.repeat(32),name:'工作用笔记本电脑',kind:'expense',category:'purchase',category_name:'物品购置',amount:'11999.00',occurred_on:'2026-10-08',source:'purchase',source_name:'物品购置',state:'active',editable:false,revision:1},
 {id:'f'.repeat(32),name:'相机镜头维修',kind:'expense',category:'maintenance',category_name:'维修',amount:'120.00',occurred_on:'2026-10-07',source:'maintenance',source_name:'维修支出',state:'active',editable:false,revision:1},
 {id:'1'.repeat(32),name:'年度服务付款',kind:'expense',category:'subscription',category_name:'订阅',amount:'1001.00',occurred_on:'2026-10-06',source:'subscription',source_name:'订阅付款',state:'active',editable:false,revision:1}
]
const history=[{source:'purchase',source_name:'物品购置',source_id:991201,name:'常用的机械键盘',amount:'399.00',occurred_on:'2026-10-12',fingerprint:'fixture-purchase-v1'},{source:'maintenance',source_name:'维修支出',source_id:991202,name:'相机镜头维修',amount:'120.00',occurred_on:'2026-10-08',fingerprint:'fixture-repair-v1'}]
const stats={summary,categories:[{key:'purchase',name:'物品购置',gross_expense:'12398.00',expense:'12348.00',refund:'50.00'},{key:'subscription',name:'订阅',gross_expense:'1001.00',expense:'1001.00',refund:'0.00'},{key:'maintenance',name:'维修',gross_expense:'120.00',expense:'120.00',refund:'0.00'},{key:'food',name:'餐饮',gross_expense:'28.00',expense:'28.00',refund:'0.00'}],days:Array.from({length:31},(_,i)=>{const date='2026-10-'+String(i+1).padStart(2,'0'),sum=kind=>entries.filter(r=>r.occurred_on===date&&r.kind===kind).reduce((total,r)=>total+Math.round(Number(r.amount)*100),0)/100;return{date,gross_expense:sum('expense').toFixed(2),income:sum('income').toFixed(2),refund:sum('refund').toFixed(2)}})}
function patch(name){
 const base={loading:false,error:'',supported:true,enabled:true,busy:false,ready:true,today:'2026-10-13'}
 if(name==='ledger')return {...base,month:'2026-10',summary:ledger.summary(summary),entries,groups:ledger.groups(entries),nextOffset:null,iconErrors:{}}
 if(name==='statistics')return {...base,month:'2026-10',summary:ledger.summary(summary),categories:stats.categories.map(x=>({...x,expenseText:ledger.money(x.expense),refundText:ledger.money(x.refund),grossText:ledger.money(x.gross_expense),percent:Number(x.expense)/123.48})),trend:stats.days.map(x=>({...x,label:x.date.slice(-2),expenseHeight:Number(x.gross_expense)/119.99,incomeHeight:Number(x.income)/119.99}))}
 if(name==='ledger-record')return {...base,form:{kind:'expense',category:'food',amount:'28.00',occurred_on:'2026-10-13',name:'午餐',notes:'和朋友吃顿饭',item_id:null},categories:ledger.categories('expense'),itemsReady:true}
 if(name==='ledger-detail')return {...base,row:{...ledger.row(entries[2]),refunds:entries[2].refunds.map(ledger.row)}}
 return {...base,total:2,nextOffset:null,selectedCount:1,rows:history.map((x,i)=>({...x,key:x.source+':'+x.source_id,amountText:ledger.money(x.amount),checked:i===0,mode:i===0?'paid':'',paidAmount:x.amount,paidOn:x.occurred_on}))}
}
module.exports={summary,entries,history,stats,patch}
