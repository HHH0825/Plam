const config = require('../config')
const { API_BASE } = config
const cloud = ['cloud_function', 'cloud_http_function'].includes(config.API_TRANSPORT)
const transport = require('./cloud-transport')
const { createPhotoCache } = require('./photo-cache')
let photos
const photoUploads = new Set()
let localRequestCounter = 0
function workflowHeaders(path, options) {
  const header = {}
  if (!(/^\/(local-migration|rewards|member|ledger|maintenance|disposal|wishlist|fixed-expenses|storage-locations)(\/|$)/.test(path) || /^\/items(?:\/\d+)?$/.test(path) && options.data && ['payment_info','cover_mode','cover_icon_key'].some(k=>k in options.data) || /^\/items\/\d+\/(maintenance|disposal)$/.test(path)) || !options.method || options.method === 'GET') return header
  const user = getApp().globalData.user
  const key = `palmLocalRequests:${transport.serviceScope()}:${user?.id}`
  const fingerprint = JSON.stringify([options.method, path, options.data, options.revision])
  const journal = wx.getStorageSync(key) || {}
  if (!journal[fingerprint] && Object.keys(journal).length >= 100) throw new Error('未确认提交过多，请先核对现有操作')
  if(options.requestId&&!/^[A-Za-z0-9_-]{16,100}$/.test(options.requestId))throw new Error('提交标识无效')
  if (!journal[fingerprint]) journal[fingerprint] = options.requestId || `local-${Date.now().toString(36)}-${++localRequestCounter}-${Math.random().toString(36).slice(2)}`
  wx.setStorageSync(key, journal)
  header['Idempotency-Key'] = journal[fingerprint]
  if (options.revision !== undefined) header['If-Match'] = `"${options.revision}"`
  return header
}
function acknowledgeWorkflow(path, options) {
  if (!(/^\/(local-migration|rewards|member|ledger|maintenance|disposal|wishlist|fixed-expenses|storage-locations)(\/|$)/.test(path) || /^\/items(?:\/\d+)?$/.test(path) && options.data && ['payment_info','cover_mode','cover_icon_key'].some(k=>k in options.data) || /^\/items\/\d+\/(maintenance|disposal)$/.test(path)) || !options.method || options.method === 'GET') return
  try {
    const key = `palmLocalRequests:${transport.serviceScope()}:${getApp().globalData.user?.id}`
    const rows = wx.getStorageSync(key) || {}
    delete rows[JSON.stringify([options.method, path, options.data, options.revision])]
    wx.setStorageSync(key, rows)
  } catch (_) { /* The server receipt makes a retained ID safe. */ }
}

function photoStat(path) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().stat({ path, success: result => resolve(result.stats), fail: reject })
  })
}
function removeDownload(path) {
  return new Promise(resolve => {
    try { wx.getFileSystemManager().unlink({ filePath: path, complete: resolve }) } catch (_) { resolve() }
  })
}
function photoCache() {
  if (!photos) photos = createPhotoCache({ download: startPhotoDownload, stat: photoStat, remove: removeDownload,
    getScope: () => getApp().globalData.token ? JSON.stringify([transport.serviceScope(), getApp().globalData.token]) : '' })
  return photos
}
function clearPhotos() { for (const cancel of photoUploads) cancel(); if (photos) photos.reset(); transport.clear();require('./display-cache').clear() }

function sessionExpired(token,credential) {
  const app=getApp();if(app.globalData.token!==token)return Promise.reject(Error('账户已切换'))
  if(app.recoverSession)return app.recoverSession(token,credential)
  app.clearSession()
  require('./session-navigation').go(app,'home')
  return Promise.reject(Error('连接已过期，请重新连接'))
}

