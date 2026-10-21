function() {
  const page=getCurrentPages().slice(-1)[0],api=require('utils/api.js'),photo=require('utils/photo-edit.js'),owner={};
  const out={pending:true,cloud_writes:0,client_limit_bytes:photo.PHOTO_MAX_BYTES,client_max_side:photo.PHOTO_MAX_SIDE,
    native_resize_supported:typeof wx.compressImage==='function' && wx.canIUse('compressImage.object.compressedWidth')};
  globalThis.__palmPhotoNative20261009=out;
  (async()=>{
    try {
      const item=await api.request('/items/4');
      const source=await api.downloadPhoto(item.id,{version:item.photo_version,size:'full',owner});
      const started=Date.now();
      const path=await photo.preparePhoto(page,source);
      const info=await new Promise((resolve,reject)=>wx.getImageInfo({src:path,success:resolve,fail:reject}));
      const stat=await new Promise((resolve,reject)=>wx.getFileSystemManager().stat({path,success:resolve,fail:reject}));
      out.prepared={bytes:stat.stats.size,width:info.width,height:info.height,type:info.type,elapsed_ms:Date.now()-started};
      const rotated=await photo.rotatePhoto(page,path);
      const rotatedInfo=await new Promise((resolve,reject)=>wx.getImageInfo({src:rotated,success:resolve,fail:reject}));
      const rotatedStat=await new Promise((resolve,reject)=>wx.getFileSystemManager().stat({path:rotated,success:resolve,fail:reject}));
      out.rotated={bytes:rotatedStat.stats.size,width:rotatedInfo.width,height:rotatedInfo.height,type:rotatedInfo.type};
      out.ok=out.prepared.bytes<=200*1024 && Math.max(info.width,info.height)<=1280;
    } catch(error) {out.ok=false;out.error=String(error.message || error.errMsg || '').replace(/https?:\S+/g,'[url]');}
    finally {photo.releasePage(page);api.photoCache().release(owner);out.pending=false;}
  })();return {started:true};
}
