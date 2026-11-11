// Receives an isolated Python-backend snapshot, then exercises the actual local
// adapter. This is deliberately not a copy of the Python calculation formulas.
const {Store}=require('../miniprogram/local-core/store')
const {Business}=require('../miniprogram/local-core/business')
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s)
process.stdin.on('end',async()=>{try{
 const fixture=JSON.parse(input),files=new Map(),io={async read(n){return files.get(n)||null},async write(n,b){files.set(n,b)},async rename(a,b){files.set(b,files.get(a));files.delete(a)},async list(){return [...files.keys()]}}
 const store=await new Store(io).open();await store.transaction(tx=>{for(const [table,rows]of Object.entries(fixture.tables))tx.set(table,rows)})
 const business=new Business(store,{clock:()=>Date.parse(fixture.today+'T12:00:00Z')}),result={}
 for(const path of fixture.paths)result[path]=await business.request(path)
 process.stdout.write(JSON.stringify(result))
}catch(e){process.stderr.write(e.stack);process.exitCode=1}})
