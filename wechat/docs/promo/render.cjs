// Documentation artwork only. Reads current UI source; never calls an API or real account.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const {createRequire} = require('node:module')
const {pathToFileURL} = require('node:url')
const {chromium} = require('playwright')
const here = __dirname, wechat = path.resolve(here, '../..'), root = path.join(wechat, 'miniprogram')
const scratch = path.resolve(wechat, '../test-results/readme-promo')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const font = 'Microsoft YaHei, PingFang SC, sans-serif'
const logo = fs.readFileSync(path.resolve(wechat, '../static/images/palm-logo.svg'), 'utf8')
  .replace(/<svg[^>]*>/, '<svg x="64" y="52" width="88" height="88" viewBox="0 0 64 64">')
const hero = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="560" viewBox="0 0 1200 560">
<rect width="1200" height="560" rx="32" fill="#fffaf2"/>
<rect x="1" y="1" width="1198" height="558" rx="31" fill="none" stroke="#e9dfcd" stroke-width="2"/>
<circle cx="978" cy="278" r="212" fill="#fff1bd"/>
<circle cx="1105" cy="88" r="10" fill="#e9c5cc"/><circle cx="630" cy="448" r="7" fill="#f3d369"/>
${logo}
<g font-family="${font}" fill="#294a3e">
<text x="174" y="106" font-size="59" font-weight="700">PALM</text>
<text x="177" y="139" font-size="22" fill="#7c8273">物物记 × 猫爪物账</text>
<text x="66" y="248" font-size="52" font-weight="700">物品有陪伴，</text>
<text x="66" y="320" font-size="52" font-weight="700">生活有记录。</text>
<text x="68" y="376" font-size="25" fill="#7d786d">管理喜欢的物品，记录生活的花费。</text>
<rect x="68" y="429" width="229" height="58" rx="19" fill="#e9eee3"/>
<text x="182" y="466" text-anchor="middle" font-size="22">PALM · 本地网页版</text>
<rect x="312" y="429" width="282" height="58" rx="19" fill="#ffe9a0"/>
<text x="453" y="466" text-anchor="middle" font-size="22">猫爪物账 · 微信小程序</text>
</g>
<image x="658" y="143" width="500" height="327" xlink:href="../../miniprogram/pages/login/assets/hero.png"/>
</svg>`
const search = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="280" viewBox="0 0 1200 280">
<rect width="1200" height="280" rx="24" fill="#fffdf8"/>
<g font-family="${font}" fill="#2c2c2c">
<text x="600" y="55" font-size="28" text-anchor="middle">打开微信，在「搜一搜」输入</text>
<rect x="56" y="88" width="1088" height="112" rx="11.2" fill="#07c160"/>
<image x="90" y="118" width="292" height="51.79" xlink:href="wechat-search-white.png"/>
<rect x="425" y="110" width="372" height="68" rx="13.6" fill="#fff"/>
<circle cx="457" cy="140" r="14" stroke="#7f7f7f" fill="none" stroke-width="4"/>
<path d="m467 151 12 12" fill="none" stroke="#7f7f7f" stroke-width="4" stroke-linecap="round"/>
<text x="505" y="159" font-size="44">猫爪物账</text>
<text x="967" y="157" text-anchor="middle" fill="#fff" font-size="34">开始记录</text>
<text x="600" y="250" text-anchor="middle" font-size="27" fill="#7c7567">物品管理 · 日均成本 · 日常记账</text>
</g></svg>`

