// Build a separate, offline-only project for native screenshots. Production is untouched.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'../miniprogram'),target=path.resolve(__dirname,'../../test-results/member-notice-icon-native-project')
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const sourceHashes={}
function copy(dir,relative=''){
 for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  if(['node_modules','.git'].includes(e.name)||e.name.startsWith('project.private'))continue
  const rel=path.join(relative,e.name),src=path.join(dir,e.name),dest=path.join(target,rel)
  if(e.isDirectory()){fs.mkdirSync(dest,{recursive:true});copy(src,rel)}
  else{fs.copyFileSync(src,dest);sourceHashes[rel]=hash(src)}
 }
}
fs.mkdirSync(target,{recursive:true});copy(root)
const config=JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8'))
// The IDE CLI requires a registered AppID even for a local offline project.
// Keep the project's AppID, but replace all application API access with fixtures.
config.projectname='猫爪会员离线验收';config.condition={}
fs.writeFileSync(path.join(target,'project.config.json'),JSON.stringify(config,null,2))
const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../test-results/announcement-fixture.json'),'utf8'))
fixture.responses['/fixed-expenses']={plans:[],totals:{cents:0,linked_cents:0,unlinked_cents:0,principal_cents:0}}
fixture.responses['/auth/me'].user.username='离线验收猫咪'
fs.writeFileSync(path.join(target,'qa-fixture.js'),'module.exports='+JSON.stringify(fixture.responses))
fs.writeFileSync(path.join(target,'app.js'),`App({
 globalData:{token:'isolated-native-member',expiresAt:4102444800,user:require('./qa-fixture')['/auth/me'].user,qaState:'free'},
 onLaunch(options){this.globalData.qaState=options.query?.qaState||'free';const memory=new Map();wx.getStorageSync=k=>memory.get(k);wx.setStorageSync=(k,v)=>memory.set(k,v)},
 onShow(options){this.globalData.qaState=options.query?.qaState||this.globalData.qaState;require('./utils/member').reset()},
 requireSession(){return true},hasSession(){return true}
})`)
fs.writeFileSync(path.join(target,'utils/api.js'),`const responses=require('../qa-fixture')
async function request(url,method='GET'){
 const operation=typeof method==='string'?method:method.method||'GET'
 if(operation==='PUT'&&url==='/member/books/order'){
  if(getApp().globalData.token!=='isolated-native-member')throw Error('Offline fixture guard')
  const list=responses['/member/books'],ids=method.data.book_ids,current=list.books.filter(b=>!b.archived).map(b=>b.id)
  if(method.revision!==list.order_revision)throw Object.assign(Error('离线列表冲突'),{status:409})
  if(ids.length!==current.length||new Set(ids).size!==current.length||ids.some(id=>!current.includes(id)))throw Error('Invalid fixture order')
  list.books=[...ids.map(id=>list.books.find(b=>b.id===id)),...list.books.filter(b=>b.archived)];list.order_revision++
  return {book_ids:ids,order_revision:list.order_revision}
 }
 if(operation==='PUT'&&url==='/member/appearance'){
  if(getApp().globalData.token!=='isolated-native-member')throw Error('Offline appearance guard')
  const old=responses[url];if(method.revision!==old.saved.revision)throw Object.assign(Error('离线外观版本冲突'),{status:409})
  const saved={...method.data,revision:old.saved.revision+1};responses[url]={saved,effective:saved};return JSON.parse(JSON.stringify(responses[url]))
 }
 if(operation!=='GET')throw Object.assign(Error('离线验收禁止其他业务写入'),{status:403})
 if(url.split('?')[0]==='/membership'){
  url='/membership'
  const kind=getApp().globalData.qaState
  if(kind==='error')throw Error('离线读取失败示例')
  if(kind==='unsupported')throw Object.assign(Error('暂未开放'),{status:404})
  return {...responses[url],promotion:kind==='after-offer'?{...responses[url].promotion,active:false,description:''}:responses[url].promotion,appearance:responses['/member/appearance'],active:kind==='active',status:kind==='active'?'active':kind==='expired'?'expired':'free',expires_at:kind==='active'?Math.floor(Date.now()/1000)+30*86400:kind==='expired'?1791986400:null,server_time:Math.floor(Date.now()/1000)}
 }
 const value=responses[url]||responses[url.split('?')[0]]
 if(value===undefined)throw Error('离线夹具未提供 '+url)
 return JSON.parse(JSON.stringify(value))
}
module.exports={request}`)
fs.writeFileSync(path.resolve(__dirname,'../../test-results/member-notice-icon-sandbox-source-hashes.json'),JSON.stringify({target,sourceHashes},null,2))
console.log(JSON.stringify({target,copiedFiles:Object.keys(sourceHashes).length,offline:true}))


const file=path.join(target,'pages/membership/index.js')
let source=fs.readFileSync(file,'utf8').replace('Page(member.wrap({',`Page(member.wrap({
 onPageScroll(e){this._qaScrollTop=e.scrollTop},
 async qaNoticeLayout(){
  const r=await new Promise(resolve=>wx.createSelectorQuery().in(this).selectAll('.member-announcement-window').boundingClientRect().selectAll('.member-announcement-close').boundingClientRect().selectAll('.member-announcement-scroll').boundingClientRect().selectAll('.member-announcement-body').boundingClientRect().selectAll('.member-announcement-entry').boundingClientRect().selectAll('.member-plan').boundingClientRect().exec(resolve));
  this.setData({qaNoticeLayout:{window:r[0],close:r[1],scroll:r[2],body:r[3],entry:r[4],plans:r[5],viewport:{scrollTop:this._qaScrollTop||0}}})
 },`)
fs.writeFileSync(file,source)
