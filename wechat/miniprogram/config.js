// 默认使用纯本地业务；云配置仅供历史代码与隔离回归保留，不用于本地发布包。
// 本地调试可改回 local_http、http://127.0.0.1:5001 和 DEV_LOGIN=true。
module.exports = {
  LOCAL_BUILD: 'local',
  API_TRANSPORT: 'cloud_http_function',
  CLOUDBASE_ENV_ID: 'cloud1-example',
  CLOUD_FUNCTION: 'palm-api-bridge',
  CLOUD_PHOTOS_ENABLED: true,
  API_BASE: '',
  DEV_LOGIN: false,
  DEV_ACCOUNT: 'student'
}
