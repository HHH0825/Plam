// Work only on temporary files. Selection and editing never upload a photo.
const PHOTO_MAX_BYTES = 200 * 1024
const PHOTO_MAX_SIDE = 1280
function fileSize(src) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().stat({ path: src, success: result => {
      const size = Number(result.stats && result.stats.size)
      if (Number.isFinite(size) && size > 0) resolve(size)
      else reject(new Error('照片文件无法读取'))
    }, fail: reject })
  })
}
function removeTemporary(src) {
  return new Promise(resolve => {
    try { wx.getFileSystemManager().unlink({ filePath: src, complete: resolve }) } catch (_) { resolve() }
  })
}
function releasePage(page) {
  const files = page._photoFiles
  page._preparedPhoto = null; page._photoFiles = null
  if (files) for (const src of files) removeTemporary(src)
}
function nativeCall(name, options, context) {
  return new Promise((resolve, reject) => {
    try { wx[name]({ ...options, success: resolve, fail: reject }, context) }
    catch (error) { reject(error) }
  })
}

function cancelled(error) { return /cancel/i.test(error && error.errMsg || '') }

function photoError(error) {
  const message = String(error && (error.errMsg || error.message) || '')
  if (/auth|permission|deny|denied|privacy/i.test(message)) return '无法使用相机或相册，请检查微信及手机的权限设置。也可以稍后再添加照片。'
  if (/camera|相机/i.test(message)) return '相机暂时不可用，请重试或从相册选择照片。'
  return message.includes('当前微信版本') ? message : '照片读取或处理失败，请重试或换一张照片。'
}

function cropPhoto(src) {
  if (typeof wx.cropImage !== 'function' || (wx.canIUse && !wx.canIUse('cropImage'))) {
    return Promise.reject(new Error('当前微信版本不支持裁剪，请更新微信'))
  }
  return nativeCall('cropImage', { src, cropScale: '1:1' }).then(result => {
    if (!result.tempFilePath) throw new Error('没有生成裁剪照片')
    return result.tempFilePath
  })
}

function rotationSize(width, height, orientation = 'up') {
  if (!(width > 0 && height > 0)) throw new Error('照片尺寸无效')
  const sideways = /^(left|right)/.test(orientation)
  const orientedWidth = sideways ? height : width, orientedHeight = sideways ? width : height
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(width, height))
  return { width: Math.max(1, Math.round(orientedHeight * scale)),
    height: Math.max(1, Math.round(orientedWidth * scale)), scale, orientedHeight }
}

// Normalize camera EXIF orientation before applying the requested clockwise turn.
function orientationMatrix(width, height, orientation) {
  return ({
    'up': [1, 0, 0, 1, 0, 0], 'up-mirrored': [-1, 0, 0, 1, width, 0],
    'down': [-1, 0, 0, -1, width, height], 'down-mirrored': [1, 0, 0, -1, 0, height],
    'left-mirrored': [0, 1, 1, 0, 0, 0], 'right': [0, 1, -1, 0, height, 0],
    'right-mirrored': [0, -1, -1, 0, height, width], 'left': [0, -1, 1, 0, 0, width]
  })[orientation] || [1, 0, 0, 1, 0, 0]
}

