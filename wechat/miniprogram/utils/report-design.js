// Shared page/poster design units. The printable sheet is 672px inside a 720px canvas.
const VERSION = 'monthly-balance-20261012'
const ASSET = '/assets/white-doodle/'
const PALETTE = { paper:'#FFFFFF', border:'#FFFFFF', ink:'#292929', muted:'#707070', line:'#EAEAEA', sage:'#FFE15A', rose:'#F3ABC0', maintenance:'#9CCDE8', ledger:'#FFF9DA', green:'#292929' }
const SPACE = { left: 52, right: 668, sheetWidth: 672, inset: 28, section: 38, row: 14, title: 34, body: 28, small: 22, caption: 20 }
function pageStyle(width = 390) {
  const unit = (Math.min(480, Math.max(280, Number(width) || 390)) - 36) / SPACE.sheetWidth
  const values = { unit, title: Math.max(17, SPACE.title * unit), body: Math.max(14, SPACE.body * unit), small: Math.max(11, SPACE.small * unit), caption: Math.max(11, SPACE.caption * unit) }
  return Object.entries(values).map(([key, value]) => '--report-' + key + ':' + value.toFixed(4) + 'px;').join('')
}
function money(value) {
  const match = String(value).match(/^(-?)(\d+)(\.\d{2})$/)
  return match ? match[1] + match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + match[3] : String(value)
}
module.exports = { VERSION, ASSET, PALETTE, SPACE, pageStyle, money }
