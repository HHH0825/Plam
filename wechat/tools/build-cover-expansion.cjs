// Build a complete importable project. Editable sources stay untouched.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../../test-results/cover-expansion-project'),report=path.resolve(__dirname,'../../test-results/cover-expansion-build.json')
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
  else if(name.endsWith('.json'))built=Buffer.from(JSON.stringify(JSON.parse(raw.toString('utf8')))+'\n')
  else if(name.endsWith('.wxss'))built=Buffer.from(css(raw.toString('utf8'))+'\n')
  const target=path.join(out,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,built);files.push({name,sourceBytes:raw.length,bytes:built.length,sourceSha256:hash(raw),sha256:hash(built)})
 }}
 await walk(root)
 const sourceBytes=files.reduce((s,f)=>s+f.sourceBytes,0),bytes=files.reduce((s,f)=>s+f.bytes,0)
 if(bytes>=2*1024*1024)throw Error('Built source-size check exceeds 2MiB: '+bytes)
 fs.writeFileSync(report,JSON.stringify({project:out,compiler:'Terser bundled with the installed WeChat developer tools',propertiesMangled:false,keepFunctionAndClassNames:true,sourceBytes,bytes,files},null,2));console.log(JSON.stringify({project:out,sourceBytes,bytes,saved:sourceBytes-bytes}))
}
main().catch(e=>{console.error(e);process.exitCode=1})
