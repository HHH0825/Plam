// Render actual WXML/WXSS with offline records only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const helper=require('./verify-member-tools.cjs'),root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/discovery-journal-20261018')
const {readCards,readStats}=require('../miniprogram/utils/discovery'),{readMonthly,presentMonthly}=require('../miniprogram/utils/monthly')
const fixture=structuredClone(require('../../test-results/growth-fixture.json').responses),itemFixture=require('../tests/fixtures/item-dashboard.cjs')
fixture['/stats']=itemFixture.stats
fixture['/insights'].analysis_cards=[
 {kind:'warranty_due',label:'保修提醒',headline:'4 件物品将在 30 天内过保。',explanation:'统计今天至第30天（包含到期当天）的未处置物品；未填写保修日期的不参与。',items:[{id:1,name:'陪我记录生活的相机',icon_type:'digital'},{id:2,name:'书桌上的阅读灯',icon_type:'home'},{id:3,name:'随身降噪耳机',icon_type:'digital'},{id:4,name:'周末出游小背包',icon_type:'clothing'}]},
 {kind:'manual_idle',label:'使用复盘',headline:'你手动标记了 2 件闲置物品。',explanation:'依据物品当前状态；这些物品仍计入当前持有资产。',items:[{id:5,name:'还没翻完的旅行手账',icon_type:'books'},{id:6,name:'等着出门的骑行头盔',icon_type:'mobility'}]},
 ...fixture['/insights'].analysis_cards]
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../../test-results/discovery-fixture.json'),JSON.stringify({responses:fixture},null,2))
const monthly=readMonthly(fixture['/reports/monthly']),report={...monthly,page:presentMonthly(monthly)}
const defaults={memberThemeStyle:'',memberThemeClass:'',statsLoading:false,cardsLoading:false,monthlyLoading:false,statsError:'',cardsError:'',monthlyError:'',stats:readStats(fixture['/stats']),cards:readCards(fixture['/insights']),monthly:report,monthlyLayout:{kind:'columns',size:26,height:40,scroll:true},amountSizes:[26,24,22,20],detailsOpen:false,trendOpen:false,trend:fixture['/insights'].months.slice(-6).reverse()}
const read=n=>fs.readFileSync(path.join(root,n),'utf8'),css=n=>read(n).replace(/@import\s+["']([^"']+)["'];/g,(_,p)=>css(path.posix.normalize(path.posix.join(path.posix.dirname(n),p))))
function markup(file){let s=read(file);const templates={};s=s.replace(/<import src="([^"]+)"\s*\/>/g,(_,p)=>{read(path.posix.normalize(path.posix.join(path.posix.dirname(file),p))).replace(/<template name="([^"]+)">([\s\S]*?)<\/template>/g,(_,name,body)=>templates[name]=body);return''});s=s.replace(/<template\b((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,(_,attrs)=>{const name=attrs.match(/is="([^"]+)"/)?.[1];return '<block'+attrs.replace(/\s(?:is|data)="[^"]*"/g,'')+'>'+templates[name]+'</block>'});return s.replace(/<include src="([^"]+)"\s*\/>/g,(_,p)=>markup(path.posix.normalize(path.posix.join(path.posix.dirname(file),p))))}
async function render(p,name,data,width,large=false){
 let text=markup(name+'.wxml').replace(/<cat-(feedback|loading)\b[^>]*\/>/g,'').replace(/<(view|block|image|input|textarea|canvas|paper-background|cash-donut|expense-progress)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/(<\/?)(view|block|text|image|scroll-view)(?=[\s>])/g,(_,pre,t)=>pre+({view:'div',block:'wx-block',text:'span',image:'img','scroll-view':'wx-scroll'}[t]))
 const sheet=(css('app.wxss')+'\n'+css(name+'.wxss')).replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w:-])image\b(?!\/)/g,'img')+'\nwx-scroll{display:block;overflow:auto;max-width:100%} canvas{display:none}'
 await p.setViewportSize({width,height:844});await p.evaluate(args=>render(...args),[text,sheet,data,pathToFileURL(root).href]);if(large)await p.evaluate(()=>{const nodes=[...document.querySelectorAll('.page div,.page span,.page button')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);nodes.forEach(([n,size])=>n.style.fontSize=size*1.3+'px')});await p.evaluate(()=>Promise.all([...document.images].map(n=>n.complete?Promise.resolve():new Promise(r=>{n.onload=r;n.onerror=r}))))
}
async function main(){const html=path.join(out,'preview.html');fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><body>');const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']}),checks=[]
try{const p=await browser.newPage();await p.goto(pathToFileURL(html).href);await helper.renderer(p)
 const expanded=structuredClone(defaults);expanded.cards[0].basisOpen=true;expanded.cards[0].itemsOpen=true;expanded.cards[0].shownItems=expanded.cards[0].items;expanded.detailsOpen=true;expanded.trendOpen=true
 const long=structuredClone(expanded);long.cards[0].headline='这是一条很长的保修提醒，需要在小屏和放大字号下完整呈现，不能遮挡物品名称与查看依据的入口。';long.cards[0].shownItems[0].name='随身携带记录每天小小日常的数码相机与超长中文物品名称';long.stats.net_cost_total='123456789012345.67';long.monthly.page.balance.amount='123456789012345.67';long.monthlyLayout={kind:'stacked',size:20,height:40,scroll:true};long.stats.breakdown[2].text='暂不可用'
 const variants=[['default',defaults],['expanded',expanded],['long',long],['empty',{...defaults,cards:[],stats:readStats(itemFixture.zero),monthly:null,trend:[]}],['loading',{...defaults,cards:[],stats:null,monthly:null,trend:[],statsLoading:true,cardsLoading:true,monthlyLoading:true}],['failure',{...defaults,cardsError:'网络暂时断开，请重试',statsError:'读取失败，请重试',monthlyError:'本月记录暂时无法读取'}],['sage',{...defaults,memberThemeStyle:'--member-soft:#F1F7EF;--primary:#DDEADD;'}]]
 for(const[width,large]of [[320,false],[390,false],[430,false],[768,false],[320,true],[390,true],[430,true],[768,true]])for(const[label,data]of variants){
  await render(p,'pages/insights/index',data,width,large)
  await p.evaluate(()=>{for(const a of document.getAnimations())a.finish()})
  const audit=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,broken:[...document.images].filter(n=>!n.naturalWidth).map(n=>n.src),smallTargets:[...document.querySelectorAll('button')].filter(n=>n.getBoundingClientRect().height<43.5).map(n=>n.className)}))
  assert.ok(!audit.overflow,JSON.stringify({label,width,large,...audit}));assert.deepEqual(audit.broken,[]);assert.deepEqual(audit.smallTargets,[]);checks.push({label,width,large,...audit})
  if((width===390&&!large&&['default','expanded','failure'].includes(label))||(large&&width===320&&label==='long'))await p.screenshot({path:path.join(out,label+'-'+width+(large?'-large':'')+'.png'),fullPage:true})
 }
 await p.emulateMedia({reducedMotion:'reduce'});await render(p,'pages/insights/index',expanded,390);const timing=await p.locator('.finding-basis').evaluate(n=>n.getAnimations()[0].effect.getTiming().duration);assert.equal(timing,80);checks.push({label:'reduced-motion',duration:timing});
 fs.writeFileSync(path.join(out,'layout-results.json'),JSON.stringify({passed:true,checks,fixtureOnly:true,cloudWrites:0,realDevice:false},null,2));console.log(JSON.stringify({passed:true,checks:checks.length}))
}finally{await browser.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
