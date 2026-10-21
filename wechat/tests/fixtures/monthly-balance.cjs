const samples = [
  ['recovery', '0.00', '0.00', '0.00', '500.00', '-500.00', '本月净回收', '500.00'],
  ['expense', '100.00', '0.00', '0.00', '0.00', '100.00', '本月净支出', '100.00'],
  ['net-expense', '14047.00', '0.00', '0.00', '500.00', '13547.00', '本月净支出', '13,547.00'],
  ['net-recovery', '100.00', '20.00', '30.00', '200.00', '-50.00', '本月净回收', '50.00'],
  ['balanced', '100.00', '20.00', '30.00', '150.00', '0.00', '本月收支持平', '0.00'],
  ['zero', '0.00', '0.00', '0.00', '0.00', '0.00', '本月收支持平', '0.00'],
  ['negative-zero', '0.00', '0.00', '0.00', '0.00', '-0.00', '本月收支持平', '0.00'],
  ['principal-only', '0.00', '0.00', '0.00', '0.00', '0.00', '本月收支持平', '0.00'],
  ['large', '0.00', '0.00', '0.00', '999999999999999.99', '-999999999999999.99', '本月净回收', '999,999,999,999,999.99'],
  ['empty', '0.00', '0.00', '0.00', '0.00', '0.00', '本月暂无收支', '0.00']
]
module.exports = samples.map(([key,purchase,maintenance,fixed,disposal,net,label,amount]) => ({
  key,label,amount,report:{month:'2026-10',today:'2026-10-12',cutoff_date:'2026-10-12',is_current:true,has_activity:key!=='empty',
    totals:{purchase_count:purchase==='0.00'?0:1,purchase_total:purchase,maintenance_total:maintenance,fixed_expense_total:fixed,
      disposal_total:disposal,cashflow_net:net,installment_principal_total:key==='principal-only'?'500.00':'0.00'},
    purchases:[],purchase_leaders:[],memories:[]}
}))
