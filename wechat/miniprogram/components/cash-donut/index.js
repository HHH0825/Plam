const {drawRing}=require('../../utils/ledger-analytics')
const {nativeCall}=require('../../utils/photo-edit')
function remove(path){if(path)try{wx.getFileSystemManager().unlink({filePath:path,success(){},fail(){}})}catch(_){}}
function account(){return getApp().globalData.token}
Component({
 properties:{rows:{type:Array,value:[]},amount:{type:String,value:''},size:{type:Number,value:146},plain:{type:Boolean,value:false}},
 data:{imagePath:'',renderError:false,placeholderStyle:''},
 observers:{'rows,size,plain'(){this.draw()}},
 lifetimes:{ready(){this._ready=true;this._version=0;this.draw()},detached(){this._ready=false;this._version++;this._pending=null;remove(this._path);this._path=''}},
 methods:{
 draw(){
  if(!this._ready)return
  const size=Number.isFinite(this.data.size)&&this.data.size>0?this.data.size:146,plain=!!this.data.plain
  const rows=this.data.rows.map(r=>({ratio:r.ratio,color:r.color})),key=JSON.stringify([size,plain,rows]),token=account()
  if(this._key===key&&this._account===token&&!this.data.renderError)return
  this._key=key;this._account=token
  const job={size,plain,rows,token,version:++this._version},old=this._path;this._path=''
  const outer=size*(plain?1:.91),border=size*(plain?58/276:.17)
  this.setData({imagePath:'',renderError:false,placeholderStyle:`left:${(size-outer)/2}px;top:${(size-outer)/2}px;width:${outer}px;height:${outer}px;border-width:${border}px;`},()=>remove(old))
  this._pending=job;this.drain()
 },
 current(job){return this._ready&&job.version===this._version&&job.token===account()},
 canvas(retry=0){return new Promise((resolve,reject)=>wx.nextTick(()=>{
  if(!this._ready)return reject(Error('Detached'))
  this.createSelectorQuery().select('#ring-renderer').fields({node:true}).exec(r=>{
   if(r?.[0]?.node)return resolve(r[0].node)
   if(retry<2)this.canvas(retry+1).then(resolve,reject);else reject(Error('Canvas unavailable'))
  })
 }))},
 async drain(){
  if(this._busy||!this._ready||!this._pending)return
  this._busy=true;const job=this._pending;this._pending=null
  try{
   const node=await this.canvas();if(!this.current(job))return
   const dpr=wx.getWindowInfo?.().pixelRatio||2,ctx=node.getContext('2d'),size=job.size
   node.width=Math.round(size*dpr);node.height=Math.round(size*dpr);ctx.scale(dpr,dpr);ctx.clearRect(0,0,size,size)
   drawRing(ctx,job.rows,size/2,size/2,size*(job.plain?109/276:.37),size*(job.plain?58/276:.17))
   // Only this screen-external canvas is native. Visible content is a normal image.
   const result=await nativeCall('canvasToTempFilePath',{canvas:node,destWidth:node.width,destHeight:node.height,fileType:'png'},this)
   if(!this.current(job)){remove(result.tempFilePath);return}
   if(!result.tempFilePath)throw Error('No ring image')
   this._path=result.tempFilePath;this.setData({imagePath:this._path,renderError:false})
  }catch(_){if(this.current(job))this.setData({imagePath:'',renderError:true})}
  finally{this._busy=false;if(this._pending)this.drain()}
 },
 imageFailed(e){
  if(!this._ready||e.currentTarget.dataset.path!==this._path)return
  const old=this._path;this._path='';this.setData({imagePath:'',renderError:true},()=>remove(old))
 }
 }
})
