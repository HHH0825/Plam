// Keep source artwork/history while excluding unused image assets from release.
const fs=require('node:fs'),path=require('node:path')
const root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/compact-glass')
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)])
const files=walk(root),rel=p=>path.relative(root,p).replace(/\\/g,'/')
const sources=files.filter(p=>/\.(js|json|wxml|wxss)$/.test(p)&&!path.basename(p).startsWith('project.'))
const used=new Set()
for(const p of sources){for(const m of fs.readFileSync(p,'utf8').matchAll(/\/?assets\/[\w./-]+\.png/g))used.add(m[0].replace(/^\//,''))}
// Dynamic runtime families: report month numbers, type icons, labels and avatars.
for(const p of files.filter(p=>p.endsWith('.png'))){const name=rel(p);if(name.startsWith('assets/white-doodle/')||/^assets\/paper\/avatar-/.test(name))used.add(name)}
for(const name of used)if(!fs.existsSync(path.join(root,name)))throw Error('Missing asset '+name)
const excluded=files.filter(p=>p.endsWith('.png')&&!used.has(rel(p))).map(rel)
const file=path.join(root,'project.config.json'),config=JSON.parse(fs.readFileSync(file))
config.packOptions.ignore=[{type:'suffix',value:'.svg'},...excluded.map(value=>({type:'file',value}))]
config.packOptions.include=[...used].sort().map(value=>({type:'file',value}))
fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n')
const runtime=files.filter(p=>!p.endsWith('.svg')&&!excluded.includes(rel(p)))
const bytes=runtime.reduce((sum,p)=>sum+fs.statSync(p).size,0)
const audit={date:'2026-10-10',sourceBytes:files.reduce((s,p)=>s+fs.statSync(p).size,0),runtimeBytes:bytes,limit:2*1024*1024,excluded,used:[...used]}
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'package-audit.json'),JSON.stringify(audit,null,2))
console.log(JSON.stringify({runtimeBytes:bytes,excludedImages:excluded.length,under2MiB:bytes<audit.limit}))
if(bytes>=audit.limit)throw Error('Package exceeds 2MiB')
