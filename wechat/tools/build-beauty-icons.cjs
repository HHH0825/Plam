// Build a complete importable project. Editable sources stay untouched.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../../test-results/beauty-icons-project'),report=path.resolve(__dirname,'../../test-results/beauty-icons-build.json')
const compiler=process.argv[2]||path.resolve(__dirname,'../../test-results/wechat-terser.cjs'),context={}
vm.runInNewContext(fs.readFileSync(compiler,'utf8'),context)
const config=JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8'))
function match(name,r){return r.type==='file'&&name===r.value||r.type==='folder'&&name.startsWith(r.value+'/')||r.type==='suffix'&&name.endsWith(r.value)}
function ignored(name){return config.packOptions.ignore.some(r=>match(name,r))&&!config.packOptions.include.some(r=>match(name,r))}
function css(text){const strings=[];text=text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,value=>{strings.push(value);return '__COVER_STRING_'+(strings.length-1)+'__'});return text.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\s+/g,' ').replace(/\s*([{}:;,>])\s*/g,'$1').replace(/;}/g,'}').trim().replace(/__COVER_STRING_(\d+)__/g,(_,i)=>strings[i])}
const hash=buf=>crypto.createHash('sha256').update(buf).digest('hex')
async function main(){
 fs.mkdirSync(out,{recursive:true});const files=[]
 async function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name),name=path.relative(root,file).replaceAll('\\','/');if(entry.name.startsWith('project.private')||['node_modules','.git','__pycache__'].includes(entry.name))continue;if(entry.isDirectory()){await walk(file);continue}if(ignored(name))continue;const raw=fs.readFileSync(file);let built=raw
  if(name.endsWith('.js'))built=Buffer.from((await context.Terser.minify(raw.toString('utf8'),{compress:{passes:1},mangle:{toplevel:true},keep_fnames:true,keep_classnames:true,format:{comments:/@license|@preserve/}})).code+'\n')
  else if(name.endsWith('.json')){const value=JSON.parse(raw.toString('utf8'));if(name==='project.config.json')value.packOptions={ignore:[{type:'suffix',value:'.svg'},{type:'file',value:'project.private.config.json'},{type:'folder',value:'node_modules'}],include:[{type:'file',value:'pages/login/assets/hero.png'}]};built=Buffer.from(JSON.stringify(value)+'\n')}
  else if(name.endsWith('.wxss'))built=Buffer.from(css(raw.toString('utf8'))+'\n')
  const target=path.join(out,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,built);files.push({name,sourceBytes:raw.length,bytes:built.length,sourceSha256:hash(raw),sha256:hash(built)})
 }}
 await walk(root)
 // Never leave relocated files in a reused delivery directory: the IDE scans
 // the directory, not our manifest. Remove stale generated files individually.
 const expected=new Set(files.map(f=>f.name))
 function prune(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.resolve(dir,e.name);if(!file.startsWith(out+path.sep))throw Error('Invalid generated output path');if(e.isDirectory())prune(file);else if(!expected.has(path.relative(out,file).replaceAll('\\','/')))fs.unlinkSync(file)}}
 prune(out)
 const sourceBytes=files.reduce((s,f)=>s+f.sourceBytes,0),bytes=files.reduce((s,f)=>s+f.bytes,0)
 const size=require('./package-sizes.cjs'),app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8')),sourcePackages=size.measure(files,app,'sourceBytes'),builtPackages=size.measure(files,app)
 size.check(sourcePackages);size.check(builtPackages)
 fs.writeFileSync(report,JSON.stringify({project:out,compiler:'Terser bundled with the installed WeChat developer tools',propertiesMangled:false,keepFunctionAndClassNames:true,sourceBytes,bytes,sourcePackages,builtPackages,files},null,2));console.log(JSON.stringify({project:out,sourceBytes,bytes,sourceMain:sourcePackages.mainBytes,builtMain:builtPackages.mainBytes,saved:sourceBytes-bytes}))
}
main().catch(e=>{console.error(e);process.exitCode=1})
