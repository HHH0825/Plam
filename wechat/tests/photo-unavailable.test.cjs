const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs')
const {createRequire}=require('node:module')
function page(name) {
  let definition, enabled = false, reads = 0
  const cache = { load: async () => { reads++; throw new Error('offline') }, peek: async () => null, release() {}, invalidate() {}, sync() {} }
  const api = { photosAvailable: () => enabled, photoCache: () => cache }
  function load(file){const native=createRequire(file),module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{
    require: key => /(^|\/)api$/.test(key) ? api : key.endsWith('/item-list-page') || key.endsWith('/startup-entry') ? load(native.resolve(key)) : native(key),
    module,exports:module.exports,Page:value=>definition=value,wx:{},getApp:()=>({globalData:{token:'A'},hasSession:()=>true,requireSession:()=>true})
  });return module.exports}
  load(require.resolve('../miniprogram/pages/' + name + '/index'))
  const p = { ...definition, data: structuredClone(definition.data), setData(patch) {
    for (const [key, value] of Object.entries(patch)) { const keys = key.split('.'); let target = this.data; while (keys.length > 1) target = target[keys.shift()]; target[keys[0]] = value }
  } }
  p.onLoad({ id: 4 }); p._visible = true
  const item = { id: 4, photo_url: '/items/4/photo', photo_version: 'v1' }
  if (name === 'item') p.data.item = item; else p.data.shown = [item]
  return { p, enable: () => { enabled = true }, reads: () => reads }
}
test('disabled list/wall and detail keep fallback, refuse retry and do not download', async () => {
  const list = page('items'); list.p.readPhoto(4); list.p.retryPhoto({ currentTarget: { dataset: { id: 4 } } })
  assert.equal(list.p.data.photoStates[4], 'unavailable'); assert.equal(list.reads(), 0)
  const detail = page('item'); await detail.p.readPhoto(); await detail.p.retryPhoto()
  assert.equal(detail.p.data.photoUnavailable, true); assert.equal(detail.p.data.photoError, false); assert.equal(detail.reads(), 0)
})
test('enabled environment distinguishes a transient read failure and permits retry', async () => {
  const detail = page('item'); detail.enable(); await detail.p.readPhoto()
  assert.equal(detail.p.data.photoUnavailable, false); assert.equal(detail.p.data.photoError, true)
  await detail.p.retryPhoto(); assert.equal(detail.reads(), 2)
  const wxml = fs.readFileSync(require.resolve('../miniprogram/templates/item-list.wxml'), 'utf8')
  assert.match(wxml, /catchtap="retryPhoto"/)
  const css = fs.readFileSync(require.resolve('../miniprogram/pages/items/collection.wxss'), 'utf8')
  const retry = css.match(/\.photo-retry\s*\{([^}]+)\}/)[1]
  assert.ok(!retry.includes('position:absolute'))
})
