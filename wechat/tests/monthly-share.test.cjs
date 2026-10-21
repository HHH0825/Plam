const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs')
const { planReport, planShareCover, drawLayout } = require('../miniprogram/utils/report-image')
const fixture = () => ({ month: '2026-10', today: '2026-10-07', cutoff_date: '2026-10-07', is_current: true, has_activity: true,
  totals: { purchase_count: 0, purchase_total: '0.00', maintenance_total: '0.00', disposal_total: '500.00', cashflow_net: '-500.00' },
  purchases: [], memories: [], purchase_leaders: [] })
function runtime(responder) {
  const app = { globalData: { token: 'A' }, requireSession: () => !!app.globalData.token }, removed = [], generated = [], requests = [], native = [], notices = []
  let definition, pending, number = 0
  const render = async (_page, report, current) => { assert.ok(current()); const path = report.month + '-' + (++number) + '.png'; generated.push(path); return path }
  const wx = { showShareImageMenu() {}, canIUse: () => true, showToast: o => notices.push(o), getFileSystemManager: () => ({ access: o => o.success() }) }
  const dependencies = {
    '../../utils/api': { request: async path => { requests.push(path); return responder ? responder(path) : fixture() } },
    '../../utils/view': { today: () => '2026-10-07', errorMessage: e => e.message },
    '../../utils/monthly': require('../miniprogram/utils/monthly'),
    '../../utils/report-image': { reportImage: render, shareCoverImage: render, discardImage: p => p && removed.push(p) },
    '../../utils/photo-edit': { nativeCall: (name, options) => { native.push({ name, options }); return new Promise((resolve, reject) => { pending = { resolve, reject } }) } },
    '../../utils/share': require('../miniprogram/utils/share'),
    '../../utils/navigation': { resetNavigation() {}, navigate() {} }
  }
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/pages/monthly/index'), 'utf8'), {
    require: name => name.endsWith('/member')?require('./member-stub.cjs'):dependencies[name], Page: value => { definition = value }, wx, getApp: () => app
  })
  const page = { ...definition, data: structuredClone(definition.data), setData(patch) { Object.assign(this.data, patch) } }
  page.onLoad(); page._visible = true
  return { app, page, wx, removed, generated, requests, native, notices, pending: () => pending }
}
const tick = () => new Promise(resolve => setImmediate(resolve))

