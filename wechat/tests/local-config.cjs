// These page tests mock wx.request/uploadFile. Keep their transport independent
// of the developer's deployed project config; this modifies only this test process.
const config = require('../miniprogram/config')
Object.assign(config, { LOCAL_BUILD: 'cloud', API_TRANSPORT: 'local_http', API_BASE: 'http://127.0.0.1:5001', DEV_LOGIN: true })
module.exports = config
