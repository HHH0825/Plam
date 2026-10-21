// Offline layout checks render the actual detail WXML/WXSS with local fixtures.
// This is browser layout evidence, not a substitute for WeChat native screenshots.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const root=path.resolve(__dirname,'../miniprogram'),output=path.resolve(__dirname,'../docs/images/detail-refresh'),scratch=path.resolve(__dirname,'../.qa-detail-refresh')
const source=file=>fs.readFileSync(path.join(root,file),'utf8')
const baseItem={id:4,name:'水杯',category:'日常用品',status:'active',statusText:'使用中',purchase_date:'2026-06-07',purchase_price:'19.90',holding_days:123,dailyPurchase:'¥0.16',dailyNet:'¥0.16',net_cost:'19.90',maintenance_total:'0.00',disposal_proceeds:'0.00',warranty_expires_on:'',notes:'',photo_url:'/items/4/photo',art:'/assets/paper/type-daily.png',icon:'☕',milestones:{next:{label:'相伴一年',date:'2027-06-07',remaining_days:242}},daily_target:null}
const stamp={id:'100',label:'相伴100天',date:'2026-09-15'}
const scope={item:baseItem,loading:false,error:'',photoPath:'',photoLoading:false,photoError:false,photoUnavailable:false,artFailed:false,busy:false,targetBusy:false,stamps:[stamp],allStamps:[stamp],expanded:false,factsExpanded:false,timeline:[],allTimeline:[],timelineExpanded:false,historyUsage:[],historyExpanded:false,targetEditing:false,targetInput:'',targetError:''}
const record={id:1,key:'maintenance-1',kind:'maintenance',kindText:'维修',day:'2026-10-01',text:'更换配件 · ¥10.00'}
async function main(){
fs.mkdirSync(output,{recursive:true});fs.mkdirSync(scratch,{recursive:true})
const html=path.join(scratch,'preview.html');fs.writeFileSync(html,'<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>')
const template=source('pages/item/index.wxml').replace(/<(view|block|input)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/\b(view|block)(?=[\s>])/g,'div').replace(/\btext(?=[\s>])/g,'span').replace(/\bimage(?=[\s>])/g,'img')
const css=['app.wxss','styles/journal.wxss','pages/item/index.wxss'].map(source).join('\n').replace(/@import[^;]+;/g,'').replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span')
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']});const checks=[]
try{const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});await page.goto(pathToFileURL(html).href)
    await page.evaluate(() => {
      window.render = (template, css, scope, base) => {
        document.querySelectorAll('style').forEach(s => s.remove())
        const style = document.createElement('style'); style.textContent = css + '\nbody{margin:0} img{object-fit:contain} button,input{font-family:inherit;border:0} input{background:transparent;outline:none}'; document.head.append(style)
        const container = document.createElement('div'); container.innerHTML = template
        const value = (expression, s) => new Function('scope', 'with(scope){return (' + expression + ')}')(s)
        const interpolate = (text, s) => text.replace(/{{([\s\S]*?)}}/g, (_, e) => String(value(e, s)))
        function children(parent, s) {
          let matched = false
          for (const node of [...parent.childNodes]) {
            if (node.nodeType === 3) { node.textContent = interpolate(node.textContent, s); continue }
            if (node.nodeType !== 1) continue
            const loop = node.getAttribute('wx:for')
            if (loop) {
              node.removeAttribute('wx:for')
              for (const [index, item] of value(loop.slice(2, -2), s).entries()) {
                const wrapper = document.createElement('div'); wrapper.append(node.cloneNode(true)); children(wrapper, { ...s, index, item }); node.before(...wrapper.childNodes)
              }
              node.remove(); continue
            }
            const condition = node.getAttribute('wx:if'), alternative = node.getAttribute('wx:elif'), otherwise = node.hasAttribute('wx:else')
            if (condition !== null) { matched = !!value(condition.slice(2, -2), s); if (!matched) { node.remove(); continue } }
            else if (alternative !== null) { const ok = !matched && !!value(alternative.slice(2, -2), s); matched = matched || ok; if (!ok) { node.remove(); continue } }
            else if (otherwise) { if (matched) { node.remove(); continue } matched = true } else matched = false
            for (const attribute of [...node.attributes]) {
              if (attribute.name.startsWith('wx:')) node.removeAttribute(attribute.name)
              else { let v = interpolate(attribute.value, s); if (attribute.name === 'disabled' && v === 'false') { node.removeAttribute(attribute.name); continue } if (attribute.name === 'src' && v.startsWith('/assets/')) v = base + v; node.setAttribute(attribute.name, v) }
            }
            children(node, s)
          }
        }
        children(container, scope); document.body.replaceChildren(...container.childNodes)
      }
    })

