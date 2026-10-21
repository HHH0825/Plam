// Actual WXML/WXSS with synthetic fixtures; native screenshots are separate evidence.
const fs = require('node:fs'), path = require('node:path'), {pathToFileURL} = require('node:url')
const {chromium} = require('playwright')
const {presentMonthly} = require('../miniprogram/utils/monthly')
const root = path.resolve(__dirname, '../miniprogram')
const output = path.resolve(__dirname, '../docs/images/editor-discovery-refresh')
const scratch = path.resolve(__dirname, '../.qa-editor-discovery-refresh')
const source = file => fs.readFileSync(path.join(root, file), 'utf8')
const report = {month:'2026-10', cutoff_date:'2026-10-08', has_activity:true,
  totals:{purchase_count:0, purchase_total:'0.00', maintenance_total:'0.00', disposal_total:'500.00', cashflow_net:'-500.00'}, purchase_leaders:[], purchases:[], memories:[]}
const monthly = {...report, page:presentMonthly(report)}
const editor = {itemId:0, today:'2026-10-08', loading:false, loadFailed:false, draftReady:true, draftPrompt:false,
  draftWorking:false, draftStatus:'草稿仅保存在本机', error:'', busy:false, focusField:'', versionConflict:false,
  photosUnavailable:false, photoBusy:false, photoLoading:false, photoError:'', photoProgress:-1, hasPhoto:false,
  previewPath:'', photoPath:'', types:['数码','日用','其他'], typeIndex:2, statuses:['使用中','闲置'], statusIndex:0,
  form:{name:'',category:'',purchase_date:'2026-10-08',purchase_price:'',warranty_expires_on:'',notes:'',status:'active'}}
const stats = {total_items:3, net_cost_total:'2905.93', purchase_total:'3305.91', maintenance_total:'100.02', disposal_total:'500.00'}
const cards = [{key:0,kind:'warranty_due',label:'保修提醒',headline:'有一件物品值得留意保修',explanation:'根据你填写的保修到期日整理。',items:[{id:1,name:'旅行相机',icon:'▣'}]},
  {key:1,kind:'manual_idle',label:'闲置物品',headline:'让闲置的物品重新被看见',explanation:'当前状态由你手动记录。',items:[{id:2,name:'蓝牙音箱',icon:'▣'}]}]
