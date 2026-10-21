function totals(gross='0.00',refund='0.00',income='0.00',count=0){
 const c=s=>BigInt(s.replace('.','')),d=n=>{n=n<0n?-n:n;const s=n.toString().padStart(3,'0');return s.slice(0,-2)+'.'+s.slice(-2)},expense=c(gross)-c(refund),net=c(income)-expense
 return {gross_expense:gross,refund,income,expense:d(expense),net:d(net),expense_label:expense<0n?'本月退款结余':'本月支出',net_label:net>0n?'本月净收入':net<0n?'本月净支出':'本月收支持平',count}
}
const categories=[['food','餐饮','1300.00','0.00'],['shopping','购物','980.00','128.00'],['transport','交通','460.00','0.00'],['other','其他','528.50','0.00']].map(([key,name,g,r])=>({key,name,...totals(g,r)}))
const amounts=['236.00','128.00','185.00','260.00','320.00','168.00','196.00','486.00','145.00','210.00','286.00','272.00','336.50','40.00']
const stats={month:'2026-10',summary:totals('3268.50','128.00','6000.00',17),categories,days:Array.from({length:31},(_,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),...totals(amounts[i]||'0.00',i===1?'128.00':'0.00',i===0?'6000.00':'0.00',i<14?1:0)}))}
function simple(g='0.00',r='0.00',i='0.00',month='2026-10'){
 const s=totals(g,r,i);return {month,summary:s,categories:g!=='0.00'||r!=='0.00'?[{key:'food',name:'餐饮',...totals(g,r)}]:[],days:[{date:month+'-01',...s}]}
}
module.exports={stats,totals,simple}
