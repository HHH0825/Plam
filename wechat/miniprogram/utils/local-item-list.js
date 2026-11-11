const api=require('./api'),view=require('./view'),display=require('./display-cache')
async function load(page,scope,append=false){
 if(append&&(page._localMoreBusy||page._localRequest||page.data.localNext==null))return
 if(!append)page._localRequest?.cancel?.()
 const seq=append?page._sequence:++page._sequence,token=getApp().globalData.token,offset=append?page.data.localNext:0
 const query={scope,offset,limit:60,sort:page.data.sortIndex,q:page.data.query,status:scope==='disposed'?'':page.data.status,category:page.data.category}
 const path='/items/page?'+Object.entries(query).map(([k,v])=>k+'='+encodeURIComponent(v??'')).join('&'),attempt={};page._localAttempt=attempt;page._localMoreBusy=append
 if(!append){page._validatedPhotos=new Set();page.disconnectPhotos();page._photos.release(page._photoOwner)}
 page.setData({localList:true,...(!append?{loading:!page.data.items.length,error:''}:{localMoreLoading:true})})
 try{
  const request=api.request(path);page._localRequest=request;const result=await request
  if(!page.current(seq,token))return
  if(append&&result.version!==page._localVersion)return load(page,scope)
  const categories=['全部分类',...result.categories]
  if(page.data.category&&!categories.includes(page.data.category)){page.setData({category:'',categoryIndex:0});return load(page,scope)}
  const incoming=result.items.map(view.decorate),items=append?[...page.data.items,...incoming]:incoming;page._localVersion=result.version
  page._photos.sync(incoming,false)
  const retained=new Set(items.map(i=>i.id)),photoPaths=Object.fromEntries(Object.entries(page.data.photoPaths).filter(([id])=>retained.has(Number(id)))),photoStates=Object.fromEntries(Object.entries(page.data.photoStates).filter(([id,state])=>state!=='loading'&&retained.has(Number(id))))
  display.present(page,{items,categories,categoryIndex:page.data.category?categories.indexOf(page.data.category):0,listTotal:result.scope_total,localMatches:result.total,localNext:result.next_offset,localHasMore:result.next_offset!==null,localMoreLoading:false,loading:false,error:'',photoPaths,photoStates,artErrors:{}},()=>page.apply(true))
 }catch(error){if(page.current(seq,token))page.setData({loading:false,localMoreLoading:false,error:view.errorMessage(error)})}
 finally{if(page._localAttempt===attempt){page._localMoreBusy=false;page._localRequest=null}}
}
module.exports={load}
