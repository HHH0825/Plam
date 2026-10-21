// Offline synthetic-only QA. Render production WXML, styles and canvas planner.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url')
const {chromium}=require('playwright')
const {presentMonthly}=require('../miniprogram/utils/monthly'),{pageStyle}=require('../miniprogram/utils/report-design')
const root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/report-editorial'),scratch=path.resolve(__dirname,'../.qa-report-editorial')
const source=name=>fs.readFileSync(path.join(root,name),'utf8')
const fixture={month:'2026-10',today:'2026-10-08',cutoff_date:'2026-10-08',is_current:true,has_activity:true,
 totals:{purchase_count:2,purchase_total:'1399.00',maintenance_total:'80.00',disposal_total:'200.00',cashflow_net:'1279.00'},
 purchases:[{id:1,name:'相机',purchase_date:'2026-10-03',purchase_price:'1200.00',icon_type:'digital'},{id:2,name:'水杯',purchase_date:'2026-10-06',purchase_price:'199.00',icon_type:'daily'}],
 memories:[{key:'bag',item_id:3,name:'帆布袋',date:'2026-10-05',label:'相伴100天'},{key:'lamp',item_id:4,name:'阅读灯',date:'2026-10-08',label:'相伴一周年'}],
 purchase_leaders:[{id:1,name:'相机',purchase_price:'1200.00',share:'85.78'}]}
const icons={3:'/assets/paper/type-clothing.png',4:'/assets/paper/type-home.png'}
const recovery={...fixture,totals:{purchase_count:0,purchase_total:'0.00',maintenance_total:'0.00',disposal_total:'500.00',cashflow_net:'-500.00'},purchases:[],memories:[],purchase_leaders:[]}
const zero={...recovery,totals:{...recovery.totals,disposal_total:'0.00',cashflow_net:'0.00'}}
const empty={...zero,has_activity:false}
const long={...fixture,totals:{...fixture.totals,purchase_count:5,purchase_total:'999999999999.99',cashflow_net:'999999999879.99'},
 purchases:Array.from({length:5},(_,i)=>({id:i+1,name:'一起旅行的相机和珍贵回忆'.repeat(8),purchase_date:'2026-10-03',purchase_price:'199999999999.99',icon_type:'digital'})),
 memories:Array.from({length:5},(_,i)=>({key:String(i),item_id:i+1,name:'长名称物品'.repeat(12),date:'2026-10-08',label:'相伴一周年'.repeat(3)})),
 purchase_leaders:[{id:1,name:'一起旅行的相机'.repeat(8),purchase_price:'199999999999.99',share:'20.00'},{id:2,name:'共同最高的记录'.repeat(8),purchase_price:'199999999999.99',share:'20.00'}]}
