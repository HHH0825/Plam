const { createStorageLocationsPage } = require('./controller')
const { wrap } = require('../../utils/member')
const { initialModel } = require('./react-build/contracts/storage-locations')
const { dispatchIntent } = require('./dispatch-intent')
const { projectModel } = require('./project-view-model')
let epoch = 0

function context(page) {
  const d = page.data
  return JSON.stringify([page._scope, d.mode, d.locationId, d.naming, d.renameId, d.picking, d.selecting, d.targetOpen])
}

function publish(page) {
  if (!page._visible) return
  const next = context(page)
  if (next !== page._viewContext) {
    page._viewContext = next
    page._viewEpoch = ++epoch
  }
  if (page._pendingView) return
  const ticket = {}
  page._pendingView = ticket
  Promise.resolve().then(() => {
    if (page._pendingView !== ticket) return
    page._pendingView = null
    if (page._visible) page.setData({ 'storageReactProps.model': projectModel(page.data, page._viewEpoch) })
  })
}

const controller = createStorageLocationsPage({ onStateChange: publish })
Page(wrap({
  ...controller,
  data: {
    ...controller.data,
    storageReactProps: {
      model: initialModel(0),
      onIntent(payload) {
        const page = getCurrentPages().slice(-1)[0]
        if (page?.route === 'pages/storage-locations/index') return dispatchIntent(page, payload)
      },
    },
  },
  onLoad(options) {
    this._viewEpoch = 0
    return controller.onLoad.call(this, options)
  },
  onShow() {
    this._viewContext = null
    this._viewEpoch = ++epoch
    return controller.onShow.call(this)
  },
  onHide() {
    this._viewEpoch = ++epoch
    this._pendingView = null
    return controller.onHide.call(this)
  },
  onUnload() {
    this._viewEpoch = ++epoch
    this._pendingView = null
    return controller.onUnload.call(this)
  },
}))
