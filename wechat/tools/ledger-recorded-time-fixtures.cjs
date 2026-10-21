// Isolated display examples; these never represent a user's ledger.
const ledger=require('../miniprogram/utils/ledger'),calendar=require('../miniprogram/utils/ledger-calendar')
const common={occurred_on:'2026-10-14',created_at:'2026-10-15T06:08:36.999999+00:00',updated_at:'2026-10-16T10:00:00+00:00',state:'active',revision:0,item_id:null,item_available:false,item_removed:false,notes:'补记收支日期，记录时间保留实际新增时刻。',changes:[],refunds:[],editable:true}
const entries=[
 {...common,id:'a'.repeat(32),name:'午餐',amount:'28.00',kind:'expense',category:'food',category_name:'餐饮',source:'manual',source_name:'手动记账'},
 {...common,id:'b'.repeat(32),name:'相机维修费用',amount:'12.00',kind:'expense',category:'maintenance',category_name:'维修',source:'maintenance',source_name:'维修支出',editable:false},
 {...common,id:'c'.repeat(32),name:'兼职收入',amount:'100.00',kind:'income',category:'parttime',category_name:'兼职',source:'manual',source_name:'手动记账',created_at:'2026-10-15T14:09:10+08:00'},
 {...common,id:'d'.repeat(32),name:'午餐退款',amount:'5.00',kind:'refund',category:'food',category_name:'餐饮',source:'refund',source_name:'关联退款',parent_id:'a'.repeat(32),created_at:'2026-10-15T02:10:03-04:00'},
 {...common,id:'e'.repeat(32),name:'旧记录 · 时间缺失',amount:'18.00',kind:'expense',category:'food',category_name:'餐饮',source:'manual',source_name:'手动记账',created_at:null}
]
const detail={...entries[0],refunds:[entries[3]]}
const summary={count:5,gross_expense:'58.00',refund:'5.00',expense:'53.00',income:'100.00',net:'47.00',expense_label:'本月支出',net_label:'本月净收入'}
const days=Array.from({length:31},(_,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),...(i===13?summary:{count:0,gross_expense:'0.00',refund:'0.00',expense:'0.00',income:'0.00',net:'0.00'})}))
function present(name,initial){
 const data={...initial,loading:false,busy:false,error:'',enabled:true,supported:true,summary:ledger.summary(summary),month:'2026-10',monthLabel:'2026年10月',maxMonth:'2026-10',canNext:false}
 if(name==='ledger')Object.assign(data,{groups:ledger.groups(entries,{'2026-10-14':summary}),nextOffset:null})
 if(name==='statistics')Object.assign(data,{view:'cash',days,calendarCells:calendar.cells('2026-10',days,'2026-10-14','2026-10-15'),selectedDate:'2026-10-14',selectedLabel:calendar.dayLabel('2026-10-14'),selectedDay:calendar.exactDay(days,'2026-10-14'),dayEntries:entries.map(ledger.row),dayNextOffset:null,dayLoading:false,cashAnalysis:null})
 if(name==='ledger-detail')data.row={...ledger.row(detail),refunds:detail.refunds.map(ledger.row)}
 return data
}
module.exports={entries,detail,summary,days,present}
