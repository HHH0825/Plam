const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const sizes=require('../tools/package-sizes.cjs'),root=path.resolve(__dirname,'../miniprogram'),app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'))
test('subpackage split preserves all existing page URLs, keeping launch and tab pages in main',()=>{
 const old=['items','ledger','ledger-record','ledger-detail','ledger-history','ledger-report','statistics','insights','me','login','item','editor','record','trash','disposed','profile','wishlist','fixed-expenses','monthly','storage-locations','membership','member-tools','member-benefits','rewards'].map(p=>'pages/'+p+'/index')
 const subs=sizes.packages(app),all=[...app.pages,...subs.flatMap(p=>p.pages.map(n=>p.root+'/'+n))]
 assert.deepEqual([...all].sort(),[...old,'pages/login/about'].sort());assert.equal(new Set(all).size,25)
 assert.equal(app.pages[0],'pages/items/index');assert.ok(subs.some(p=>p.root==='pages/login'&&!p.independent))
 for(const tab of app.tabBar.list)assert.ok(app.pages.includes(tab.pagePath),tab.pagePath)
 for(const route of all)for(const ext of ['.js','.json','.wxml','.wxss'])assert.ok(fs.existsSync(path.join(root,route+ext)),route+ext)
 for(const pkg of subs){assert.ok(!pkg.independent);assert.ok(!app.pages.some(p=>p.startsWith(pkg.root+'/')));assert.ok(!subs.some(p=>p!==pkg&&pkg.root.startsWith(p.root+'/')))}
})
test('editable main package has upload headroom and package measurement cannot hide a large main',()=>{
 const result=sizes.measure(sizes.sourceRows(root),app);sizes.check(result)
 assert.ok(result.mainBytes<=1450000);assert.ok(result.totalBytes>result.mainBytes)
 assert.throws(()=>sizes.check(sizes.measure([{name:'utils/large.js',bytes:2*1024*1024}],app)),/main/)
 const sub=sizes.packages(app)[0].root
 assert.throws(()=>sizes.check(sizes.measure([{name:sub+'/large.js',bytes:2*1024*1024}],app)),/budget/)
})
test('every local module, style and template dependency stays in its own package or main',()=>{
 const subs=sizes.packages(app),rows=sizes.sourceRows(root)
 for(const row of rows.filter(r=>/\.(js|wxss|wxml|json)$/.test(r.name)&&!r.name.startsWith('project.'))){
  const file=path.join(root,row.name),text=fs.readFileSync(file,'utf8'),patterns=row.name.endsWith('.js')?[/require\(['"]([^'"]+)['"]\)/g]:row.name.endsWith('.wxss')?[/@import\s+['"]([^'"]+)['"]/g]:row.name.endsWith('.wxml')?[/<(?:include|import)\s+src=['"]([^'"]+)['"]/g]:[]
  for(const regex of patterns)for(const m of text.matchAll(regex)){
   if(!m[1].startsWith('.')&&!m[1].startsWith('/'))continue
   let target=m[1].startsWith('/')?path.join(root,m[1].slice(1)):path.resolve(path.dirname(file),m[1]);if(!path.extname(target))target+='.js'
   assert.ok(fs.existsSync(target),row.name+' -> '+m[1])
   const from=sizes.owner(row.name,subs),to=sizes.owner(path.relative(root,target).replaceAll('\\','/'),subs)
   assert.ok(to==='main'||to===from,row.name+' crosses package boundary: '+m[1])
  }
  if(row.name.endsWith('.json'))for(const [tag,ref] of Object.entries(JSON.parse(text).usingComponents||{})){
   if(ref.startsWith('plugin://'))continue
   const target=ref.startsWith('/')?path.join(root,ref.slice(1)):path.resolve(path.dirname(file),ref)
   const from=sizes.owner(row.name,subs),to=sizes.owner(path.relative(root,target).replaceAll('\\','/'),subs)
   for(const ext of ['.js','.json','.wxml','.wxss'])assert.ok(fs.existsSync(target+ext),row.name+' -> '+ref+ext)
   assert.ok(to==='main'||to===from,row.name+' crosses component package boundary: '+ref)
   const template=file.replace(/\.json$/,'.wxml')
   const seen=new Set()
   function markup(file){
    if(seen.has(file))return '';seen.add(file)
    const source=fs.readFileSync(file,'utf8')
    return source.replace(/<(?:include|import)\s+src=['"]([^'"]+)['"][^>]*>/g,(_,ref)=>markup(ref.startsWith('/')?path.join(root,ref.slice(1)):path.resolve(path.dirname(file),ref)))
   }
   if(fs.existsSync(template))assert.ok(new RegExp('<'+tag+'(?:\\s|/|>)').test(markup(template)),row.name+' declares unused component '+tag)
  }
 }
 for(const name of ['appearance-preview','book-sort','cover-picker','drafts','expense-progress','item-category','location-picker','member-announcement','virtual-payment','member-benefits'])assert.equal(fs.existsSync(path.join(root,'utils',name+'.js')),false,name)
})
test('login hero ships once as a lossless PNG with bounded size and explicit resource inclusion',()=>{
 const rows=sizes.sourceRows(root);for(const row of rows.filter(r=>/\.(png|webp|jpg|jpeg|gif|mp3|wav|mp4)$/.test(r.name)))assert.ok(row.bytes<=(row.name==='pages/login/assets/hero.png'?200*1024:195000),row.name)
 assert.ok(rows.some(r=>r.name==='pages/login/assets/hero.png'));assert.ok(!rows.some(r=>r.name==='pages/login/assets/hero.webp'))
 const config=JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8'));assert.ok(config.packOptions.include.some(r=>r.type==='file'&&r.value==='pages/login/assets/hero.png'),'PNG must be included in the IDE upload package')
 const png=fs.readFileSync(path.join(root,'pages/login/assets/hero.png'));assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a')
 const report=JSON.parse(fs.readFileSync(path.join(root,'../branding/code-quality-20261019/hero-lossless.json'),'utf8'));assert.equal(report.format,'png');assert.equal(report.exactPixelsIdentical,true);assert.equal(report.alphaIdentical,true);assert.equal(report.visiblePixelsIdentical,true);assert.equal(require('node:crypto').createHash('sha256').update(png).digest('hex'),report.runtimeSha256)
})
