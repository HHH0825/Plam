const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
require('./local-config.cjs')
const {presentMonthly,readMonthly,presentCashflow,REPORT_DESIGN_VERSION}=require('../miniprogram/utils/monthly')
const {planReport,planShareCover}=require('../miniprogram/utils/report-image')
const samples=require('./fixtures/monthly-balance.cjs')
const context=()=>({font:'',measureText(s){const size=Number(this.font.match(/(\d+)px/)?.[1]||20);return{width:[...s].length*size*.7}}})
for(const {key,report,label,amount} of samples)test('monthly direction stays consistent and exact: '+key,()=>{
  const saved=JSON.stringify(report),edition=presentMonthly(readMonthly(report))
  assert.equal(edition.balance.label,label);assert.equal(edition.balance.amount,amount)
  assert.equal(edition.totalsText.cashflow_net,require('../miniprogram/utils/report-design').money(report.totals.cashflow_net))
  assert.equal(JSON.stringify(report),saved)
  const long=planReport(context(),report),cover=planShareCover(context(),report)
  const words=layout=>layout.commands.filter(c=>c.lines).map(c=>c.lines.join(''))
  for(const layout of [long,cover]){
    const text=words(layout)
    assert.ok(!text.some(s=>/收支差额|钱花在哪里|¥-/.test(s)))
    assert.ok(text.every(s=>!s.includes('…')),'no truncated financial text')
    if(report.has_activity){
      assert.ok(text.includes(label));assert.ok(text.includes('¥'+amount))
      assert.ok(text.includes(edition.cashflowNote));assert.ok(text.includes(edition.cashflowScope))
    }
  }
  if(!report.has_activity){assert.ok(words(long).includes('这一页，暂时留白。'));assert.ok(words(cover).includes(label));assert.ok(!words(long).includes('本月支出与回收'))}
  if(key==='principal-only'){assert.equal(edition.totalsText.installment_principal_total,'500.00');assert.ok(edition.cashflowScope.includes('分期本金另列'))}
})
test('negative zero and huge money use strings without changing general signed cost formatting',()=>{
  assert.equal(presentCashflow('-000.00',true).amount,'0.00')
  assert.equal(presentCashflow('-9007199254740993.01',true).amount,'9,007,199,254,740,993.01')
  assert.equal(require('../miniprogram/utils/report-design').money('-500.00'),'-500.00')
  assert.notEqual(REPORT_DESIGN_VERSION,'purchases-20261010')
})
test('monthly page and discovery consume the shared presentation, not the signed net',()=>{
  for(const name of ['insights','monthly']){
    const template=fs.readFileSync(require.resolve('../miniprogram/pages/'+name+'/index.wxml'),'utf8')
    assert.ok(template.includes('.balance.label'));assert.ok(template.includes('.balance.amount'))
    assert.ok(!/收支差额|钱花在哪里|{{[^}]*cashflow_net/.test(template))
  }
})
