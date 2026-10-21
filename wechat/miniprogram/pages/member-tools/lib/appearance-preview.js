// Public, fixed example data only. Never substitute account data in this preview.
const cashModel={monthLabel:'2026年10月',cutoff:'2026-10-16',empty:false,topCategory:'餐饮',topDate:'10月12日',
 summary:{expense_label:'本月支出',net_label:'本月净支出',grossDisplay:'¥368.00',expenseDisplay:'¥348.00',incomeDisplay:'¥120.00',netDisplay:'¥228.00',refundDisplay:'¥20.00'},
 rows:[{name:'餐饮',display:'¥228.00',ratio:228/368,color:'#F3ABC0'},{name:'居家',display:'¥140.00',ratio:140/368,color:'#9CCDE8'}]}
const collectionReport={month:'2026-10',today:'2026-10-16',cutoff_date:'2026-10-16',is_current:true,has_activity:true,
 totals:{purchase_count:1,purchase_total:'128.00',maintenance_total:'20.00',fixed_expense_total:'18.00',installment_principal_total:'0.00',disposal_total:'30.00',cashflow_net:'136.00'},
 purchases:[{id:1,name:'小猫手账本',purchase_date:'2026-10-12',purchase_price:'128.00',icon_type:'stationery',cover_mode:'icon',cover_icon_key:'notebook'}],
 purchase_leaders:[{id:1,name:'小猫手账本',purchase_price:'128.00',share:'100.00'}],memories:[]}
const signature=a=>JSON.stringify([a.theme,a.template])
module.exports={cashModel,collectionReport,signature}