function errorFrom(body, status) {
  const codes = ['INVALID_REQUEST', 'INVALID_REQUEST_TYPE', 'INVALID_REQUEST_FIELDS', 'INVALID_METHOD', 'INVALID_PATH', 'INVALID_BODY',
    'BODY_TOO_LARGE', 'INVALID_SESSION', 'INVALID_REQUEST_ID', 'INVALID_CONFIG',
    'ITEM_VERSION_CONFLICT', 'CLIENT_UPDATE_REQUIRED', 'INVALID_ITEM_VERSION', 'LOCATION_NAME_EXISTS', 'ITEM_CAPACITY_REACHED']
  const code = body && codes.includes(body.code) ? body.code : ''
  const versionCode = ['ITEM_VERSION_CONFLICT', 'CLIENT_UPDATE_REQUIRED', 'INVALID_ITEM_VERSION', 'LOCATION_NAME_EXISTS', 'ITEM_CAPACITY_REACHED'].includes(code)
  const error = new Error(((body && body.error) || `请求失败（${status}）`) + (code && !versionCode ? `（${code}）` : ''))
  error.capacity = body && body.capacity
  error.status = status
  error.code = code
  error.retrySameRequest = body && body.retry_same_request
  return error
}

function request(path, options = {}, attempt = 0) {
  if(getApp().globalData.localMode||config.LOCAL_BUILD==='local')return require('../local-core/runtime').request(path,options)
  const app=getApp()
  if(!options.anonymous&&path!=='/auth/logout'&&app._sessionPhase==='error')return Promise.reject(Object.assign(Error(app._sessionError||'连接失败，请重新连接'),{notSubmitted:true}))
  if(!options.anonymous&&path!=='/auth/logout'&&app._sessionPhase==='connecting'){
    if((options.method||'GET')!=='GET')return Promise.reject(Object.assign(Error('正在恢复连接，填写已保留，请稍后再提交'),{notSubmitted:true}))
    const queuedOwner=app.globalData.token;let stopped=false,child;const deferred=app.ensureSession().then(()=>{if(queuedOwner&&queuedOwner!==app.globalData.token)throw Error('账户已切换');if(stopped)throw Error('读取已取消');child=request(path,options,attempt);return child});deferred.cancel=()=>{stopped=true;child?.cancel?.()};return deferred
  }
  const token = getApp().globalData.token
  const credential=app.globalData.accessToken||token
  const stopActivity=require('./loading-activity').begin(path,options.method||'GET',token)
  let pending,cancelled=false
  const promise = new Promise((resolve, reject) => {
    const spec = {
      url: `${API_BASE}/api/mp${path}`,
      method: options.method || 'GET',
      data: options.data,
      header: { 'Content-Type': 'application/json', ...(options.anonymous ? {} : { Authorization: `Bearer ${credential}` }), ...(options.revision !== undefined ? {'If-Match':`"${options.revision}"`} : {}) },
      success(response) {
        if (!options.anonymous && getApp().globalData.token !== token) { reject(new Error('登录账户已切换')); return }
        if(cancelled){reject(Error('读取已取消'));return}
        if (!cloud && response.statusCode < 500 && response.statusCode!==401 && (response.statusCode !== 409 || response.data?.code === 'ITEM_CAPACITY_REACHED')) acknowledgeWorkflow(path, options)
        if(response.statusCode===401&&!options.anonymous&&path!=='/auth/logout'){
          const error=Object.assign(Error('连接已过期，填写已保留，请重试'),{status:401,notSubmitted:true})
          if(attempt){app.failSession?.(error);reject(error);return}
          sessionExpired(token,credential).then(()=>{
            if(cancelled||getApp().globalData.token!==token){reject(Error('读取已取消或账户已切换'));return}
            if((options.method||'GET')==='GET'){pending=request(path,options,1);pending.then(resolve,reject)}
            else reject(Object.assign(error,{message:'连接已恢复，填写已保留，请核对后再次提交',sessionRecovered:true}))
          },e=>reject(Object.assign(error,{message:e.message||error.message})));return
        }
        if (response.statusCode >= 200 && response.statusCode < 300) {
          if(!/^\/auth\/(login|logout)$/.test(path))require('./display-cache').invalidate(path,options.method||'GET')
          const removed = (options.method === 'DELETE') && path.match(/^\/items\/(\d+)(?:\/photo)?$/)
          if (removed && photos) photos.invalidate(Number(removed[1]))
          resolve(response.data)
        }
        else { const error=errorFrom(response.data,response.statusCode);if(error.code==='ITEM_CAPACITY_REACHED')require('./rewards').capacityReached(error.capacity);reject(error) }
      },
      fail() { reject(new Error('连接失败，请检查网络和后端地址')) }
    }
    if (!cloud) { try { Object.assign(spec.header, workflowHeaders(path, options)) } catch(error) { error.notSubmitted=true; reject(error); return } }
    if (cloud) {
      pending = transport.send(path, options, credential)
      pending.then(spec.success, error => reject(error))
    } else pending = wx.request(spec)
  })
  promise.finally(stopActivity).catch(()=>{})
  promise.cancel = () => {
    cancelled=true
    if (pending && pending.cancel) pending.cancel()
    else if (pending && pending.abort) pending.abort()
  }
  return promise
}

