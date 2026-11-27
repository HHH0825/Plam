function imageSource(data, item) {
  return data.photoPaths[item.id] && !data.photoErrors[item.id] ? data.photoPaths[item.id] : (item.art || '')
}

function projectModel(data, viewEpoch) {
  return {
    version: 1, viewEpoch,
    loading: data.loading, ready: data.ready, busy: data.busy, conflict: data.conflict, error: data.error,
    mode: data.mode, locationId: data.locationId, locationName: data.locationName, assignItemId: data.assignItemId,
    query: data.query, itemQuery: data.itemQuery, targetQuery: data.targetQuery,
    locationCount: data.locations.length, unassigned: data.unassigned,
    shownLocations: data.shownLocations.map(({ id, name, count }) => ({ id, name, count })),
    shownItems: data.shownItems.map(item => ({
      id: item.id, name: item.name, category: item.category || '', status: item.status,
      statusText: item.statusText, storageLocationName: item.storage_location_name || '未设置位置',
      checked: item.checked, alreadyHere: item.alreadyHere, imageSrc: imageSource(data, item),
    })),
    naming: data.naming, renameId: data.renameId, nameDraft: data.nameDraft, picking: data.picking,
    selecting: data.selecting, chosenCount: data.chosenCount, targetOpen: data.targetOpen,
    targets: data.targets.map(({ id, name }) => ({ id, name })),
  }
}

module.exports = { projectModel, imageSource }