async function capture(width,name,patch={}){
await page.setViewportSize({width,height:844});await page.evaluate(({template,css,scope,base})=>render(template,css,scope,base),{template,css,scope:{...scope,...patch},base:pathToFileURL(root).href})
await page.addStyleTag({content:'img.photo{object-fit:cover} button{cursor:pointer}'});
await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(resolve=>{i.onload=resolve;i.onerror=resolve}))))
const bounds=await page.evaluate(()=>{
const box=s=>document.querySelector(s)?.getBoundingClientRect(),b=box('.detail-page'),photo=box('.detail-hero'),retry=box('.photo-retry');
return {overflow:document.documentElement.scrollWidth>innerWidth,pageWidth:b?.width,minButtonHeight:Math.min(...[...document.querySelectorAll('button')].map(n=>n.getBoundingClientRect().height)),retryOverlap:!!(retry&&photo&&retry.top<photo.bottom),metricFontSizes:[...document.querySelectorAll('.metric-value')].map(n=>getComputedStyle(n).fontSize),recordButtons:document.querySelectorAll('.secondary-actions button').length,failedImages:[...document.images].filter(n=>!n.naturalWidth).length,textureOpacity:getComputedStyle(document.querySelector('.detail-paper')).opacity,textureIntercepts:getComputedStyle(document.querySelector('.detail-texture')).pointerEvents!=='none'};
});checks.push({width,name,...bounds});
if(bounds.overflow||bounds.retryOverlap||bounds.minButtonHeight<44||bounds.failedImages||bounds.pageWidth>480||bounds.textureOpacity!=='0.6'||bounds.textureIntercepts)throw new Error(JSON.stringify(checks.at(-1)));
await page.screenshot({path:path.join(output,name+'-'+width+'.png'),fullPage:true,animations:'disabled'});
}
for(const width of [320,390,430,768]){await capture(width,'photo',{photoPath:'/assets/paper/type-daily.png'});await capture(width,'compact',{item:{...baseItem,photo_url:null}})}
const cases=[
['loading',{photoLoading:true}],['retry',{photoError:true}],['unavailable',{photoUnavailable:true}],
['idle',{item:{...baseItem,status:'idle',statusText:'闲置'}}],
['disposed',{item:{...baseItem,status:'disposed',statusText:'已处置',net_cost:'-500.00',dailyNet:'¥-4.06',milestones:{next:null}}}],
['no-stamps',{stamps:[],allStamps:[]}],['multi-stamps',{stamps:[stamp,{id:'year',label:'相伴一年',date:'2027-06-07'}],allStamps:[stamp,stamp],expanded:true}],
['long-values',{item:{...baseItem,name:'很长的名称与旅行记忆'.repeat(6),purchase_price:'999999999999.99',net_cost:'-999999999999.99',dailyPurchase:'¥999999999999.99',dailyNet:'¥-999999999999.99',notes:'长备注与无空格标识abcdefghijklmnopqrstuvwxyz'.repeat(15)},factsExpanded:true}],
['records',{timeline:Array.from({length:5},(_,i)=>({...record,id:i,key:'maintenance-'+i,text:'很长的维修说明'.repeat(10)+' · ¥100.00'})),allTimeline:Array(5).fill(record),timelineExpanded:true}],
['target-active',{item:{...baseItem,daily_target:{amount:'0.10',status:'active',progress_percent:60,estimated_date:'2026-12-23',remaining_days:76}}}],
['target-reached',{item:{...baseItem,daily_target:{amount:'1.00',status:'reached',progress_percent:100,reached_on:'2026-06-27'}}}],
['target-edit',{targetEditing:true,targetInput:'0.10',targetError:'请填写大于0、最多两位小数的金额'}],
['history',{historyUsage:[{id:1,used_on:'2026-07-01',notes:'保留的历史内容'}],historyExpanded:true}]
];
for(const [name,patch]of cases)await capture(320,name,patch);
fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify(checks,null,2));console.log(JSON.stringify({checks:checks.length,passed:checks.every(x=>!x.overflow&&!x.retryOverlap),widths:[320,390,430,768]}));
}finally{await browser.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