test('old report memories are ignored without fetching item metadata', async () => {
  const report = { ...fixture(), memories: [{ key:'x', item_id:9, name:'收藏袋', label:'相伴100天', date:'2026-10-05' }] }
  const h=runtime(path=>path==='/items'?[{id:9,icon_type:'clothing'}]:report)
  await h.page.load()
  assert.equal(h.page.data.edition.memories.length,0)
  await h.page.changeMonth({detail:{value:'2026-09'}})
  assert.equal(h.requests.filter(p=>p==='/items').length,0)
  h.page.onHide();h.page.onShow();await tick()
  assert.equal(h.requests.filter(p=>p==='/items').length,0)
  h.page.onUnload()
})
test('icon read failure keeps the report usable and explicit refresh retries', async () => {
  const report={...fixture(),memories:[{key:'x',item_id:9,name:'收藏袋',label:'相伴100天',date:'2026-10-05'}]}
  const h=runtime(path=>{if(path==='/items')throw Error('unavailable');return report})
  await h.page.load();assert.equal(h.page.data.error,'')
  assert.equal(h.page.data.edition.memories.length,0)
  await h.page.load({type:'tap'})
  assert.equal(h.requests.filter(p=>p==='/items').length,0)
})
test('late report results cannot restore an old account or overwrite a newer month',async()=>{
  const report={...fixture(),memories:[{key:'x',item_id:9,name:'旧账号物品',label:'相伴100天',date:'2026-10-05'}]}
  let finish
  const h=runtime(()=>new Promise(resolve=>{finish=resolve}))
  const read=h.page.load();await tick();h.app.globalData.token='B';h.page.onHide()
  finish(report);await read
  assert.equal(h.page.data.report,null)
  h.app.globalData.token='A';h.page._visible=true
  const oldRead=h.page.load();await tick();const oldFinish=finish
  const next=h.page.changeMonth({detail:{value:'2026-09'}});await tick()
  finish({...report,month:'2026-09'});await next
  oldFinish(report);await oldRead
  assert.equal(h.page.data.report.month,'2026-09');assert.equal(h.page.data.edition.memories.length,0)
})
test('formatting preserves signed values and exact large cents and export uses actual memory icons',()=>{
  const {money}=require('../miniprogram/utils/report-design')
  assert.equal(money('999999999999.99'),'999,999,999,999.99')
  assert.equal(money('-500.00'),'-500.00')
  const report={...fixture(),memories:[{key:'x',item_id:9,name:'收藏袋',label:'相伴100天',date:'2026-10-05'}]}
  const context={font:'',measureText(value){return {width:value.length*20}}}
  const layout=planReport(context,report,{9:'/assets/white-doodle/type-clothing.png'})
  assert.ok(!layout.commands.some(c=>c.src==='/assets/white-doodle/type-clothing.png'))
  assert.ok(layout.commands.some(c=>c.kind==='rect' && c.color==='#FFFFFF'))
  assert.ok(!layout.commands.some(c=>c.kind==='tile'))
  assert.ok(layout.commands.some(c=>c.kind==='rect'&&c.color==='#FFF9DA'))
})
test('missing local decoration keeps the export text and backgrounds usable',()=>{
  const words=[]
  const context={font:'',measureText(value){return {width:value.length*20}},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(value){words.push(value)},drawImage(){throw Error('missing image was drawn')}}
  drawLayout(context,planReport(context,fixture()),new Map())
  assert.ok(words.includes('¥500.00'))
  assert.ok(words.includes('猫爪物帐 · 每月一页'))
})
test('preview, save and image share reuse the same scoped PNG and survive native hide/show', async () => {
  const h = runtime(); await h.page.load()
  let action = h.page.preview(); await tick(); const first = h.page.data.imagePath
  h.page.onHide(); h.pending().resolve(); await action; h.page.onShow()
  assert.equal(h.requests.length, 1); assert.equal(h.page.data.imagePath, first)
  action = h.page.saveImage(); await tick(); h.pending().resolve(); await action
  action = h.page.shareImage(); await tick()
  assert.deepEqual(JSON.parse(JSON.stringify(h.native[2])), { name: 'showShareImageMenu', options: { path: first, needShowEntrance: true, entrancePath: '/pages/login/index' } })
  h.pending().reject({ errMsg: 'share:fail cancel' }); await action
  assert.equal(h.generated.length, 1); assert.equal(h.page.data.imageError, ''); assert.equal(h.page.data.shareFallback, false)
  assert.equal(h.notices.length, 1); assert.equal(h.notices[0].title, '已保存到相册')
})
test('unsupported or failed share offers a second native card tap and keeps its cover on return', async () => {
  const h = runtime(); await h.page.load(); h.wx.canIUse = () => false
  await h.page.shareImage(); assert.equal(h.page.data.shareFallback, true)
  const card = h.page.onShareAppMessage({from:'button'}); assert.equal(card.path, '/pages/login/index'); assert.equal(card.imageUrl, h.page.data.coverPath)
  h.page.onHide(); h.page.onShow(); assert.equal(h.requests.length, 1); assert.ok(h.page.data.coverPath)
  h.wx.canIUse = () => true
  const action = h.page.shareImage(); await tick(); h.pending().reject({ errMsg: 'share:fail unsupported' }); await action
  assert.equal(h.page.data.shareFallback, true); assert.equal(h.notices.length, 0)
})
test('native opening acknowledgement before onHide still preserves preview cache', async () => {
  const h = runtime(); await h.page.load()
  const action = h.page.preview(); await tick(); const path = h.page.data.imagePath
  h.pending().resolve(); await action
  h.page.onHide(); h.page.onShow()
  assert.equal(h.page.data.imagePath, path); assert.equal(h.requests.length, 1)
})
test('account change before lifecycle notification cannot export the previous account report', async () => {
  const h = runtime(); await h.page.load()
  h.app.globalData.token = 'B'
  await h.page.shareImage()
  assert.equal(h.generated.length, 0); assert.equal(h.native.length, 0); assert.equal(h.page.data.report, null)
})
test('month refresh, logout and changed account invalidate paths and reject late callbacks', async () => {
  const h = runtime(); await h.page.load()
  let action = h.page.preview(); await tick(); const old = h.page.data.imagePath
  h.app.globalData.token = 'B'; h.page.onHide(); h.pending().resolve(); await action
  assert.equal(h.page.data.report, null); assert.equal(h.page.data.imagePath, ''); assert.ok(h.removed.includes(old))
  assert.equal(h.page.onShareAppMessage({from:'button'}).imageUrl, '/assets/white-doodle/share-fallback.png')
  h.page._visible = true; await h.page.load(); h.wx.canIUse = () => false; await h.page.shareImage()
  const cover = h.page.data.coverPath; await h.page.changeMonth({ detail: { value: '2026-09' } })
  assert.equal(h.page.data.coverPath, ''); assert.ok(h.removed.includes(cover))
  h.app.globalData.token = ''; h.page.onShow(); assert.equal(h.page.data.report, null)
})