function uploadCloudPhoto(itemId, filePath, options = {}) {
  const token = getApp().globalData.token
  let cancelled = false, pending, commitTicket = options.resumeTicket || ''
  const commit = async () => {
    current()
    if (!/^[a-f0-9]{48}$/.test(commitTicket)) throw new Error('照片提交凭证无效')
    pending = request(`/items/${itemId}/photo/uploads/${commitTicket}/commit`, { method: 'POST', data: {}, revision: options.revision })
    try {
      const item = await pending
      current()
      if (photos) photos.invalidate(itemId)
      return item
    } catch (error) {
      if (error.status && error.status < 500 && (error.status !== 409 || error.code === 'ITEM_VERSION_CONFLICT')) commitTicket = ''
      throw error
    }
  }
  const cancel = () => { cancelled = true; if (pending?.cancel) pending.cancel(); else if (pending?.abort) pending.abort() }
  const current = () => { if (cancelled || getApp().globalData.token !== token) throw new Error('照片上传已取消或登录账户已切换') }
  const promise = (async () => {
    if (config.CLOUD_PHOTOS_ENABLED !== true || config.API_TRANSPORT !== 'cloud_http_function') throw new Error('云端照片暂不可用，物品资料仍可正常保存')
    if (commitTicket) return commit()
    const stats = await photoStat(filePath)
    if (!Number.isInteger(stats.size) || stats.size <= 0 || stats.size > 5 * 1024 * 1024) throw new Error('照片不能为空或超过 5 MB')
    const info = await new Promise((resolve, reject) => wx.getImageInfo({src: filePath, success: resolve, fail: () => reject(new Error('照片格式无法识别'))}))
    const contentType = { jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[String(info.type).toLowerCase()]
    if (!contentType) throw new Error('照片只支持 JPEG、PNG 或 WebP')
    current()
    pending = request(`/items/${itemId}/photo/uploads`, { method: 'POST', data: {size_bytes: stats.size, content_type: contentType}, revision: options.revision })
    const ticket = await pending
    current()
    await new Promise((resolve, reject) => {
      pending = wx.uploadFile({ url: ticket.upload_url, filePath, name: 'file', formData: ticket.form, timeout: 30000,
        success(response) { if (response.statusCode === 204) resolve(); else reject(new Error('照片上传失败或凭证已过期，请重试')) },
        fail() { reject(new Error('照片上传失败，请检查网络或重新上传')) }
      })
      if (typeof options.onProgress === 'function' && pending?.onProgressUpdate) pending.onProgressUpdate(event => {
        if (!cancelled && getApp().globalData.token === token) options.onProgress(Math.max(0, Math.min(100, event.progress)))
      })
    })
    current()
    commitTicket = ticket.ticket
    return commit()
  })()
  photoUploads.add(cancel)
  promise.finally(() => photoUploads.delete(cancel)).catch(() => {})
  promise.cancel = cancel
  // Retry an uncertain commit against the SAME ticket/path and persisted request ID.
  // Only metadata is retained in memory; no signatures enter the retry journal.
  promise.retry = () => {
    if (getApp().globalData.token !== token) return Promise.reject(new Error('登录账户已切换'))
    return uploadCloudPhoto(itemId, filePath, {...options, resumeTicket: commitTicket})
  }
  return promise
}

function uploadPhoto(itemId, filePath, options={}) {
  if(getApp().globalData.localMode||config.LOCAL_BUILD==='local')return require('../local-core/runtime').uploadPhoto(itemId,filePath,options).then(item=>{photos?.invalidate(itemId);return item})
  if (cloud) return uploadCloudPhoto(itemId, filePath, options)
  const token = getApp().globalData.token,credential=getApp().globalData.accessToken||token
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${API_BASE}/api/mp/items/${itemId}/photo`, filePath, name: 'photo',
      header: { Authorization: `Bearer ${credential}`, ...(options.revision !== undefined ? {'If-Match':`"${options.revision}"`} : {}) },
      success(response) {
        if (getApp().globalData.token !== token) { reject(new Error('登录账户已切换')); return }
        if (response.statusCode === 401) sessionExpired(token,credential).catch(()=>{})
        let body = {}
        try { body = JSON.parse(response.data) } catch (_) { /* error handled below */ }
        if (response.statusCode >= 200 && response.statusCode < 300) {
          require('./display-cache').clear()
          if (photos) photos.invalidate(itemId)
          resolve(body)
        }
        else reject(errorFrom(body, response.statusCode))
      },
      fail() { reject(new Error('照片上传失败，请检查网络')) }
    })
  })
}

function startCloudPhotoDownload(spec) {
  if (config.CLOUD_PHOTOS_ENABLED !== true) return { promise: Promise.reject(new Error('云端照片暂不可用')), abort() {} }
  const token = getApp().globalData.token
  let stopped = false, task
  const promise = request(`/items/${spec.id}/photo/download?size=${spec.size}&v=${encodeURIComponent(spec.version)}`).then(ticket => {
    if (stopped || getApp().globalData.token !== token) throw new Error('照片读取已取消')
    return new Promise((resolve, reject) => {
      task = wx.downloadFile({ url: ticket.url, timeout: 15000,
        success(response) {
          if (stopped || getApp().globalData.token !== token || response.statusCode !== 200) {
            if (response.tempFilePath) removeDownload(response.tempFilePath)
            reject(new Error('照片读取已取消或失败')); return
          }
          resolve(response.tempFilePath)
        }, fail() { reject(new Error('照片读取失败')) }
      })
    })
  })
  return { promise, abort() { stopped = true; if (task && task.abort) task.abort() } }
}

function startPhotoDownload(spec) {
  if(getApp().globalData.localMode||config.LOCAL_BUILD==='local')return require('../local-core/runtime').photoDownload(spec)
  if (cloud) return startCloudPhotoDownload(spec)
  const token = getApp().globalData.token,credential=getApp().globalData.accessToken||token
  let task
  const promise = new Promise((resolve, reject) => {
    task = wx.downloadFile({
      url: `${API_BASE}/api/mp/items/${spec.id}/photo?size=${spec.size}&v=${encodeURIComponent(spec.version)}`,
      timeout: 15000,
      header: { Authorization: `Bearer ${credential}` },
      success(response) {
        if (getApp().globalData.token !== token) {
          if (response.tempFilePath) removeDownload(response.tempFilePath)
          reject(new Error('登录账户已切换')); return
        }
        if (response.statusCode === 401) sessionExpired(token,credential).catch(()=>{})
        if (response.statusCode === 200) resolve(response.tempFilePath)
        else { if (response.tempFilePath) removeDownload(response.tempFilePath); reject(errorFrom({}, response.statusCode)) }
      }, fail() { reject(new Error('照片读取失败')) }
    })
  })
  return { promise, abort() { if (task && task.abort) task.abort() } }
}

function downloadPhoto(itemId, options = {}) {
  return photoCache().load({ id: itemId, photo_version: options.version }, options.owner || 'legacy-reader', options.size || 'full', options.priority || 0)
}

function photosAvailable() { return getApp().globalData.localMode||config.LOCAL_BUILD==='local'||!cloud || config.CLOUD_PHOTOS_ENABLED === true }

module.exports = { request, uploadPhoto, downloadPhoto, photoCache, clearPhotos, photosAvailable }
