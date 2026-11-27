const test = require('node:test')
const assert = require('node:assert/strict')
const { initialModel, parseIntent, parseModel } = require('../react-pilot/dist/contracts/storage-locations')

const bare = [
  'retry', 'review-conflict', 'back-to-locations', 'start-create', 'start-rename', 'delete-location',
  'save-name', 'cancel-name', 'start-add', 'start-selection', 'cancel-selection', 'choose-target',
  'close-target', 'add-selected', 'clear-selected',
]
const text = ['search-locations', 'search-items', 'search-targets', 'edit-name']
const envelope = { version: 1, viewEpoch: 2 }

test('all 23 operations accept only their V1 fields', () => {
  const actions = [
    ...bare.map(type => ({ type })),
    ...text.map(type => ({ type, value: '' })),
    { type: 'open-location', id: null },
    { type: 'select-target', id: 20 },
    { type: 'tap-item', id: 10 },
    { type: 'photo-failed', id: 10, src: '/thumb.png' },
  ]
  assert.equal(actions.length, 23)
  for (const action of actions) {
    const intent = { ...envelope, ...action }
    assert.deepEqual(parseIntent(intent), intent)
    assert.equal(parseIntent({ ...intent, revision: 1 }), null)
    assert.equal(parseIntent({ ...intent, version: 2 }), null)
    assert.equal(parseIntent({ ...intent, viewEpoch: 0 }), null)
  }
})

test('intent rejects invalid IDs, empty image paths and incorrect payload types', () => {
  for (const id of [0, -1, 1.5, Infinity, NaN, '1', undefined]) {
    assert.equal(parseIntent({ ...envelope, type: 'open-location', id }), null)
  }
  for (const bad of [
    null, [], { ...envelope, type: 'toString' },
    { ...envelope, type: 'search-items', value: 2 },
    { ...envelope, type: 'tap-item', id: null },
    { ...envelope, type: 'photo-failed', id: 2, src: '' },
  ]) assert.equal(parseIntent(bad), null)
})

test('initial model and all list rows are validated without rewriting the model', () => {
  const model = initialModel(0)
  assert.equal(parseModel(model), model)
  assert.equal(model.loading, true)
  assert.equal(model.ready, false)
  assert.equal(model.locationId, null)
  assert.deepEqual(model.shownItems, [])
  const item = {
    id: 1, name: '示例', category: '日用', status: 'active', statusText: '使用中',
    storageLocationName: '抽屉', checked: false, alreadyHere: false, imageSrc: '/demo.png',
  }
  assert.ok(parseModel({ ...model, shownItems: [item], targets: [{ id: null, name: '未设置位置' }] }))
  assert.equal(parseModel({ ...model, shownItems: [{ ...item, revision: 3 }] }), null)
  assert.equal(parseModel({ ...model, shownItems: [{ ...item, status: 'disposed' }] }), null)
  assert.equal(parseModel({ ...model, targets: [{ id: 0, name: '无效' }] }), null)
  assert.equal(parseModel({ ...model, unassigned: -1 }), null)
  assert.equal(parseModel({ ...model, mode: 'other' }), null)
})
