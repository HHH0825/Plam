// Isolated, offline-only native acceptance project. Never edits the real project.
const fs=require('node:fs'),path=require('node:path')
const source=path.resolve(__dirname,'../miniprogram'),workspace=path.resolve(__dirname,'../..'),target=path.join(workspace,'test-results/local-native-project')
if(!target.startsWith(workspace+path.sep))throw Error('Unsafe acceptance path')
for(const {name}of require('./package-sizes.cjs').sourceRows(source)){
 const dest=path.join(target,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(source,name),dest)
}
const app=path.join(target,'app.js')
fs.writeFileSync(app,fs.readFileSync(app,'utf8').replace('onLaunch(options = {}) {',"onLaunch(options = {}) { this._testLocal=require('./local-core/runtime')"))
fs.writeFileSync(path.join(target,'config.js'),"module.exports={LOCAL_BUILD:'local',API_TRANSPORT:'local_http',API_BASE:'http://127.0.0.1:9',DEV_LOGIN:false,CLOUD_PHOTOS_ENABLED:false}\n")
console.log(JSON.stringify({project:target,offline:true,productionChanged:false}))
