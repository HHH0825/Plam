// Read-only audit of the current mini-program package configuration.
const fs=require('node:fs'),path=require('node:path')
const root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,process.env.MEMBER_VISUAL_OUTPUT||'../docs/images/membership-20261015')
const config=JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8'))
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).filter(e=>!['.git','node_modules','__pycache__'].includes(e.name)&&!e.name.startsWith('project.private')).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)])
const all=walk(root),relative=f=>path.relative(root,f).replace(/\\/g,'/')
const ignored=name=>(config.packOptions.ignore||[]).some(r=>r.type==='suffix'?name.endsWith(r.value):r.type==='folder'?name.startsWith(r.value+'/'):r.type==='file'?name===r.value:false)
const runtime=all.filter(f=>!ignored(relative(f))),packaged=new Set(runtime.map(relative)),missing=[]
for(const file of runtime.filter(f=>/\.(js|wxml|wxss|json)$/.test(f)&&!path.basename(f).startsWith('project.'))){
 for(const m of fs.readFileSync(file,'utf8').matchAll(/\/?(?:pages\/[\w-]+\/)?assets\/[\w./-]+\.(?:png|webp)/g))if(!packaged.has(m[0].replace(/^\//,'')))missing.push({source:relative(file),asset:m[0]})
}
const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8')),sizes=require('./package-sizes.cjs')
const pages=[...app.pages,...sizes.packages(app).flatMap(p=>p.pages.map(n=>p.root+'/'+n))]
for(const page of ['pages/membership/index','pages/member-tools/index'])if(!pages.includes(page))missing.push({page})
const result={passed:!missing.length,sourceBytes:all.reduce((s,f)=>s+fs.statSync(f).size,0),runtimeBytes:runtime.reduce((s,f)=>s+fs.statSync(f).size,0),limit:2*1024*1024,runtimeFiles:runtime.length,missing,sourceEstimate:true,remoteWrites:0,deployed:false}
result.packageSizes=sizes.measure(runtime.map(f=>({name:relative(f),bytes:fs.statSync(f).size})),app)
try{sizes.check(result.packageSizes)}catch(e){result.passed=false;result.budgetError=e.message}
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'package-results.json'),JSON.stringify(result,null,2))
console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1
