// Keep unavailable values distinct from a real zero; never substitute lifetime totals.
function readOverview(result) {
  const hasCount = Object.prototype.hasOwnProperty.call(result, 'held_items')
  const hasAmount = Object.prototype.hasOwnProperty.call(result, 'held_purchase_total')
  if (hasCount && (!Number.isSafeInteger(result.held_items) || result.held_items < 0)) throw Error('统计数据格式异常，请重新读取')
  if (hasAmount && (typeof result.held_purchase_total !== 'string' || !/^\d+\.\d{2}$/.test(result.held_purchase_total))) throw Error('统计数据格式异常，请重新读取')
  return {
    heldItems: hasCount ? String(result.held_items) : '—',
    heldAmount: hasAmount ? result.held_purchase_total.replace(/\B(?=(\d{3})+\.)/g, ',') : '—',
    statsCompatible: hasCount && hasAmount
  }
}
function readAccountAge(result) {
  return Number.isSafeInteger(result.account_age_days) && result.account_age_days > 0 ? String(result.account_age_days) : '—'
}
module.exports = { readOverview, readAccountAge }
