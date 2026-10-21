// Use CSS pixels, never physical screen resolution or a device-name list.
const clamp = (value, low, high) => Math.min(high, Math.max(low, value))
function welcomeLayout(info = {}) {
  const width = Number.isFinite(info.windowWidth) && info.windowWidth > 0 ? info.windowWidth : 375
  const height = Number.isFinite(info.windowHeight) && info.windowHeight > 0 ? info.windowHeight : 640
  const contentWidth = Math.min(width, 430)
  const compact = height < 640
  const padding = Math.round(clamp(contentWidth * 0.0564, 18, 24))
  const innerWidth = contentWidth - padding * 2
  const titleWidth = Math.round(innerWidth * .826)
  return {
    compact,
    pageStyle: `--welcome-gap:10px;--welcome-title:${contentWidth < 350 ? 28 : 34}px;--welcome-title-width:${titleWidth}px;--welcome-heading-height:${Math.round(titleWidth / 3.66)}px;padding-left:${padding}px;padding-right:${padding}px;min-height:${height}px;`,
    heroStyle: `height:${Math.round(Math.min((innerWidth + 12) / 1.56 + (compact ? 0 : 2), compact ? 175 : 245))}px;`
  }
}
function readWindowInfo() {
  try { return typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : {} } catch (_) { return {} }
}
module.exports = { welcomeLayout, readWindowInfo }