const css=['app.wxss','styles/journal.wxss','styles/report-texture.wxss','pages/monthly/index.wxss'].map(source).join('\n').replace(/@import[^;]+;/g,'').replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view(?=[:\s{])/g,'div').replace(/(?<![.\w-])text(?=[:\s{])/g,'span').replace(/(?<![.\w-])image(?=[:\s{])/g,'img')
const template=source('pages/monthly/index.wxml').replace(/<canvas[\s\S]*?\/>/g,'').replace(/<(view|block)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/\bview(?=[\s>])/g,'div').replace(/\bblock(?=[\s>])/g,'div').replace(/\btext(?=[\s>])/g,'span').replace(/\bimage(?=[\s>])/g,'img').replace(/\bpicker(?=[\s>])/g,'div')
async function main(){
 fs.mkdirSync(out,{recursive:true});fs.mkdirSync(scratch,{recursive:true})
 const file=path.join(scratch,'preview.html');fs.writeFileSync(file,'<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']})
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(pathToFileURL(file).href)
 await page.evaluate(({sources})=>{
  const modules={};const run=(code,require)=>{const module={exports:{}};new Function('module','require',code)(module,require);return module.exports}
  for(const name of ['view','collection','report-design','monthly','report-image'])modules[name]=run(sources[name],name=>modules[name.slice(2)]||{})
  window.modules=modules
 },{sources:Object.fromEntries(['view','collection','report-design','monthly','report-image'].map(name=>[name,source('utils/'+name+'.js')]))})
 await page.evaluate(()=>{
window.renderWxml = (template, css, scope, base) => {
      document.querySelectorAll('style').forEach(s => s.remove())
      const style = document.createElement('style'); style.textContent = css + '\nbody{margin:0} img{object-fit:contain} button{border:0;font-family:inherit}'; document.head.append(style)
      const container = document.createElement('div'); container.innerHTML = template
      const value = (expression, scope) => new Function('scope', 'with(scope){return (' + expression + ')}')(scope)
      const interpolate = (text, scope) => text.replace(/{{([\s\S]*?)}}/g, (_, e) => String(value(e, scope)))
      function children(parent, scope) {
        let matched = false
        for (const node of [...parent.childNodes]) {
          if (node.nodeType === 3) { node.textContent = interpolate(node.textContent, scope); continue }
          if (node.nodeType !== 1) continue
          const loop = node.getAttribute('wx:for')
          if (loop) {
            node.removeAttribute('wx:for')
            const rows = value(loop.slice(2, -2), scope)
            for (const [index, item] of rows.entries()) { const copy = node.cloneNode(true); const wrapper = document.createElement('div'); wrapper.append(copy); children(wrapper, { ...scope, item, index }); node.before(...wrapper.childNodes) }
            node.remove(); continue
          }
          const condition = node.getAttribute('wx:if'), alternative = node.getAttribute('wx:elif'), otherwise = node.hasAttribute('wx:else')
          if (condition !== null) { matched = !!value(condition.slice(2, -2), scope); if (!matched) { node.remove(); continue } }
          else if (alternative !== null) { const ok = !matched && !!value(alternative.slice(2, -2), scope); matched = matched || ok; if (!ok) { node.remove(); continue } }
          else if (otherwise) { if (matched) { node.remove(); continue } matched = true }
          else matched = false
          for (const attribute of [...node.attributes]) {
            if (attribute.name.startsWith('wx:')) node.removeAttribute(attribute.name)
            else { let result = interpolate(attribute.value, scope); if (attribute.name === 'src' && result.startsWith('/assets/')) result = base + result; node.setAttribute(attribute.name, result) }
          }
          if (node.hasAttribute('disabled') && node.getAttribute('disabled') === 'false') node.removeAttribute('disabled')
          children(node, scope)
        }
      }
      children(container, scope); document.body.replaceChildren(...container.childNodes)
      }
 })
 const checks=[]
 for(const [label,report] of [['complete',fixture],['recovery',recovery],['empty',empty],['zero',zero],['long-ties',long],['missing-art',fixture]]){
  for(const width of [320,390,430,768]){
   await page.setViewportSize({width,height:844})
   await page.evaluate(({template,css,scope,base,broken})=>{
    renderWxml(template,css,scope,base)
    const bar=document.createElement('div');bar.className='native-bar';bar.textContent='‹　收藏小报';document.body.prepend(bar)
    const style=document.createElement('style');style.textContent='.native-bar{height:56px;display:flex;align-items:center;padding:0 18px;background:#F7F4EF}';document.head.append(style)
    if(broken)document.querySelectorAll('.cover-kitten,.cover-wash,.memory-item img').forEach(i=>i.src=base+'/missing.png')
   },{template,css,scope:{report,edition:presentMonthly(report,icons),reportStyle:pageStyle(width),loading:false,error:'',month:report.month,maxMonth:'2026-10',imageBusy:false,shareFallback:false,imageError:'',coverPath:''},base:pathToFileURL(root).href,broken:label==='missing-art'})
   await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(resolve=>{i.onload=resolve;i.onerror=resolve}))))
   const check=await page.evaluate(()=>{
    const a=document.querySelector('.report-lettering').getBoundingClientRect(),b=document.querySelector('.report-brand').getBoundingClientRect(),copy=document.querySelector('.report-date').getBoundingClientRect(),cat=document.querySelector('.cover-kitten').getBoundingClientRect()
    return {overflow:document.documentElement.scrollWidth>innerWidth,brandOverlap:a.right>b.left,coverOverlap:copy.right>cat.left,failedImages:[...document.images].filter(i=>!i.naturalWidth).length,paperWidth:document.querySelector('.report-paper').getBoundingClientRect().width}
   });checks.push({label,width,...check})
   await page.screenshot({path:path.join(out,label+'-'+width+'.png'),fullPage:true})
  }
  if(label!=='missing-art'){
   for(const cover of [false,true]){
    const png=await page.evaluate(async({report,icons,cover,base})=>{
     const canvas=document.createElement('canvas'),c=canvas.getContext('2d'),layout=modules['report-image'][cover?'planShareCover':'planReport'](c,report,icons)
     canvas.width=layout.width;canvas.height=layout.height
     const images=new Map();await Promise.all([...new Set(layout.commands.filter(c=>c.src).map(c=>c.src))].map(src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>{images.set(src,i);resolve()};i.onerror=reject;i.src=base+src})))
     modules['report-image'].drawLayout(c,layout,images);return canvas.toDataURL('image/png').split(',')[1]
    },{report,icons,cover,base:pathToFileURL(root).href})
    fs.writeFileSync(path.join(out,label+(cover?'-cover':'-export')+'.png'),Buffer.from(png,'base64'))
   }
  }
 }
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2))
 if(checks.some(c=>c.overflow||c.brandOverlap||c.coverOverlap))throw Error('Layout overlap: '+JSON.stringify(checks.filter(c=>c.overflow||c.brandOverlap||c.coverOverlap)))
 console.log(JSON.stringify({layouts:checks.length,posters:10,failedChecks:0}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
