// All authentication redirects share one native navigation at a time.
function currentRoute(){try{const pages=getCurrentPages();return pages[pages.length-1]?.route}catch(_){return ''}}
function go(app,target,token=app.globalData.token){
 if(token!==app.globalData.token)return false
 const route='pages/items/index'
 if(currentRoute()===route&&target!=='reset')return false
 if(app._sessionNavigation){
  if(app._sessionNavigation.route!==route)app._nextSessionNavigation={target,token}
  return false
 }
 const job={route,token};app._sessionNavigation=job
 const finish=()=>{
  if(app._sessionNavigation!==job)return
  app._sessionNavigation=null
  const next=app._nextSessionNavigation;app._nextSessionNavigation=null
  if(next&&next.token===app.globalData.token)go(app,next.target,next.token)
 }
 const fail=()=>{finish();wx.showToast?.({title:'页面暂时没打开，请点击重试',icon:'none'})}
 try{wx[target==='reset'?'reLaunch':'switchTab']({url:'/'+route,success:finish,fail})}catch(_){fail()}
 return true
}
module.exports={go}
