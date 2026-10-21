function(fixture) {
  if (globalThis.__palmPhotoLive20261009 && globalThis.__palmPhotoLive20261009.calls>0) return {already_started:true};
  const page=getCurrentPages().slice(-1)[0],app=getApp(),api=require('utils/api.js'),photo=require('utils/photo-edit.js'),owner={};
  const out={pending:true,phase:'prepare',test_name:'照片压缩验收 20261009',user_id:app.globalData.user.id,objects:[],calls:0};
  globalThis.__palmPhotoLive20261009=out;
  const token=app.globalData.token,current=()=>app.globalData.token===token;
  let original='',testId=0;
  const originalUpload=wx.uploadFile;
  (async()=>{
    try {
      if(!fixture || typeof fixture.image!=='string')throw Error('fixture missing');
      original=wx.env.USER_DATA_PATH+'/palm-compression-fixture-20261009.png';
      wx.getFileSystemManager().writeFileSync(original,fixture.image,'base64');
      const path=await photo.preparePhoto(page,original,current);
      const info=await photo.nativeCall('getImageInfo',{src:path});
      const stat=await new Promise((resolve,reject)=>wx.getFileSystemManager().stat({path,success:resolve,fail:reject}));
      out.upload={bytes:stat.stats.size,width:info.width,height:info.height};
      if(out.upload.bytes>200*1024||Math.max(info.width,info.height)>1280)throw Error('upload bound failed');
      out.phase='upload';out.calls++;
      const item=await api.request('/items',{method:'POST',data:{name:out.test_name,category:'验收测试',icon_type:'other',purchase_date:'2026-10-09',purchase_price:'0.00',status:'active',notes:'代理创建，验收后定向清理'}});
      testId=item.id;out.test_item_id=testId;
      wx.uploadFile=function(spec){if(spec.formData&&/^palm\/staging\//.test(spec.formData.key||''))out.objects.push(spec.formData.key);return originalUpload.call(wx,spec);};
      const started=Date.now();const uploaded=await api.uploadPhoto(testId,path,{revision:item.revision});out.calls+=2;out.commit_elapsed_ms=Date.now()-started;
      wx.uploadFile=originalUpload;
      out.variants=[];
      for(const size of ['full','thumb']){
        out.calls++;const ticket=await api.request('/items/'+testId+'/photo/download?size='+size);
        const match=ticket.url.match(/^https:\/\/[^/]+\/(palm\/photos\/[^?]+)\?/);if(match)out.objects.push(match[1]);
        const downloaded=await api.downloadPhoto(testId,{version:uploaded.photo_version,size,owner});out.calls++;
        const decoded=await photo.nativeCall('getImageInfo',{src:downloaded});
        const ds=await new Promise((resolve,reject)=>wx.getFileSystemManager().stat({path:downloaded,success:resolve,fail:reject}));
        out.variants.push({size,bytes:ds.stats.size,width:decoded.width,height:decoded.height});
      }
      out.ok=out.variants.every(r=>r.bytes<=(r.size==='full'?200:30)*1024&&Math.max(r.width,r.height)<=(r.size==='full'?1280:320));
    }catch(error){out.ok=false;out.status=error.status||0;out.error=String(error.message||error.errMsg||'').replace(/https?:\S+/g,'[url]');}
    finally{
      wx.uploadFile=originalUpload;
      if(testId&&current())try{out.calls++;await api.request('/items/'+testId,{method:'DELETE'});out.calls++;await api.request('/trash/'+testId,{method:'DELETE'});out.purging=true;}catch(error){out.cleanup_status=error.status||0;}
      photo.releasePage(page);api.photoCache().release(owner);
      if(original)try{wx.getFileSystemManager().unlink({filePath:original});}catch(_){}
      out.pending=false;out.phase='await_exact_storage_cleanup';
    }
  })();return {started:true};
}