const discovery = {stats, cards, monthly, statsLoading:false,cardsLoading:false,monthlyLoading:false,statsError:'',cardsError:'',monthlyError:''}
const templates = {}, styles = {}
for (const name of ['editor','insights']) {
  templates[name] = source(`pages/${name}/index.wxml`)
    .replace(/<(view|block|input|image|textarea|canvas|paper-label)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>')
    .replace(/\b(view|block)(?=[\s>])/g,'div').replace(/\btext(?=[\s>])/g,'span').replace(/\bimage(?=[\s>])/g,'img')
  styles[name] = ['app.wxss','styles/journal.wxss','pages/editor/components/paper-label/index.wxss',`pages/${name}/index.wxss`].map(source).join('\n')
    .replace(/@import[^;]+;/g,'').replace(/(?<![.\w-])page\s*\{/g,'body {')
    .replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w-])image\b/g,'img')
}
async function main() {
  fs.mkdirSync(output,{recursive:true}); fs.mkdirSync(scratch,{recursive:true})
  const html = path.join(scratch,'preview.html'); fs.writeFileSync(html,'<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>')
  const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']})
  const checks = []
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}})
    await page.goto(pathToFileURL(html).href)
    await page.evaluate(() => {
      window.render = (template,css,scope,base,name,tabs) => {
        document.querySelectorAll('style').forEach(n => n.remove())
        const style = document.createElement('style')
        style.textContent = css + '\nbody{margin:0} div,span{box-sizing:border-box} img{object-fit:contain} button,input,textarea{font-family:inherit} button{border:0} picker,paper-label{display:block} canvas{display:none} .native-tabs{display:flex;justify-content:space-around;align-items:center;height:64px;background:#FFFCF7;border-top:1px solid #E7DFD5} .native-tab{display:flex;align-items:center;flex-direction:column;font-size:12px;color:#69564C} .native-tab img{width:28px;height:28px} .native-tab.active{color:#52684C} .native-bar{height:52px;display:flex;align-items:center;justify-content:center;background:#F7F4EF;color:#493B35;font-size:15px;position:relative} .capsule{position:absolute;right:12px;background:#FFFCF7;border:1px solid #E7DFD5;border-radius:24px;padding:3px 12px;font-size:20px}'
        document.head.append(style)
        const container = document.createElement('div'); container.innerHTML = template
        const value = (e,s) => new Function('scope','with(scope){return ('+e+')}')(s)
        const interpolate = (t,s) => t.replace(/{{([\s\S]*?)}}/g,(_,e) => String(value(e,s)))
        function children(parent,s) {
          let matched = false
          for (const node of [...parent.childNodes]) {
            if (node.nodeType === 3) { node.textContent = interpolate(node.textContent,s); continue }
            if (node.nodeType !== 1) continue
            const loop = node.getAttribute('wx:for')
            if (loop) {
              const alias = node.getAttribute('wx:for-item') || 'item', indexAlias = node.getAttribute('wx:for-index') || 'index'
              node.removeAttribute('wx:for')
              for (const [index,item] of value(loop.slice(2,-2),s).entries()) {
                const wrapper = document.createElement('div'); wrapper.append(node.cloneNode(true)); children(wrapper,{...s,[alias]:item,[indexAlias]:index}); node.before(...wrapper.childNodes)
              }
              node.remove(); continue
            }
            const condition = node.getAttribute('wx:if'), alternative = node.getAttribute('wx:elif'), otherwise = node.hasAttribute('wx:else')
            if (condition !== null) { matched = !!value(condition.slice(2,-2),s); if (!matched) {node.remove(); continue} }
            else if (alternative !== null) {const ok = !matched && !!value(alternative.slice(2,-2),s); matched ||= ok; if (!ok) {node.remove(); continue} }
            else if (otherwise) {if (matched) {node.remove(); continue} matched = true} else matched = false
            for (const attribute of [...node.attributes]) {
              if (attribute.name.startsWith('wx:')) node.removeAttribute(attribute.name)
              else {
                let v = interpolate(attribute.value,s)
                if (attribute.name === 'disabled' && v === 'false') {node.removeAttribute(attribute.name); continue}
                if (attribute.name === 'src' && v.startsWith('/assets/')) v = base + v
                node.setAttribute(attribute.name,v)
              }
            }
            if (node.tagName === 'PAPER-LABEL') {
              const art = node.getAttribute('variant'), text = node.getAttribute('text')
              node.innerHTML = `<div class="paper-label label-${art} ${node.getAttribute('fit-width') === 'true' ? 'fit-width' : ''}"><img class="label-art" src="${base}/assets/paper/${art}.png"><span class="label-text"></span></div>`
              node.querySelector('.label-text').textContent = text
            }
            if (node.tagName === 'INPUT') node.value = node.getAttribute('value') || ''
            if (node.tagName === 'TEXTAREA') node.textContent = node.getAttribute('value') || ''
            children(node,s)
          }
        }
        children(container,scope)
        const bar = document.createElement('div'); bar.className = 'native-bar'; bar.textContent = name === 'editor' ? (scope.itemId ? '编辑物品' : '添加物品') : '发现'
        const capsule = document.createElement('span'); capsule.className = 'capsule'; capsule.textContent = '••• ｜ ◉'; bar.append(capsule)
        document.body.replaceChildren(bar,...container.childNodes)
        if (name === 'insights') {
          const nav = document.createElement('div'); nav.className = 'native-tabs'
          tabs.list.forEach((tab,index) => {const item = document.createElement('div'); item.className = 'native-tab' + (index === 1 ? ' active' : ''); const image = new Image(); image.src = base + '/' + (index === 1 ? tab.selectedIconPath : tab.iconPath); item.append(image,document.createTextNode(tab.text)); nav.append(item)})
          document.body.append(nav)
        }
        window.scrollTo(0,0)
      }
    })
    async function capture(name,width,label,patch={}) {
      await page.setViewportSize({width,height:844})
      const scope = {...(name === 'editor' ? editor : discovery),...patch}
      await page.evaluate(({template,css,scope,base,name,tabs}) => render(template,css,scope,base,name,tabs),{template:templates[name],css:styles[name],scope,base:pathToFileURL(root).href,name,tabs:JSON.parse(source('app.json')).tabBar})
      await page.evaluate(() => Promise.all([...document.images].map(i => i.complete ? Promise.resolve() : new Promise(resolve => {i.onload=resolve;i.onerror=resolve}))))
      const measurement = await page.evaluate(() => {
        const b = document.querySelector('.page').getBoundingClientRect(),paper = document.querySelector('.editor-paper,.discovery-paper'), save = document.querySelector('.paper-action')
        const photo = document.querySelector('.photo-choice'), select = document.querySelector('.photo-select')
        const photoBounds = photo?.getBoundingClientRect(), selectBounds = select?.getBoundingClientRect()
        const photoSameRow = !select || (selectBounds.top >= photoBounds.top - 1 && selectBounds.bottom <= photoBounds.bottom + 1 && selectBounds.right <= photoBounds.right + 1)
        return {pageWidth:b.width,overflow:document.documentElement.scrollWidth>innerWidth,minButtonHeight:Math.min(...[...document.querySelectorAll('button')].map(n=>n.getBoundingClientRect().height)),failedImages:[...document.images].filter(i=>!i.naturalWidth).length,
          textureOpacity:getComputedStyle(paper).opacity,textureIntercepts:getComputedStyle(paper.parentElement).pointerEvents!=='none',
          ...(save ? {saveWidth:save.getBoundingClientRect().width,contentWidth:b.width-36,saveArtPointerEvents:getComputedStyle(save.querySelector('paper-label')).pointerEvents,
            photoBeforeFields:document.querySelector('.photo-card').getBoundingClientRect().top<document.querySelector('.form-card').getBoundingClientRect().top,
            photoSameRow,numberTapeCount:document.querySelectorAll('.form-number img').length,pawCount:document.querySelectorAll('.form-paw').length} : {})}
      })
      checks.push({name,width,label,...measurement})
      if (measurement.overflow || measurement.failedImages || measurement.minButtonHeight<44 || measurement.pageWidth>480 || measurement.textureOpacity!=='0.6' || measurement.textureIntercepts || measurement.photoBeforeFields===false || (name==='editor' && label!=='draft' && (Math.abs(measurement.saveWidth-measurement.contentWidth)>1 || measurement.saveArtPointerEvents!=='none' || !measurement.photoSameRow || measurement.numberTapeCount!==3 || measurement.pawCount!==2))) {
        fs.writeFileSync(path.join(scratch,'failed.html'),await page.content()); await page.screenshot({path:path.join(scratch,'failed.png'),fullPage:true}); throw new Error(JSON.stringify(checks.at(-1)))
      }
      await page.screenshot({path:path.join(output,`${name}-${label}-${width}.png`),fullPage:true})
      if (width===390 && label==='default') {
        await page.screenshot({path:path.join(output,`${name}-top.png`)})
        await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
        await page.screenshot({path:path.join(output,`${name}-lower.png`)})
      }
    }
    for (const width of [320,390,430,768]) {
      await capture('editor',width,'default'); await capture('insights',width,'default')
      await capture('insights',width,'large-values',{stats:{...stats,net_cost_total:'-999999999999.99',purchase_total:'999999999999.99'},cards:[{...cards[0],headline:'很长的提醒标题'.repeat(6),explanation:'实际计算依据与长说明'.repeat(12),items:[{id:1,name:'很长的物品名称与无空格标识abcdefghijklmnop'.repeat(4),icon:'▣'}]}]})
    }
    for (const [label,patch] of [
      ['photo',{previewPath:'/assets/paper/type-daily.png',hasPhoto:true}], ['unavailable',{photosUnavailable:true}],
      ['photo-failed',{photoError:'照片暂时读取失败，请重试。',hasPhoto:true}], ['photo-loading',{photoLoading:true}],
      ['photo-upload',{photoProgress:35,busy:true}], ['saving',{busy:true}],
      ['conflict',{versionConflict:true,error:'物品已被其他设备修改，请读取最新内容并核对。'}],
      ['disposed',{itemId:4,form:{...editor.form,name:'水杯',status:'disposed',notes:'长备注与无空格标识abcdefghijklmnopqrstuvwxyz'.repeat(12),purchase_price:'999999999999.99',warranty_expires_on:'2028-01-01'}}],
      ['draft',{draftPrompt:true,draftReady:false,draftName:'旅行相机',draftTime:'10月8日 17:00'}]
    ]) await capture('editor',320,label,patch)
    for (const [label,patch] of [
      ['empty',{cards:[],stats:{...stats,total_items:0,net_cost_total:'0.00',purchase_total:'0.00',maintenance_total:'0.00',disposal_total:'0.00'},monthly:{...monthly,has_activity:false,totals:{...monthly.totals,cashflow_net:'0.00'}}}],
      ['loading',{statsLoading:true,cardsLoading:true,monthlyLoading:true}],
      ['errors',{statsError:'网络暂不可用',cardsError:'分析读取失败',monthlyError:'小报读取失败'}],
      ['memories',{monthly:{...monthly,memories:Array.from({length:4},(_,i)=>({key:i,item_id:i+1,name:'与旅行有关的长名称'.repeat(4),date:'2026-10-08',label:'相伴一年'}))}}],
      ['different-month',{monthly:{...monthly,month:'2026-09',cutoff_date:'2026-09-30',page:{...monthly.page,monthArt:'/assets/report/month-09.png'}}}]
    ]) await capture('insights',320,label,patch)
    fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify(checks,null,2))
    console.log(JSON.stringify({checks:checks.length,passed:true,widths:[320,390,430,768]}))
  } finally { await browser.close() }
}
main().catch(error => {console.error(error);process.exitCode=1})
