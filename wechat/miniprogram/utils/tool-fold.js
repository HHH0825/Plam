const routes=['pages/ledger/index','pages/statistics/index']
function identity(page,app){
 const id=app.globalData.user?.id
 return routes.includes(page.route)&&id!==undefined&&id!==null&&id!==''?{token:app.globalData.token,key:'palmAccountTools:'+require('./cloud-transport').serviceScope()+':'+id+':'+page.route}:null
}
function restore(page,app=getApp(),storage=wx){
 if(!routes.includes(page.route))return
 const own=identity(page,app)
 if(!own&&page._accountToolsKey===''&&page._accountToolsToken===app.globalData.token)return
 if(own&&page._accountToolsKey===own.key&&page._accountToolsToken===own.token)return
 let expanded=false
 if(own){try{expanded=storage.getStorageSync(own.key)===true}catch(_){}}
 page._accountToolsKey=own?.key||'';page._accountToolsToken=own?.token||app.globalData.token
 page.setData({accountToolsExpanded:expanded})
}
function toggle(page,app=getApp(),storage=wx){
 const own=identity(page,app)
 if(page._accountToolsToken!==app.globalData.token||own&&page._accountToolsKey!==own.key)restore(page,app,storage)
 const expanded=require('./motion').fold(page,'accountToolsExpanded','#account-tools-inner')
 if(own){try{storage.setStorageSync(own.key,expanded)}catch(_){}}
}
function hint(page,state){
 if(!routes.includes(page.route))return
 const name=page.data.memberBooks.find(b=>b.id===page.data.memberBookId)?.name
 const text=state==='error'?(name?name+' · 读取失败':'账本读取失败'):state==='loading'?(name?name+' · 正在读取':'正在读取账本…'):state==='unsupported'?'暂未开放':name||'正在读取账本…'
 page.setData({memberBooksState:state,accountToolsHint:text,accountToolsFiltered:page.data.memberBookId!=='all'})
}
module.exports={restore,toggle,hint}
