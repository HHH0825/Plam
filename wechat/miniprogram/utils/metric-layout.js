// Read intrinsic text widths in one batch; amounts never need to be split.
function choose(width, fullWidth, probes, detail = false) {
 const sizes = detail ? [28,26,24] : [24,22,20]
 const days = probes.days || {width:0,height:32}
 const space = Math.max(0, width - (detail ? 37 : 19))
 const dailySpace = space * (detail ? 1.4/2.4 : 1.15/2)
 const daysSpace = space * (detail ? 1/2.4 : .85/2)
 const result = (kind,size) => ({kind,size,height:Math.ceil(Math.max(days.height,probes[size]?.height||size*1.35)+6),...(probes.total?{totalHeight:Math.ceil(probes.total.height+6)}:{})})
 for (const size of sizes) if (probes[size] && probes[size].width <= dailySpace && days.width <= daysSpace) return result('columns',size)
 for (const size of sizes) if (probes[size] && probes[size].width <= width && days.width <= width) return result('stacked',size)
 if (!detail) for (const size of sizes) if (probes[size] && probes[size].width <= fullWidth && days.width <= fullWidth) return result('wide',size)
 return result(detail ? 'stacked' : 'wide',sizes[sizes.length-1])
}
function measure(page, detail = false, done = () => {}) {
 if (!wx.createSelectorQuery || !page._visible) { done(); return }
 const attempt = {}; page._metricMeasure = attempt
 const token = getApp().globalData.token, sequence = page._sequence
 const current = () => page._metricMeasure === attempt && page._visible && sequence === page._sequence && token === getApp().globalData.token
 try {
  wx.createSelectorQuery().in(page).selectAll('.metric-region').boundingClientRect().selectAll('.metric-available').boundingClientRect().selectAll('.metric-probe').boundingClientRect().exec(rows => {
   if (!current()) return
   const [regions=[],available=[],texts=[]] = rows || [], layouts = {}
   for (const region of regions) {
    const id = region.dataset.id, column = available.find(r=>r.dataset.id === id)
    if (!column || !column.width) continue
    const probes = Object.fromEntries(texts.filter(r=>r.dataset.id === id).map(r=>[r.dataset.size,r]))
    if (!probes.days || !probes[detail?28:24]) continue
    layouts[id] = choose(column.width,region.width,probes,detail)
   }
   const key = detail ? 'costLayout' : 'metricLayouts', value = detail ? layouts.detail : layouts
   if (!value || JSON.stringify(value) === JSON.stringify(page.data[key])) { done(); return }
   page.setData({[key]:value},()=>{if(current())done()})
  })
 } catch (_) { if(current())done() }
}
module.exports={choose,measure}
