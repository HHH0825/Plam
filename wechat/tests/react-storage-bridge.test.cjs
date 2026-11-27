const test = require('node:test')
const assert = require('node:assert/strict')
const { initialModel, parseModel } = require('../react-pilot/dist/contracts/storage-locations')
const output = '../../test-results/local-builds/local-react-pilot/pages/storage-locations/'
const { dispatchIntent } = require(output + 'dispatch-intent.js')
const { projectModel } = require(output + 'project-view-model.js')

const item = {
  id: 9, name: '合成物品', category: '日用品', status: 'active', statusText: '使用中',
  storage_location_name: null, checked: true, alreadyHere: false, art: '/art.png', revision: 7,
}
function pageWith(patch = {}) {
  const base = initialModel(3)
  const locations = [{ id: 2, name: '书架', count: 1, revision: 7 }]
  const data = { ...base, loading: false, ready: true, locations, shownLocations: locations,
    shownItems: [item], photoPaths: { 9: '/thumb.png' }, photoErrors: {},
    ...patch }
  const calls = []
  const page = {
    _viewEpoch: 3, active: () => true, current: () => true, data,
  }
  for (const method of [
    'load', 'review', 'search', 'searchItems', 'targetSearch', 'enter', 'groups', 'newLocation',
    'rename', 'remove', 'nameInput', 'saveName', 'cancelName', 'beginAdd', 'beginSelect',
    'cancelSelect', 'tapItem', 'chooseTarget', 'closeTarget', 'targetTap', 'addSelected',
    'clearSelected', 'photoFailed',
  ]) page[method] = (...args) => calls.push([method, ...args])
  return { page, calls }
}
const event = (type, fields = {}) => ({ version: 1, viewEpoch: 3, type, ...fields })
const row = id => ({ currentTarget: { dataset: { id } } })
const value = value => ({ detail: { value } })

test('bridge maps each of the 23 operations to a fixed controller method and payload', async () => {
  const detail = { mode: 'items', locationId: 2 }
  const selected = { ...detail, selecting: true, chosenCount: 1 }
  const targets = { ...selected, targetOpen: true, targets: [{ id: null, name: '未设置位置' }] }
  const cases = [
    ['retry', { ready: false, error: '读取失败' }, ['load', { retry: true }]],
    ['review-conflict', { conflict: true }, ['review']],
    ['search-locations', {}, ['search', value('书')], { value: '书' }],
    ['search-items', detail, ['searchItems', value('灯')], { value: '灯' }],
    ['search-targets', targets, ['targetSearch', value('')], { value: '' }],
    ['open-location', {}, ['enter', row(0)], { id: null }],
    ['back-to-locations', detail, ['groups']],
    ['start-create', {}, ['newLocation']],
    ['start-rename', detail, ['rename']],
    ['delete-location', detail, ['remove']],
    ['edit-name', { naming: true }, ['nameInput', value('书架')], { value: '书架' }],
    ['save-name', { naming: true }, ['saveName']],
    ['cancel-name', { naming: true }, ['cancelName']],
    ['start-add', detail, ['beginAdd']],
    ['start-selection', detail, ['beginSelect']],
    ['cancel-selection', selected, ['cancelSelect']],
    ['tap-item', selected, ['tapItem', row(9)], { id: 9 }],
    ['choose-target', selected, ['chooseTarget']],
    ['close-target', targets, ['closeTarget']],
    ['select-target', targets, ['targetTap', row(0)], { id: null }],
    ['add-selected', { ...selected, picking: true }, ['addSelected']],
    ['clear-selected', selected, ['clearSelected']],
    ['photo-failed', detail, ['photoFailed', row(9)], { id: 9, src: '/thumb.png' }],
  ]
  assert.equal(cases.length, 23)
  for (const [type, patch, expected, fields] of cases) {
    const { page, calls } = pageWith(patch)
    assert.equal(await dispatchIntent(page, event(type, fields)), true, type)
    assert.deepEqual(calls, [expected], type)
  }
})

test('hidden and expired views, bad IDs, busy writes and stale photos cannot dispatch', async () => {
  const detail = { mode: 'items', locationId: 2 }
  const { page, calls } = pageWith(detail)
  for (const intent of [
    event('delete-location', { viewEpoch: 2 }), event('tap-item', { id: 99 }),
    event('photo-failed', { id: 9, src: '/older.png' }), event('save-name'),
  ]) assert.equal(await dispatchIntent(page, intent), false)
  page.current = () => false
  assert.equal(await dispatchIntent(page, event('delete-location')), false)
  page.current = () => true
  page._write = {}
  assert.equal(await dispatchIntent(page, event('delete-location')), false)
  page._write = null
  page.active = () => false
  assert.equal(await dispatchIntent(page, event('delete-location')), false)
  assert.equal(calls.length, 0)
})

test('projection removes raw fields and uses the current thumbnail and category art', () => {
  const { page } = pageWith()
  const model = projectModel(page.data, 3)
  assert.ok(parseModel(model))
  assert.equal(model.shownItems[0].imageSrc, '/thumb.png')
  assert.equal('revision' in model.shownItems[0], false)
  assert.equal('revision' in model.shownLocations[0], false)
  page.data.photoErrors[9] = true
  assert.equal(projectModel(page.data, 3).shownItems[0].imageSrc, '/art.png')
})
