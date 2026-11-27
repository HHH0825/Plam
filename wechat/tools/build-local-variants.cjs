// Produce reviewable projects only. This command cannot upload or deploy.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const {minify}=require('terser')
const workspace=path.resolve(__dirname,'../..'),root=path.join(workspace,'wechat/miniprogram'),out=path.join(workspace,'test-results/local-builds'),sizes=require('./package-sizes.cjs')
const sha=raw=>crypto.createHash('sha256').update(raw).digest('hex')
async function minifyScript(raw){
 return Buffer.from((await minify(raw.toString(),{compress:{passes:1},mangle:{toplevel:true},keep_fnames:true,keep_classnames:true,format:{comments:/@license|@preserve/}})).code+'\n')
}
const css=s=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\s+/g,' ').replace(/\s*([{}:;,>])\s*/g,'$1').replace(/;}/g,'}').trim()
function writeProject(folder,entries){
 if(!folder.startsWith(out+path.sep))throw Error('Unsafe generated project path')
 fs.mkdirSync(folder,{recursive:true})
 for(const [name,raw]of entries){const dest=path.join(folder,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,raw)}
 function prune(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.resolve(dir,e.name);if(!file.startsWith(folder+path.sep))throw Error('Unsafe generated file');if(e.isDirectory())prune(file);else if(!entries.has(path.relative(folder,file).replaceAll('\\','/')))fs.unlinkSync(file)}}prune(folder)
}
function resolve(entries,from,ref){if(!ref.startsWith('.'))throw Error('Unsupported runtime dependency '+ref);const base=path.posix.normalize(path.posix.join(path.posix.dirname(from),ref));for(const n of [base,base+'.js',base+'.json',base+'/index.js'])if(entries.has(n))return n;throw Error('Missing dependency '+from+' -> '+ref)}
function pruneJs(entries,app){
 const queue=['app.js',...app.pages.map(p=>p+'.js'),...(app.subPackages||[]).flatMap(p=>p.pages.map(n=>p.root+'/'+n+'.js')),'custom-tab-bar/index.js'],keep=new Set()
 for(const [name,raw]of entries)if(name.endsWith('.json')){const json=JSON.parse(raw.toString());for(const ref of Object.values(json.usingComponents||{})){const js=ref.startsWith('/')?ref.slice(1)+'.js':path.posix.normalize(path.posix.join(path.posix.dirname(name),ref))+'.js';if(entries.has(js))queue.push(js)}}
 while(queue.length){const name=queue.pop();if(keep.has(name))continue;if(!entries.has(name))throw Error('Missing entry '+name);keep.add(name);if(!name.endsWith('.js'))continue;for(const m of entries.get(name).toString().matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g))queue.push(resolve(entries,name,m[1]))}
 for(const name of entries.keys())if(name.endsWith('.js')&&!keep.has(name))entries.delete(name)
}
function compatibility(entries,names){for(const name of names){const base='pages/'+name+'/index';entries.set(base+'.js',Buffer.from("Page(require('../../utils/share').wrap({sessionPublic:true,onLoad(){wx.redirectTo({url:'/pages/local-data/index'})}}))\n"));entries.set(base+'.json',Buffer.from(JSON.stringify({navigationBarTitleText:'资料与免费本地版',usingComponents:{}})));entries.set(base+'.wxml',Buffer.from('<view>正在打开资料与免费工具…</view>\n'));entries.set(base+'.wxss',Buffer.from('view{padding:24px;color:#7e796e}\n'))}}
function localize(entries){
 const set=(n,s)=>entries.set(n,Buffer.from(s)),get=n=>entries.get(n).toString()
 for(const [name,template]of [['app.js','app.js'],['utils/api.js','api.js']])entries.set(name,fs.readFileSync(path.join(__dirname,'local-template',template)))
 set('config.js',"module.exports={LOCAL_BUILD:'local',API_TRANSPORT:'local',API_BASE:'',DEV_LOGIN:false,CLOUD_PHOTOS_ENABLED:false}\n")
 set('utils/cloud-transport.js',"module.exports={serviceScope:()=> 'local-device-v1:'+require('../local-core/runtime').scope(),clear(){}}\n")
 set('utils/member.js',get('utils/member.js').replace("const {platform} = require('./payment-platform')","const platform=()=>''"))
 compatibility(entries,['membership','member-benefits','rewards','login'])
 set('pages/me/index.wxml',get('pages/me/index.wxml').replace(/<button[^>]*id="menu-rewards"[\s\S]*?<\/button>/,''))
 set('components/cat-feedback/index.wxml',get('components/cat-feedback/index.wxml').split('\n').filter(line=>!line.includes('class="greeting-reward"')&&!line.includes('bindtap="goCheckin"')).join('\n'))
 let page=get('pages/local-data/index.js').split('\n').filter(l=>!l.startsWith('const migration=')&&!/^ (onHide|onUnload|async refreshMigration|enterCloudMigration|retryCloudConnection|startMigration|toggleMigrationTools|beginMigration|downloadMigration|redownloadMigration|backupMigration|backupPrevious|confirmMigration)\(/.test(l)).join('\n')
 page=page.replace(/ onShow\(\)\{[^\n]+\},/," onShow(){this.setData({local:true});this.refresh()},").replace('else await this.refreshMigration()','else await this.refresh()')
 set('pages/local-data/index.js',page)
 let markup=get('pages/local-data/index.wxml'),begin=markup.indexOf(' <block wx:if="{{!local}}">'),end=markup.indexOf(' <block wx:else>')
 if(begin<0||end<begin)throw Error('Local data page boundary changed')
 markup=markup.slice(0,begin)+' <block>'+markup.slice(end+' <block wx:else>'.length)
 markup=markup.split('\n').filter(line=>!line.includes('wx:if="{{transition}}"')).join('\n')
 set('pages/local-data/index.wxml',markup.replace(`bindtap="{{local ? 'refresh' : 'refreshMigration'}}"`,'bindtap="refresh"'))
 let runtime=get('local-core/runtime.js');const at=runtime.indexOf('\nasync function activateMigration(');if(at<0)throw Error('Migration runtime boundary missing');runtime=runtime.slice(0,at).replace(/,activateMigration(?=[,}])/,'');set('local-core/runtime.js',runtime)
 const about='pages/login/about.wxml';if(entries.has(about))set(about,get(about).replaceAll('微信登录，开始记录','开始本机记录').replaceAll('首次登录会建立独立的小程序账户','免登录，本机保存；换手机请先完整备份'))
}
async function build(variant){
 if(variant!=='local')throw Error('过渡方案已取消，仅构建纯本地版 local')
 const entries=new Map(sizes.sourceRows(root).filter(r=>!r.name.startsWith('minitest/')).map(r=>[r.name,fs.readFileSync(path.join(root,r.name))]))
 const inputs=[...entries].map(([name,raw])=>({name,sha256:sha(raw)}));for(const name of ['app.js','api.js'])inputs.push({name:'@template/'+name,sha256:sha(fs.readFileSync(path.join(__dirname,'local-template',name)))})
 localize(entries)
 entries.set('pages/me/index.wxml',Buffer.from(entries.get('pages/me/index.wxml').toString().replace(/<button[^>]*id="menu-rewards"[\s\S]*?<\/button>/,'')))
 const retiredWallet='assets/rewards/wallet-cat.png';for(const [name,raw]of entries)if(/\.(js|json|wxml|wxss)$/.test(name)&&raw.toString().includes(retiredWallet))throw Error('Retired wallet asset is still referenced: '+name);entries.delete(retiredWallet)
 const app=JSON.parse(entries.get('app.json'));pruneJs(entries,app)
 if(variant==='local')for(const [name,raw]of entries)if(name.endsWith('.js')&&/wx\.(?:cloud|login|request|uploadFile|downloadFile|requestPayment|requestVirtualPayment)\b|Bearer\s|session_token|CLOUDBASE_ENV_ID/.test(raw.toString()))throw Error('Network/auth/payment remains in final local build: '+name)
 const compiled=new Map(),files=[]
 for(const [name,raw]of entries){let built=raw;if(name.endsWith('.js')&&name!=='utils/local-item-list.js'&&!name.startsWith('local-core/')&&!name.startsWith('pages/local-data/lib/'))built=await minifyScript(raw);else if(name.endsWith('.json'))built=Buffer.from(JSON.stringify(JSON.parse(raw))+'\n');else if(name.endsWith('.wxss'))built=Buffer.from(css(raw.toString())+'\n');compiled.set(name,built);files.push({name,sourceBytes:raw.length,bytes:built.length,sourceSha256:sha(raw),sha256:sha(built)})}
 const sourcePackages=sizes.measure(files,app,'sourceBytes'),builtPackages=sizes.measure(files,app);sizes.check(sourcePackages);sizes.check(builtPackages)
 writeProject(path.join(out,variant+'-source'),entries);writeProject(path.join(out,variant),compiled)
 const manifest={variant,publicationMode:'direct-local',automaticCloudMigration:false,sourceProject:path.join(out,variant+'-source'),project:path.join(out,variant),sourcePackages,builtPackages,pages:app.pages.length+app.subPackages.reduce((n,p)=>n+p.pages.length,0),inputs,files,uploaded:false,deployed:false}
 fs.writeFileSync(path.join(out,variant+'-manifest.json'),JSON.stringify(manifest,null,2));return {variant,pages:manifest.pages,sourceMain:sourcePackages.mainBytes,builtMain:builtPackages.mainBytes,files:files.length}
}
async function main(){fs.mkdirSync(out,{recursive:true});console.log(JSON.stringify(await build('local')))}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1})
module.exports={build,localize,pruneJs,minifyScript,writeProject}
