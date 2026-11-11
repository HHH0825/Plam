const runtime=require('../local-core/runtime')
const {createPhotoCache}=require('./photo-cache')
let photos
function photoCache(){if(!photos)photos=createPhotoCache({download:spec=>runtime.photoDownload(spec),stat:path=>new Promise((resolve,reject)=>wx.getFileSystemManager().stat({path,success:r=>resolve(r.stats),fail:reject})),remove:path=>new Promise(resolve=>wx.getFileSystemManager().unlink({filePath:path,complete:resolve})),getScope:()=>getApp().globalData.token?'local-device-v1|'+runtime.scope()+'|'+getApp().globalData.user?.id:''});return photos}
function clearPhotos(){photos?.reset();require('./display-cache').clear()}
function uploadPhoto(id,path,options={}){return runtime.uploadPhoto(id,path,options).then(r=>{photos?.invalidate(id);return r})}
function downloadPhoto(id,options={}){return photoCache().load({id,photo_version:options.version},options.owner||'legacy-reader',options.size||'full',options.priority||0)}
module.exports={request:(path,options={})=>runtime.request(path,options),photoCache,clearPhotos,uploadPhoto,downloadPhoto,photosAvailable:()=>true}
