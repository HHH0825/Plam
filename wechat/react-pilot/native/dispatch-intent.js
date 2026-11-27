const { parseIntent } = require('./react-build/contracts/storage-locations')
const { imageSource } = require('./project-view-model')

const input = value => ({ detail: { value } })
const row = id => ({ currentTarget: { dataset: { id: id ?? 0 } } })
const has = (rows, id) => rows.some(item => item.id === id)

async function dispatchIntent(page, payload) {
  const intent = parseIntent(payload)
  if (!intent || !page.active() || intent.viewEpoch !== page._viewEpoch) return false

  const d = page.data
  if (intent.type === 'photo-failed') {
    if (!page.current() || !d.ready || d.loading || d.mode !== 'items') return false
    const item = d.shownItems.find(row => row.id === intent.id)
    if (!item || imageSource(d, item) !== intent.src) return false
    page.photoFailed(row(intent.id))
    return true
  }
  if (page._confirmation || page._write || d.busy) return false
  if (intent.type === 'retry' && !d.ready && !d.loading && d.error) {
    await page.load({ retry: true })
    return true
  }
  if (!page.current() || !d.ready || d.loading) return false

  const list = d.mode === 'locations'
  const detail = !list && !d.targetOpen
  const canEditLocation = detail && !d.selecting && !d.conflict && d.locationId !== null
  const canMove = d.selecting && d.chosenCount > 0 && !d.conflict

  switch (intent.type) {
    case 'review-conflict':
      if (!d.conflict) return false
      await page.review()
      break
    case 'search-locations':
      if (!list) return false
      page.search(input(intent.value))
      break
    case 'search-items':
      if (!detail) return false
      page.searchItems(input(intent.value))
      break
    case 'search-targets':
      if (!d.targetOpen) return false
      page.targetSearch(input(intent.value))
      break
    case 'open-location':
      if (!list || (intent.id !== null && !has(d.shownLocations, intent.id))) return false
      await page.enter(row(intent.id))
      break
    case 'back-to-locations':
      if (!detail) return false
      page.groups()
      break
    case 'start-create':
      if (!list) return false
      page.newLocation()
      break
    case 'start-rename':
      if (!canEditLocation) return false
      page.rename()
      break
    case 'delete-location':
      if (!canEditLocation) return false
      await page.remove()
      break
    case 'edit-name':
      if (!d.naming) return false
      page.nameInput(input(intent.value))
      break
    case 'save-name':
      if (!d.naming || d.conflict) return false
      await page.saveName()
      break
    case 'cancel-name':
      if (!d.naming) return false
      page.cancelName()
      break
    case 'start-add':
      if (!detail || d.selecting) return false
      page.beginAdd()
      break
    case 'start-selection':
      if (!detail || d.selecting) return false
      page.beginSelect()
      break
    case 'cancel-selection':
      if (!detail || !d.selecting) return false
      page.cancelSelect()
      break
    case 'tap-item':
      if (!detail || !d.shownItems.some(item => item.id === intent.id && !item.alreadyHere)) return false
      page.tapItem(row(intent.id))
      break
    case 'choose-target':
      if (!detail || !canMove || d.picking) return false
      await page.chooseTarget()
      break
    case 'close-target':
      if (!d.targetOpen) return false
      page.closeTarget()
      break
    case 'select-target':
      if (!d.targetOpen || !canMove || !has(d.targets, intent.id)) return false
      await page.targetTap(row(intent.id))
      break
    case 'add-selected':
      if (!detail || !canMove || !d.picking) return false
      await page.addSelected()
      break
    case 'clear-selected':
      if (!detail || !canMove || d.picking) return false
      await page.clearSelected()
      break
    default:
      return false
  }
  return true
}

module.exports = { dispatchIntent }
