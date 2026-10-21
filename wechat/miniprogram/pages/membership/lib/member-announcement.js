// Read acknowledgements are local preferences, never authentication or membership data.
const dismissed=new Set()
function identity(app){
 const id=app.globalData.user?.id
 return id!==undefined&&id!==null&&id!==''?'palmMemberAnnouncement:v1:'+require('../../../utils/cloud-transport').serviceScope()+':'+id:''
}
function prepare(page,app=getApp()){
 const key=identity(app),token=app.globalData.token
 if(page._announcementKey!==key||page._announcementToken!==token){
  page._announcementKey=key;page._announcementToken=token
  page.setData({announcementOpen:false})
 }
 return key
}
function ready(page){return !!(page.data.membership?.supported&&page.data.feedbackMessage)}
function present(page,app=getApp(),storage=wx){
 const key=prepare(page,app)
 if(!ready(page)){page.setData({announcementOpen:false});return}
 if(!key||dismissed.has(key))return
 let seen=false
 try{seen=storage.getStorageSync(key)===true}catch(_){}
 if(seen){dismissed.add(key);return}
 page.setData({announcementOpen:true})
}
function open(page,app=getApp()){
 prepare(page,app)
 if(!page.data.loading&&!page.data.error&&ready(page))page.setData({announcementOpen:true})
}
function close(page,app=getApp(),storage=wx){
 const valid=page._announcementToken===app.globalData.token&&page._announcementKey===identity(app)
 if(!valid){prepare(page,app);return}
 if(!page.data.announcementOpen)return
 const key=page._announcementKey
 page.setData({announcementOpen:false})
 if(key){dismissed.add(key);try{storage.setStorageSync(key,true)}catch(_){}}
}
module.exports={prepare,present,open,close}