test('rereading corrections, voids and deletion/restoration replaces summary and cached images', async () => {
  let report=fixture()
  const h=runtime(()=>structuredClone(report));h.wx.canIUse=()=>false
  for(const [net,active,label] of [['-500.00',true,'本月净回收'],['100.00',true,'本月净支出'],['0.00',true,'本月收支持平'],['0.00',false,'本月暂无收支'],['-500.00',true,'本月净回收']]){
    const old=[h.page.data.imagePath,h.page.data.coverPath].filter(Boolean)
    report={...report,has_activity:active,totals:{...report.totals,cashflow_net:net}}
    await h.page.load()
    assert.equal(h.page.data.edition.balance.label,label)
    assert.equal(h.page.data.imagePath,'');assert.equal(h.page.data.coverPath,'')
    assert.ok(old.every(p=>h.removed.includes(p)))
    await h.page.shareImage()
    assert.ok(h.page.data.coverPath)
  }
})
test('export rows clear glyph bounds; counts share the heading, cashflow is bold and card is 5:4', () => {
  const context = { font: '', measureText(value) { const size = Number(this.font.match(/(\d+)px/)[1]); return { width: value.length * size * .7, actualBoundingBoxAscent: size * 1.1, actualBoundingBoxDescent: size * .3 } } }
  const report = fixture(), layout = planReport(context, report)
  const heading = layout.commands.find(c => c.lines && c.lines[0] === '本月账目'), count = layout.commands.find(c => c.lines && c.lines[0] === '购入 0 件')
  assert.ok(Math.abs(heading.y - count.y) < 10)
  const texts = layout.commands.filter(c => c.kind === 'text')
  for (const rule of layout.commands.filter(c => c.kind === 'line')) {
    assert.equal(rule.x, 52); assert.equal(rule.width, 616)
    for (const c of texts) assert.ok(rule.y <= c.y || rule.y > c.y + c.height, 'rule overlaps ' + c.lines.join(''))
  }
  assert.equal(texts.find(c => c.lines[0] === '¥500.00' && c.weight === '600').weight, '600')
  const cover = planShareCover(context, report); assert.equal(cover.width / cover.height, 5 / 4)
  assert.ok(cover.commands.every(c => !c.lines || c.y + c.height < cover.height - 24))
})
