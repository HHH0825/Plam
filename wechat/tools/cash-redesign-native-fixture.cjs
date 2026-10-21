const fixture=require('../tests/fixtures/cash-redesign.cjs'),items=require('../tests/fixtures/item-dashboard.cjs')
const entries=[{id:'a'.repeat(32),name:'午餐',category:'food',category_name:'餐饮',amount:'28.00',kind:'expense',source:'manual',source_name:'手动记账',occurred_on:'2026-10-14'},{id:'b'.repeat(32),name:'公交',category:'transport',category_name:'交通',amount:'12.00',kind:'expense',source:'manual',source_name:'手动记账',occurred_on:'2026-10-14'}]
console.log(JSON.stringify({ledger:fixture.stats,items:items.stats,insights:items.insights,entries}))
