const money=c=>(Math.abs(c)/100).toFixed(2)
function present(budget){
 const t=budget?.total
 if(!t||!Number.isFinite(t.used_cents)||!(t.limit_cents===null||Number.isFinite(t.limit_cents)))throw Error('预算资料暂不可用')
 if(t.limit_cents===null)return {kind:'unset',title:'本月预算未设置',note:'给花销留一点余地',action:'去设置',configured:false,percent:0}
 if(!Number.isFinite(t.remaining_cents))throw Error('预算资料暂不可用')
 return {kind:t.remaining_cents<0?'over':'ready',title:(t.remaining_cents<0?'已超支 ¥':'剩余 ¥')+money(t.remaining_cents),note:'总预算 ¥'+money(t.limit_cents)+' · 已用 ¥'+(t.used_cents<0?'-':'')+money(t.used_cents),action:'查看 ›',configured:true,percent:Math.max(0,Math.min(100,Number(t.percent)||0))}
}
const loading=()=>({kind:'loading',title:'正在读取本月预算…',note:'按当前月份与账本统计',action:'',configured:false,percent:0})
const failed=()=>({kind:'error',title:'预算暂时未能读取',note:'点击重试，已保存的额度不会改变',action:'重试',configured:false,percent:0})
module.exports={present,loading,failed}
