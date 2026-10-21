const { createItemListPage } = require('../../utils/item-list-page')
Page(require('../../utils/startup-entry').wrap(require('../../utils/member').wrap(require('../../utils/release-notice').wrap(createItemListPage('held')))))
