// Instrument an isolated copy only. Never call deployed services or real login.
const fs=require('node:fs'),path=require('node:path')
const project=path.resolve(__dirname,'../../test-results/beauty-icons-native-project')
const read=n=>fs.readFileSync(path.join(project,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(project,n),s)
if(!read('config.js').includes('127.0.0.1:9'))throw Error('Offline project required')
write('config.js',read('config.js').replace(/DEV_LOGIN:\s*true/,'DEV_LOGIN: false'))
const app=fs.readFileSync(path.resolve(__dirname,'../miniprogram/app.js'),'utf8')
write('app.js',`const __qaStart=Date.now();function __qaApp(d){const launch=d.onLaunch;d.onLaunch=function(o){this._qa={start:__qaStart,events:[],requests:[]};wx.removeStorageSync('palmSession:local:http://127.0.0.1:9');launch.call(this,o)};App(d)};\n`+app.replace(/\bApp\(/,'__qaApp('))
const spec=JSON.parse(read('app.json')),routes=[...spec.pages,...spec.subPackages.flatMap(p=>p.pages.map(n=>p.root+'/'+n))]
for(const route of routes){
 let body=read(route+'.js')
 // Remove an earlier, test-only login wrapper before adding uniform instrumentation.
 if(body.includes('function __qualityPage('))body=body.slice(body.indexOf('\n')+1).replace(/\b__qualityPage\(/,'Page(')
 const hook=`function __qaPage(d){for(const key of ['onLoad','onReady','onRouteDone','onShow']){const old=d[key];d[key]=function(...a){getApp()._qa.events.push({route:this.route,event:key,at:Date.now()-getApp()._qa.start});return old?.apply(this,a)}}d.__qaHero=function(){getApp()._qa.events.push({route:this.route,event:'heroLoaded',at:Date.now()-getApp()._qa.start})};Page(d)};\n`
 write(route+'.js',hook+body.replace(/\bPage\(/,'__qaPage('))
}
write('pages/login/index.wxml',read('pages/login/index.wxml').replace('bindload="qaHeroLoaded"','').replace('class="welcome-cat"','bindload="__qaHero" class="welcome-cat"'))
// API stubs use public sample fixtures and explicit fake account IDs exclusively.
write('utils/api.js',`const real=require('./api-original'),base=require('../qa-fixture');const clone=x=>JSON.parse(JSON.stringify(x));
async function request(url,options={}){const app=getApp();app._qa.requests.push({path:url,method:options.method||'GET',at:Date.now()-app._qa.start});if(!app.globalData.token&&url!=='/auth/login')throw Error('Offline unauthenticated');if(app.globalData.token&&!app.globalData.token.startsWith('isolated-rewards-'))throw Error('Offline account required');await new Promise(r=>setTimeout(r,url.startsWith('/rewards')?120:40));if(url==='/auth/login')return {token:'isolated-rewards-startup',expires_at:4102444800,user:base['/auth/me'].user};if(url==='/auth/logout')return {};if(url.startsWith('/rewards'))return {...clone(base['/rewards']),show:false};if((options.method||'GET')!=='GET')throw Error('Offline writes disabled');const model=base[url]||base[url.split('?')[0]];if(model===undefined)throw Error('Missing offline fixture '+url);return clone(model)}
module.exports={...real,request};`)
console.log(JSON.stringify({project,offline:true,realLogin:false,cloudWrites:0,instrumentedPages:routes.length}))
