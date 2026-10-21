const ticket = '/assets/membership/ticket.png'
const tools = [
  {mode:'books',title:'我的账本',note:'多账本与流水整理',icon:'/assets/membership/books.png'},
  {mode:'budgets',title:'月度预算',note:'总预算与分类预算',icon:'/assets/membership/budget.png'}
]
function beijingDate(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return ''
  const date = new Date((seconds + 8 * 3600) * 1000)
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0,10).replace(/-/g,'.') : ''
}
function baseCard(status, failed=false) {
  const base={kind:'loading',badge:'读取中',description:'正在读取会员资料…',action:'查看权益 ›',image:ticket}
  if (failed) return {...base,kind:'error',badge:'读取失败',description:'会员状态暂不可用，请重试'}
  if (!status) return base
  if (status.supported === false) return {...base,kind:'unsupported',badge:'暂未开放',description:'会员工具暂未开放，已有功能继续免费'}
  const expiry = beijingDate(status.expires_at)
  if (status.active && expiry) return {...base,kind:'active',badge:'已开通',description:'有效期至 '+expiry,action:'管理会员 ›',image:'/assets/membership/hero.png'}
  if (status.status === 'expired') return {...base,kind:'expired',badge:'已到期',description:(expiry?'到期于 '+expiry+' · ':'')+'已有记录保留',action:'续费会员 ›'}
  if (status.status === 'free' && status.active === false) return {...base,kind:'free',badge:'会员订阅',description:'让记录更省心，让生活更有条理'}
  return baseCard(null,true)
}
function card(status,failed=false){
 const r=baseCard(status,failed),titles={free:'猫爪会员 · 查看权益',active:'猫爪会员 · 已开通',expired:'已到期 · 续费会员',loading:'会员资料读取中…',error:'会员状态读取失败',unsupported:'猫爪会员 · 暂未开放'}
 const date=beijingDate(status?.expires_at),detail=r.kind==='active'&&date?'有效期至 '+date:r.kind==='expired'&&date?'到期于 '+date:''
 return {...r,compactTitle:titles[r.kind]||titles.error,compactDetail:detail}
}
module.exports={tools,card,beijingDate}
