// Isolated simulator UI evidence. Real startup/page controllers, offline API only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../../test-results/auto-session-native-project'),hashes={}
function copy(dir,rel=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name.startsWith('project.private')||['node_modules','.git'].includes(e.name))continue;const n=path.join(rel,e.name),from=path.join(dir,e.name),to=path.join(out,n);if(e.isDirectory()){fs.mkdirSync(to,{recursive:true});copy(from,n)}else{fs.copyFileSync(from,to);hashes[n]=crypto.createHash('sha256').update(fs.readFileSync(from)).digest('hex')}}}
fs.mkdirSync(out,{recursive:true});copy(root)
const config=JSON.parse(fs.readFileSync(path.join(out,'project.config.json'),'utf8'));config.projectname='猫爪自动连接离线验收';config.condition={};fs.writeFileSync(path.join(out,'project.config.json'),JSON.stringify(config))
const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../test-results/free-tools-fixture.json'),'utf8')).responses
fixture['/items']=[];fixture['/auth/me'].user.username='离线验收猫咪';fs.writeFileSync(path.join(out,'qa-fixture.js'),'module.exports='+JSON.stringify(fixture))
let app=fs.readFileSync(path.join(out,'app.js'),'utf8').replace('this._foreground=true',"this._qaOffline=true;this._qaMode=options.query?.qaSession||'ready';this._foreground=true")
app=`const qaMemory=new Map();wx.getStorageSync=k=>qaMemory.get(k);wx.setStorageSync=(k,v)=>qaMemory.set(k,v);wx.removeStorageSync=k=>qaMemory.delete(k);wx.login=o=>o.success({code:'offline-only'});wx.request=()=>{throw Error('Offline network guard')};wx.uploadFile=()=>{throw Error('Offline upload guard')};if(wx.cloud){wx.cloud.init=()=>{};wx.cloud.callHTTPFunction=()=>{throw Error('Offline cloud guard')};wx.cloud.callFunction=()=>{throw Error('Offline cloud guard')}};\n`+app
fs.writeFileSync(path.join(out,'app.js'),app)
fs.writeFileSync(path.join(out,'utils/api.js'),`const rows=require('../qa-fixture');const clone=v=>JSON.parse(JSON.stringify(v));
async function request(url,options={}){const app=getApp();if(!app._qaOffline)throw Error('Offline account guard');
 if(url==='/auth/login'){if(app._qaMode==='loading')return new Promise(()=>{});if(app._qaMode==='failure')throw Error('离线验收：模拟连接失败');return {token:'a'.repeat(64),expires_at:4102444800,user:clone(rows['/auth/me'].user)}}
 if(url==='/auth/logout')return;
 if((options.method||'GET')!=='GET')throw Error('Offline business-write guard');
 const data=rows[url.split('?')[0]]||rows[url];if(data===undefined)throw Error('Offline response unavailable');return clone(data)
}
module.exports={request,clearPhotos(){},photosAvailable:()=>false,photoCache:()=>({sync(){},release(){},peek:async()=>null,load:async()=>{throw Error('No offline photos')}})}
`)
fs.writeFileSync(path.resolve(__dirname,'../../test-results/auto-session-sandbox.json'),JSON.stringify({out,sourceHashes:hashes,offline:true,realBusinessWrites:0},null,2));console.log(out)
