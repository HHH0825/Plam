function() {
  const app = getApp(), api = require('utils/api.js'), owner = {};
  const out = { pending: true, read_only: true, session_available: app.hasSession() };
  globalThis.__palmPhotoRead20261009 = out;
  if (!out.session_available) { out.pending = false; return out; }
  (async () => {
    try {
      const item = await api.request('/items/4');
      out.item_id = item.id; out.photo_attached = !!item.photo_version;
      out.variants = [];
      if (item.photo_version) for (const size of ['full', 'thumb']) {
        const path = await api.downloadPhoto(item.id, {version:item.photo_version, size, owner});
        const info = await new Promise((resolve,reject) => wx.getImageInfo({src:path,success:resolve,fail:reject}));
        const stat = await new Promise((resolve,reject) => wx.getFileSystemManager().stat({path,success:resolve,fail:reject}));
        out.variants.push({size,bytes:stat.stats.size,width:info.width,height:info.height,type:info.type});
      }
      out.ok = true;
    } catch (error) { out.ok = false; out.status = error.status || 0; }
    finally { api.photoCache().release(owner); out.pending = false; }
  })();
  return {started:true};
}