function css(file) {
  return read(file).replace(/@import\s+["']([^"']+)["'];/g, (_, p) => css(path.posix.normalize(path.posix.join(path.posix.dirname(file), p))))
}
function markup(file) {
  return read(file).replace(/<include src="([^"]+)"\s*\/>/g, (_, p) => markup(path.posix.normalize(path.posix.join(path.posix.dirname(file), p))))
}
function definition(name) {
  let def
  const file = path.join(root, 'pages', name, 'index.js')
  vm.runInNewContext(read('pages/' + name + '/index.js'), {require:createRequire(file), Page:d=>def=d, wx:{}, getApp:()=>({globalData:{}})})
  return structuredClone(def.data)
}
function state(name) {
  const calendar = require('../../miniprogram/utils/ledger-calendar')
  const ledger = require('../../miniprogram/utils/ledger')
  const analytics = require('../../miniprogram/utils/ledger-analytics')
  const fixture = require('../../tests/fixtures/cash-redesign.cjs')
  const cash = analytics.present(analytics.snapshot(fixture.stats, '2026-10', '2026-10-14'))
  const data = {...definition(name), loading:false, refreshing:false, error:'', busy:false,
    month:'2026-10', maxMonth:'2026-10', monthLabel:calendar.monthLabel('2026-10'), enabled:true,
    supported:true, summary:cash.summary, canNext:false, memberBooksState:'unsupported',
    accountToolsHint:'全部账本', accountToolsExpanded:false, panelLayout:{mainSize:44,smallSize:24,stacked:false}}
  const entries = ledger.groups([
    {id:'demo-food',occurred_on:'2026-10-14',amount:'28.00',category:'food',category_name:'餐饮',name:'午餐',source_name:'手动记账',kind:'expense',created_at:'2026-10-14T04:10:00Z'},
    {id:'demo-transit',occurred_on:'2026-10-14',amount:'12.00',category:'transport',category_name:'交通',name:'地铁出行',source_name:'手动记账',kind:'expense',created_at:'2026-10-14T01:00:00Z'},
  ], {'2026-10-14':fixture.stats.days[13]})
  if(name==='items') {
    const {decorate} = require('../../miniprogram/utils/view')
    const rows = [
      {id:1,name:'陪我旅行的相机',category:'数码',cover_icon_key:'camera',holding_days:365,daily_net_cost:'1.28',purchase_price:'1280.00'},
      {id:2,name:'每天都在用的水杯',category:'日用',cover_icon_key:'cup',holding_days:126,daily_net_cost:'0.16',purchase_price:'19.90'},
      {id:3,name:'周末的帆布包',category:'出行',cover_icon_key:'backpack',holding_days:90,daily_net_cost:'0.98',purchase_price:'88.00'},
    ].map(row=>decorate({...row,status:'active',icon_type:'daily',cover_mode:'icon'}))
    Object.assign(data,{items:rows,shown:rows,entryBlocked:false,announcementOpen:false,metricLayouts:Object.fromEntries(rows.map(r=>[r.id,{kind:'columns',size:24,height:39}]))})
  }
  if(name==='ledger') Object.assign(data,{groups:entries,nextOffset:null})
  if(name==='statistics') Object.assign(data,{view:'cash',cashAnalysis:cash,cashReportMonth:10,days:fixture.stats.days,
    calendarCells:calendar.cells('2026-10',fixture.stats.days,'2026-10-14','2026-10-14'), selectedDate:'2026-10-14',
    selectedLabel:calendar.dayLabel('2026-10-14'),selectedDay:calendar.exactDay(fixture.stats.days,'2026-10-14'),dayEntries:entries[0].entries,dayNextOffset:null})
  return data
}
async function screens(browser) {
  const context = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2})
  const page = await context.newPage()
  await page.route('**/*',route=> /^(file:|data:)/.test(route.request().url())?route.continue():route.abort())
  const preview = path.join(scratch, 'blank.html')
  fs.writeFileSync(preview, '<!doctype html><meta charset="utf-8"><body>')
  await page.goto(pathToFileURL(preview).href)
  const helper = fs.readFileSync(path.join(wechat, 'tools/verify-dots-glass.cjs'), 'utf8')
  const start=helper.indexOf(' await page.evaluate(()=>{window.render='),end=helper.indexOf('\n await require(',start)
  await new Function('page','return(async()=>{'+helper.slice(start,end).replace('val(s,loop.slice(2,-2)).entries()','(val(s,loop.slice(2,-2))||[]).entries()')+'})()')(page)
  await require('../../tools/white-nav-preview.cjs')(page,root)
  await page.evaluate(()=>{window.memberThemeStyle='';window.memberThemeClass='';window.tabMotionRoute='';window.motionReduced=true})
  const base=pathToFileURL(root).href, checks=[]
  for(const name of ['items','ledger','statistics']) {
    let template=markup('pages/'+name+'/index.wxml')
    const templates={}
    read('templates/ledger.wxml').replace(/<template name="([^"]+)">([\s\S]*?)<\/template>/g,(_,n,b)=>templates[n]=b)
    template=template.replace(/<import[^>]+\/>/g,'').replace(/<template([^>]*?)is="([^"]+)"[^>]*?\/>/g,(_,attrs,n)=>'<block'+attrs+'>'+templates[n]+'</block>')
      .replace(/<cash-donut[^>]*\/>/g,'')
      .replace(/<(view|block|image|input|canvas|switch|cat-feedback)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>')
      .replace(/(<\/?)(scroll-view|view|picker|block|text|image)(?=[\s>])/g,(_,pre,tag)=>pre+({'scroll-view':'wx-scroll',view:'div',picker:'div',block:'wx-block',text:'span',image:'img'}[tag]))
    const styles=(css('app.wxss')+'\n'+css('pages/'+name+'/index.wxss'))
      .replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div')
      .replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w:-])image\b(?!\/)/g,'img')
      .replace(/\bscroll-view\b/g,'wx-scroll')+'\nwx-scroll{display:block;overflow-x:auto;min-width:0;max-width:100%}'
    await page.evaluate(args=>render(...args),[template,styles,state(name),base])
    await page.evaluate(({name,base})=>{
      const bar=document.createElement('div');bar.className='native-bar';bar.textContent='猫爪物账';document.body.prepend(bar)
      mountWhiteNav('pages/'+name+'/index',base)
    },{name,base})
    await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))
    const check=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,broken:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src)}))
    if(check.overflow||check.broken.length)throw Error(name+': '+JSON.stringify(check))
    await page.screenshot({path:path.join(here,name+'.png')})
    checks.push({name,...check})
  }
  await context.close()
  return checks
}
async function main() {
  fs.mkdirSync(scratch,{recursive:true})
  fs.writeFileSync(path.join(here,'hero.svg'),hero)
  fs.writeFileSync(path.join(here,'wechat-search.svg'),search)
  const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']})
  try {
    const page=await browser.newPage({deviceScaleFactor:1})
    for(const [name,width,height]of [['hero',1200,560],['wechat-search',1200,280]]) {
      await page.setViewportSize({width,height})
      await page.goto(pathToFileURL(path.join(here,name+'.svg')).href)
      await page.evaluate(()=>document.fonts.ready)
      await page.locator('svg').first().screenshot({path:path.join(here,name+'.png')})
    }
    const checks=await screens(browser)
    fs.writeFileSync(path.join(scratch,'render-checks.json'),JSON.stringify({fixtureOnly:true,remoteRequests:0,renderer:'Current WXML/WXSS rendered in Edge; illustrative, not device screenshots',checks},null,2))
    console.log(JSON.stringify({passed:true,checks}))
  } finally {await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
