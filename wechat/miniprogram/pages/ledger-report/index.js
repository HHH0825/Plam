const api=require('../../utils/api'),ledger=require('../../utils/ledger'),analytics=require('../../utils/ledger-analytics')
const image=require('../../utils/ledger-report-image'),{discardImage}=require('../../utils/report-image'),{nativeCall}=require('../../utils/photo-edit')
const LOGIN='/pages/items/index'
async function exists(path){if(!path)return false;return new Promise(resolve=>{try{wx.getFileSystemManager().access({path,success:()=>resolve(true),fail:()=>resolve(false)})}catch(_){resolve(false)}})}
Page(require('../../utils/member').wrap({
 data:{month:'',maxMonth:ledger.today().slice(0,7),loading:true,error:'',cashAnalysis:null,cashAnalysisError:'',reportPreview:true,reportLayout:null,showAmounts:true,imageBusy:false,imagePath:'',coverPath:'',shareFallback:false,imageError:''},
 onLoad(options={}){this._sequence=0;this._requested=analytics.validMonth(options.month)?options.month:ledger.today().slice(0,7)},
 onMemberAppearanceChange(){this.clearImages();this.measurePreview()},
 onReady(){this.measurePreview()},
 onResize(){this.measurePreview()},
 async measurePreview(){
  if(!this.data.cashAnalysis||!wx.createSelectorQuery)return
  const seq=this._sequence,token=this._token,model=this.data.cashAnalysis,attempt=this._previewAttempt={}
  try{const canvas=await image.canvasFor(this);if(!this.current(seq,token)||attempt!==this._previewAttempt)return
   const info=wx.getWindowInfo?.()||wx.getSystemInfoSync?.()||{windowWidth:390},font=wx.getAppBaseInfo?.().fontSizeSetting||16
   const nextScale=Math.max(1,Math.min(1.6,font/16));if(this._reportFontScale&&this._reportFontScale!==nextScale)this.clearImages();this._reportFontScale=nextScale;const width=Math.min(480,info.windowWidth)-36
   const layout=image.plan(canvas.getContext('2d'),model,false,this._reportFontScale);this.setData({reportLayout:image.preview(layout,width)})
  }catch(_){if(this.current(seq,token))this.setData({imageError:'小报排版读取失败，请重新读取。'})}
 },
 onShow(){
  this._visible=true
  if(!getApp().requireSession()){this.invalidate();return}
  if(this._resumeNative&&this._token===getApp().globalData.token&&this._day===ledger.today()&&this.data.cashAnalysis){this._resumeNative=false;this._nativeActive=false;this.startClock();return}
  this._resumeNative=false;this._nativeActive=false;this.load()
  this.startClock()
 },
 startClock(){clearInterval(this._clock);this._clock=setInterval(()=>{if(this._visible&&this._day!==ledger.today())this.load()},30000);this._clock?.unref?.()},
 onHide(){this._visible=false;clearInterval(this._clock);if((this._nativeActive||Date.now()<(this._nativeUntil||0))&&this._token===getApp().globalData.token){this._resumeNative=true;return}this.invalidate()},
 onUnload(){this._visible=false;clearInterval(this._clock);this.invalidate()},
 current(seq,token,key){return (this._visible||this._nativeActive)&&seq===this._sequence&&token===this._token&&token===getApp().globalData.token&&(key===undefined||key===this._imageKey)},
 clearImages(){this._imageKey={};discardImage(this.data.imagePath);discardImage(this.data.coverPath);this.setData({imagePath:'',coverPath:'',imageBusy:false,imageError:'',shareFallback:false})},
 invalidate(){this._sequence++;this._model=null;this._previewAttempt=null;this._nativeUntil=0;this._resumeNative=false;this.clearImages();this.setData({cashAnalysis:null,reportLayout:null})},
 async load(){
  this.invalidate();const seq=this._sequence,token=this._token=getApp().globalData.token,month=this._requested;this._day=ledger.today()
  this.setData({loading:true,error:'',month,maxMonth:this._day.slice(0,7)})
  try{
   const account=await api.request('/auth/me');if(!this.current(seq,token))return;if(account.capabilities?.cash_ledger!==1)throw Error('收支小报暂不可用，请同步新版服务端。')
   const settings=await api.request('/ledger/settings');if(!this.current(seq,token))return;if(settings.enabled!==true)throw Error('请先在记账页开启记账。')
   const raw=await api.request('/ledger/statistics?month='+month);if(!this.current(seq,token))return
   this._model=analytics.snapshot(raw,month,this._day);this.setData({cashAnalysis:analytics.present(this._model,this.data.showAmounts)},()=>this.measurePreview())
  }catch(e){if(this.current(seq,token))this.setData({error:e.message,cashAnalysis:null})}
  finally{if(this.current(seq,token))this.setData({loading:false})}
 },
 monthChange(e){if(!analytics.validMonth(e.detail.value)||e.detail.value===this._requested)return;this._requested=e.detail.value;this.load()},
 toggleAmounts(e){if(!this._model||this.data.imageBusy)return;this.clearImages();this.setData({showAmounts:!!e.detail.value,cashAnalysis:analytics.present(this._model,!!e.detail.value),reportLayout:null},()=>this.measurePreview())},
 preview(){return this.exportImage('preview')},saveImage(){return this.exportImage('save')},shareImage(){return this.exportImage('share')},
 async fallback(current){let path=this.data.coverPath;if(!await exists(path))path='';if(!current())return;path=path||await image.render(this,this.data.cashAnalysis,current,true);if(!current()){discardImage(path);return}this.setData({coverPath:path,shareFallback:true,imageError:'可再次点击下方按钮，改用小程序卡片分享。'})},
 onShareAppMessage(options={}){if(options.from!=='button')return require('../../utils/share').introduction();const scoped=this._token===getApp().globalData.token&&!!this.data.cashAnalysis&&!!this.data.coverPath;this._nativeActive=true;this._nativeUntil=Date.now()+1500;return {title:scoped?this.data.month+' · 猫爪收支小报':'猫爪物帐 · 记下生活的小脚印',path:LOGIN,imageUrl:scoped?this.data.coverPath:'/assets/white-doodle/share-fallback.png'}},
 async exportImage(action){
  if(this._token!==getApp().globalData.token){this.invalidate();return}
  if(!this._visible||!this._model||this.data.loading||this.data.error||this.data.imageBusy||!getApp().requireSession())return
  await this.memberRefresh(true);if(!this._visible||this._token!==getApp().globalData.token||!this._model)return;const seq=this._sequence,token=this._token,key=this._imageKey,current=()=>this.current(seq,token,key),model=this.data.cashAnalysis
  this.setData({imageBusy:true,imageError:''})
  try{
   let path=this.data.imagePath;if(!await exists(path))path='';if(!current())return
   path=path||await image.render(this,model,current);if(!current()){discardImage(path);return}this.setData({imagePath:path})
   if(action==='share'&&(typeof wx.showShareImageMenu!=='function'||wx.canIUse&&!wx.canIUse('showShareImageMenu'))){await this.fallback(current);return}
   this._nativeActive=true;this._nativeUntil=Date.now()+1500
   if(action==='preview')await nativeCall('previewImage',{current:path,urls:[path]})
   else if(action==='share')await nativeCall('showShareImageMenu',{path,needShowEntrance:true,entrancePath:LOGIN})
   else{await nativeCall('saveImageToPhotosAlbum',{filePath:path});if(current())wx.showToast({title:'已保存到相册',icon:'success'})}
  }catch(e){if(!current())return;this._nativeUntil=0;if(/cancel/i.test(e.errMsg||e.message||''))return;if(action==='share'){try{await this.fallback(current)}catch(_){if(current())this.setData({imageError:'分享封面生成失败，请重试。'})}}else this.setData({imageError:/auth|deny|denied|permission|privacy/i.test(e.errMsg||'')?'没有相册保存权限，可预览图片或在微信设置中允许后重试。':'图片生成或保存失败，请重试。'})}
  finally{if(current())this.setData({imageBusy:false});this._nativeActive=false}
 }
}))
