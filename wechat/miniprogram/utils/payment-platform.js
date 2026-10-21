function platform() {
  try {
    if(typeof wx==='undefined')return ''
    const info=typeof wx.getDeviceInfo==='function'?wx.getDeviceInfo():typeof wx.getSystemInfoSync==='function'?wx.getSystemInfoSync():{}
    return ['android','ios'].includes(info.platform)?info.platform:''
  } catch (_) { return '' }
}
module.exports={platform}