async function renderPhoto(page, src, rotate, isCurrent = () => true) {
  const check = () => { if (!isCurrent()) throw new Error('照片编辑已取消') }
  let info = await nativeCall('getImageInfo', { src })
  check()
  const temporary = new Set()
  let canvas, image, accepted = ''
  try {
  // Native resizing happens before Canvas creates a decoded bitmap.
  if (Math.max(info.width, info.height) > PHOTO_MAX_SIDE) {
    if (typeof wx.compressImage !== 'function' || (wx.canIUse && !wx.canIUse('compressImage.object.compressedWidth'))) {
      throw new Error('当前微信版本不支持照片尺寸压缩，请更新微信')
    }
    const scale = PHOTO_MAX_SIDE / Math.max(info.width, info.height)
    const resized = await nativeCall('compressImage', { src, quality: 82,
      compressedWidth: Math.max(1, Math.round(info.width * scale)), compressedHeight: Math.max(1, Math.round(info.height * scale)) })
    if (!resized.tempFilePath) throw new Error('没有生成压缩照片')
    if (resized.tempFilePath !== src) temporary.add(resized.tempFilePath)
    check()
    info = await nativeCall('getImageInfo', { src: resized.tempFilePath })
    check()
    if (Math.max(info.width, info.height) > PHOTO_MAX_SIDE) throw new Error('照片尺寸压缩失败')
  }
  const size = rotationSize(info.width, info.height, info.orientation)
  if (!rotate) [size.width, size.height] = [size.height, size.width]
  canvas = await new Promise((resolve, reject) => {
    wx.createSelectorQuery().in(page).select('#photo-edit-canvas').fields({ node: true, size: true }, rows => {
      if (rows && rows.node) resolve(rows.node)
      else reject(new Error('照片编辑画布不可用'))
    }).exec()
  })
  check()
  canvas.width = size.width; canvas.height = size.height
  const context = canvas.getContext('2d')
  image = canvas.createImage()
  await new Promise((resolve, reject) => {
    image.onload = resolve; image.onerror = reject; image.src = info.path || src
  })
  check()
  context.fillStyle = '#FFFCF7'
  context.fillRect(0, 0, size.width, size.height)
  context.scale(size.scale, size.scale)
  if (rotate) {
    context.translate(size.orientedHeight, 0)
    context.rotate(Math.PI / 2)
  }
  context.transform(...orientationMatrix(info.width, info.height, info.orientation))
  context.drawImage(image, 0, 0, info.width, info.height)
  let width = size.width, height = size.height
  while (!accepted) {
    for (const quality of [0.82, 0.75, 0.68]) {
      check()
      const result = await nativeCall('canvasToTempFilePath', { canvas, width: size.width, height: size.height,
        destWidth: width, destHeight: height, fileType: 'jpg', quality }, page)
      if (!result.tempFilePath || result.tempFilePath === src) throw new Error('没有生成处理后的照片')
      temporary.add(result.tempFilePath)
      check()
      const bytes = await fileSize(result.tempFilePath)
      check()
      const output = await nativeCall('getImageInfo', { src: result.tempFilePath })
      check()
      if (output.type !== 'jpeg' && output.type !== 'jpg') throw new Error('照片处理结果格式无效')
      if (Math.max(output.width, output.height) > PHOTO_MAX_SIDE) throw new Error('照片处理结果尺寸无效')
      if (bytes <= PHOTO_MAX_BYTES) { accepted = result.tempFilePath; break }
      await removeTemporary(result.tempFilePath); temporary.delete(result.tempFilePath)
    }
    if (!accepted) {
      if (Math.max(width, height) <= 1) throw new Error('照片无法压缩，请换一张照片')
      width = Math.max(1, Math.floor(width * 0.8)); height = Math.max(1, Math.floor(height * 0.8))
    }
  }
  check()
  if (!page._photoFiles) page._photoFiles = new Set()
  page._photoFiles.add(accepted); temporary.delete(accepted)
  return accepted
  } finally {
    if (image) { image.onload = null; image.onerror = null; try { image.src = '' } catch (_) {} }
    if (canvas) { canvas.width = 1; canvas.height = 1 }
    for (const path of temporary) await removeTemporary(path)
  }
}

function rotatePhoto(page, src, isCurrent) { return renderPhoto(page, src, true, isCurrent) }
async function preparePhoto(page, src, isCurrent = () => true) {
  if (page._preparedPhoto && [page._preparedPhoto.src, page._preparedPhoto.path].includes(src) && isCurrent()) {
    try { if (await fileSize(page._preparedPhoto.path) <= PHOTO_MAX_BYTES && isCurrent()) return page._preparedPhoto.path } catch (_) {}
  }
  const path = await renderPhoto(page, src, false, isCurrent)
  page._preparedPhoto = { src, path }
  return path
}

module.exports = { nativeCall, cancelled, photoError, cropPhoto, rotatePhoto, preparePhoto, rotationSize, orientationMatrix, releasePage, PHOTO_MAX_BYTES, PHOTO_MAX_SIDE }
