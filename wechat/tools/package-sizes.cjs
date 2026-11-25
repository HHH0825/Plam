// Measure each WeChat package, including the uncompressed editable project.
const fs=require('node:fs'),path=require('node:path')
const BUDGET=Math.floor(1.9*1024*1024),MAIN_BUDGET=1450000
function packages(app){return (app.subPackages||app.subpackages||[]).map(p=>({...p,root:p.root.replace(/\/$/,'')}))}
function owner(name,subs){return subs.find(p=>name.startsWith(p.root+'/'))?.root||'main'}
function measure(rows,app,key='bytes'){
 const subs=packages(app),sizes={main:0,...Object.fromEntries(subs.map(p=>[p.root,0]))}
 for(const row of rows)sizes[owner(row.name,subs)]+=row[key]
 return {totalBytes:Object.values(sizes).reduce((a,b)=>a+b,0),mainBytes:sizes.main,packages:sizes,budgetBytes:BUDGET,mainBudgetBytes:MAIN_BUDGET}
}
function check(result){for(const[name,bytes]of Object.entries(result.packages)){const limit=name==='main'?MAIN_BUDGET:BUDGET;if(bytes>limit)throw Error(`${name}: ${bytes} bytes exceeds the conservative ${limit}-byte package budget`)}}
const localDirectories = new Set(['node_modules', '.git', '__pycache__', 'backups', 'instance', 'test-results'])
const localFilename = /^(?:\.env(?:\..*)?|\.envrc|env(?:\..*)?\.json|project\.private.*|project\.config\.local\.json|credentials\.json)$/i
const localFileExtension = /\.(?:db|sqlite3?)(?:-[\w-]+)?$|\.(?:bak|backup|credentials\.json|key|p12|pem|pfx|secret\.json|zip|zip\.sha256)$/i
function sourceRows(root){
 const config=JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8')),rows=[]
 const match=(n,r)=>r.type==='file'&&n===r.value||r.type==='folder'&&n.startsWith(r.value+'/')||r.type==='suffix'&&n.endsWith(r.value)
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  if (localDirectories.has(e.name.toLowerCase()) || localFilename.test(e.name) || localFileExtension.test(e.name)) continue
  const file=path.join(dir,e.name),name=path.relative(root,file).replaceAll('\\','/')
  if(e.isDirectory()){walk(file);continue}
  if (!e.isFile()) continue
  if(config.packOptions.ignore.some(r=>match(name,r))&&!config.packOptions.include.some(r=>match(name,r)))continue
  rows.push({name,bytes:fs.statSync(file).size})
 }}walk(root);return rows
}
module.exports={BUDGET,MAIN_BUDGET,packages,owner,measure,check,sourceRows}
if(require.main===module){const root=path.resolve(process.argv[2]||path.join(__dirname,'../miniprogram')),app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8')),result=measure(sourceRows(root),app);check(result);console.log(JSON.stringify({project:root,...result},null,2))}
