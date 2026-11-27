const { createStorageLocationsPage } = require('./controller')
const { wrap } = require('../../utils/member')

Page(wrap(createStorageLocationsPage()))
