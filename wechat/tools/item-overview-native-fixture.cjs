const fixture=require('../tests/fixtures/item-dashboard.cjs')
const report=require('../tests/fixtures/monthly-balance.cjs').find(x=>x.key==='empty').report
const rows=Array.from({length:6},(_,i)=>({id:991201+i,name:i%2?'周末的帆布包':'常用的马克杯',category:i%2?'衣物':'日用',icon_type:i%2?'clothing':'daily',status:i%2?'idle':'active',holding_days:129,purchase_date:'2026-06-09',purchase_price:'19.90',net_cost:'19.90',daily_net_cost:'0.15',daily_purchase_cost:'0.15',maintenance_total:'0.00',fixed_expense_total:'0.00',disposal_proceeds:'0.00',revision:1,cover_mode:'icon',cover_icon_key:null,storage_location_id:null,storage_location_name:null,notes:''}))
console.log(JSON.stringify({...fixture,report,rows}))
