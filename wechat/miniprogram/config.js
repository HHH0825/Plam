// 正式云端环境：直接调用 Python HTTP 云函数，使用真实微信登录。
// 本地调试可改回 local_http、http://127.0.0.1:5001 和 DEV_LOGIN=true。
module.exports = {
  API_TRANSPORT: 'cloud_http_function',
  CLOUDBASE_ENV_ID: 'cloud1-example',
  CLOUD_FUNCTION: 'palm-api-bridge',
  CLOUD_PHOTOS_ENABLED: true,
  API_BASE: '',
  DEV_LOGIN: false,
  DEV_ACCOUNT: 'student'
}
