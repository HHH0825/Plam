// Natural days in Beijing; UTC arithmetic avoids device timezone and DST shifts.
const DAY = 86400000
function today(now = Date.now()) { return new Date(now + 8 * 3600000).toISOString().slice(0, 10) }
function stamp(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null
  const n = Date.parse(value + 'T00:00:00Z')
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value ? n : null
}
function days(end, start) { const a = stamp(end), b = stamp(start); return a == null || b == null ? null : (a - b) / DAY }
function monthOn(anchor, offset) {
  if (stamp(anchor) == null || !Number.isInteger(offset)) return null
  const [year, month, day] = anchor.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + offset, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, last))
  return target.toISOString().slice(0, 10)
}
const clamp = n => Math.max(0, Math.min(100, n))
function progress(row, on = today()) {
  const installment = row.kind === 'installment', disabled = row.status !== 'active'
  const result = {label:installment ? '距下期付款' : '服务剩余',value:'未填写',percent:null,urgent:false,disabled,state:disabled ? ({paused:'已暂停',ended:'已结束'}[row.status] || '') : '',caption:'',hint:'',completed:false}
  if (installment && row.completed) return {...result,label:'还款状态',value:'本金已还清',completed:true}
  const end = installment ? row.next_due_on : row.service_until
  let left = days(end, on)
  // Old partial responses can still show their server-provided countdown, never a guessed ratio.
  if (left == null) left = installment ? row.due_days : row.remaining_days
  if (left == null || !Number.isFinite(left)) return {...result,hint:installment ? '未安排付款日期' : '未设置服务到期日期'}
  result.value = left < 0 ? `已${installment ? '逾期' : '过期'} ${-left} 天` : left === 0 ? '今天到期' : `${left} 天`
  result.urgent = left < 7
  result.caption = end ? `${installment ? '下期付款' : '服务到期'} ${end}` : ''
  let start = row.service_from
  if (installment) start = monthOn(row.anchor_on, (Number.isInteger(row.next_cycle_index) ? row.next_cycle_index : 0) - 1)
  const duration = days(end, start), untilStart = days(start, on)
  if (duration != null && duration >= 0) {
    result.percent = duration === 0 ? (left > 0 ? 100 : 0) : clamp(left / duration * 100)
    if (!installment && untilStart > 0) Object.assign(result,{label:'尚未开始',value:`${untilStart} 天后生效`,percent:100,urgent:false})
  } else result.hint = installment ? '周期资料不完整，暂不显示进度' : '补充开始日期可显示进度'
  if (left <= 0) result.percent = 0
  return result
}
function present(row, on = today()) {
  const due = row.next_due_on ? days(row.next_due_on, on) : row.due_days
  const left = row.service_until ? days(row.service_until, on) : row.remaining_days
  return {...row,stateText:{active:'管理中',paused:'已暂停',ended:'已结束'}[row.status],kindText:row.kind === 'installment' ? '设备分期' : '会员／服务',
    dueText:row.completed ? '本金已还清' : due == null ? '未安排付款日期' : due < 0 ? `付款已逾期 ${-due} 天` : due === 0 ? '今天付款到期' : `距付款还有 ${due} 天`,
    serviceText:left == null ? '' : left < 0 ? `服务已过期 ${-left} 天` : left === 0 ? '服务今天到期' : `服务剩余 ${left} 天`,
    urgent:row.status === 'active' && (due != null && due < 7 || left != null && left < 7),progress:progress(row,on)}
}
function untilMidnight(now = Date.now()) { return DAY - ((now + 8 * 3600000) % DAY) + 100 }
module.exports = {today,days,monthOn,progress,present,untilMidnight}
