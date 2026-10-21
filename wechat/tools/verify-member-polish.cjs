// Offline rendering of actual layouts and export painters, with fixed examples.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const helper=require('./verify-member-tools.cjs'),root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/member-polish-20261016')
const expiry=Date.UTC(2027,0,1)-8*3600000,promo={active:true,ends_at:expiry/1000,label:'初创特惠',ends_text:'特惠至2027.01.01 00:00',description:'猫爪物帐还在起步阶段，感谢你愿意陪它慢慢成长。当前会员采用初创特惠价格，活动截至北京时间2027年1月1日00:00。未来随着用户数量与服务器成本变化，会员售价可能调整，届时会提前说明；已开通会员的权益和有效期按原约定保留。',feedback_message:'目前部分功能和使用体验仍在完善。如果遇到问题，或有想要的功能，请通过“反馈与建议”告诉我。感谢你的理解与支持。'}
async function main(){
 fs.mkdirSync(out,{recursive:true});const entry=path.join(out,'preview.html');fs.writeFileSync(entry,'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']})
 const checks=[],reports=[]
 try{
  const page=await browser.newPage();await page.goto(pathToFileURL(entry).href);await helper.renderer(page)
  for(const name of ['me','membership'])for(const kind of ['free','active','expired'])for(const [width,large]of [[320,false],[390,false],[430,false],[768,false],[320,true]]){
   const data=await helper.state(name,kind,{server_time:Date.UTC(2026,9,16)/1000,promotion:promo,purchase_allowed:kind!=='active',payment_open:false})
   for(const expanded of name==='me'?[false,true]:[false]){
    data.memberToolsExpanded=expanded;const audit=await helper.render(page,name,data,width,large)
    assert.equal(audit.bodyWidth,width,JSON.stringify(audit));assert.deepEqual(audit.broken,[]);assert.deepEqual(audit.overflow,[])
    if(name==='me')assert.equal(audit.tools.length,expanded?4:0)
    if(name==='membership'&&kind==='active'){assert.equal(await page.locator('.member-plan[disabled]').count(),3);assert.equal(await page.locator('.member-purchase button').textContent(),'已拥有')}
    const label=`${name}-${kind}-${width}${large?'-large':''}${expanded?'-expanded':''}`
    await page.screenshot({path:path.join(out,label+'.png'),fullPage:true});checks.push({label,...audit})
   }
  }
  const appearanceData={loading:false,busy:false,mode:'appearance',title:'手账外观',member:{supported:true,active:false},appearance:{theme:'sage',template:'journal',sticker:'cat'},previewColor:'#DDEADD',previewSoft:'#F1F7EF',appearancePreviewTab:'page',appearanceDirty:true,themeOptions:[{id:'default',name:'鹅黄',color:'#FFE15A'},{id:'sage',name:'鼠尾草绿',color:'#DDEADD'},{id:'pink',name:'樱花粉',color:'#F7CDDD'},{id:'blue',name:'雾蓝',color:'#CDE7F6'}],templateOptions:[{id:'default',name:'手绘小报',note:'保留猫咪插画和手绘边框'},{id:'simple',name:'简洁账单',note:'白底清晰分栏，突出账目与图表'},{id:'journal',name:'猫爪手帐',note:'纸张底色、手账横线与猫咪点缀'}],stickers:[{id:'',name:'不使用贴纸',path:''},...require('../miniprogram/utils/member').stickers]}
  for(const name of ['ledger','statistics','member-tools'])for(const[width,large]of [[320,false],[390,false],[430,false],[768,false],[320,true]]){
   const data=name==='member-tools'?appearanceData:{memberSupported:true,memberThemeClass:'member-custom-theme',memberThemeStyle:'--member-accent:#CDE7F6;--member-soft:#F0F8FD;',memberBooks:[{id:'all',name:'旅行和家庭共同使用的超长账本名称'}],memberBookIndex:0,memberBookId:'all',totalBudgetText:'剩余 ¥652.00',month:'2026-10',loading:true}
   const audit=await helper.render(page,name,data,width,large);assert.equal(audit.bodyWidth,width);assert.deepEqual(audit.broken,[])
   if(name!=='member-tools'){
    const boxes=await page.locator('.member-ledger-toolbar').evaluate(n=>[...n.children].map(x=>{const r=x.getBoundingClientRect();return {top:r.top,height:r.height,width:r.width}}))
    assert.equal(boxes.length,3);assert.ok(boxes.every(b=>Math.abs(b.top-boxes[0].top)<1&&b.height>=44&&b.width>0),JSON.stringify(boxes))
   }
   const label=`${name}-${width}${large?'-large':''}`;await page.screenshot({path:path.join(out,label+'.png'),fullPage:true});checks.push({label,...audit})
  }
  // Run the same CommonJS report planners/drawers in an actual browser canvas.
  const sources=Object.fromEntries(fs.readdirSync(path.join(root,'utils')).filter(n=>n.endsWith('.js')).map(n=>['utils/'+n,fs.readFileSync(path.join(root,'utils',n),'utf8')]))
  sources['config.js']=fs.readFileSync(path.join(root,'config.js'),'utf8')
  await page.evaluate(({sources,base})=>{
   const cache={};window.qaRequire=function load(id){if(cache[id])return cache[id].exports;const module=cache[id]={exports:{}};function relative(n){const parts=(id.slice(0,id.lastIndexOf('/')+1)+n).split('/'),out=[];for(const p of parts)if(p==='..')out.pop();else if(p!=='.'&&p)out.push(p);return load(out.join('/')+(n.endsWith('.js')?'':'.js'))}new Function('require','module','exports',sources[id])(relative,module,module.exports);return module.exports}
   window.qaBase=base;window.wx={getSystemInfoSync:()=>({platform:'android'})};window.getApp=()=>({globalData:{token:''}})
  },{sources,base:pathToFileURL(root).href})
  for(const theme of ['default','sage','pink','blue'])for(const template of ['default','simple','journal'])for(const type of ['cash','collection']){
   const result=await page.evaluate(async({theme,template,type})=>{
    const demo=qaRequire('utils/appearance-preview.js'),a={theme,template,sticker:'cat'},canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),engine=qaRequire(type==='cash'?'utils/ledger-report-image.js':'utils/report-image.js')
    const layout=type==='cash'?engine.plan(ctx,demo.cashModel,false,1,a):engine.planReport(ctx,demo.collectionReport,{},a)
    canvas.width=layout.width;canvas.height=layout.height;const images=new Map()
    await Promise.all([...new Set(layout.commands.filter(c=>c.src).map(c=>c.src))].map(src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{images.set(src,img);resolve()};img.onerror=()=>reject(Error('missing '+src));img.src=qaBase+src})))
    if(type==='cash')engine.draw(ctx,layout,Object.fromEntries(images));else engine.drawLayout(ctx,layout,images)
    const bounds=layout.commands.filter(c=>c.kind==='text').filter(c=>{ctx.font=(c.weight||'normal')+' '+c.size+'px sans-serif';const w=Math.max(...(c.lines||[c.text]).map(t=>ctx.measureText(t).width)),left=c.align==='center'?c.x-w/2:c.align==='right'?c.x-w:c.x;return !Number.isFinite(left+c.y+w+c.height)||left<0||left+w>721||c.y+c.height>layout.height+40})
    return {png:canvas.toDataURL('image/png').split(',')[1],bounds,layout}
   },{theme,template,type})
   assert.deepEqual(result.bounds,[]);assert.ok(result.layout.commands.some(c=>c.src==='/assets/stickers/wave.png'))
   const label=`report-${type}-${theme}-${template}`;fs.writeFileSync(path.join(out,label+'.png'),Buffer.from(result.png,'base64'));reports.push({label,height:result.layout.height,commands:result.layout.commands.length})
  }
  const before=await helper.state('membership','free',{server_time:expiry/1000,promotion:{...promo,active:false},plans:[{id:'year',name:'年会员',months:12,price_cents:2990}]})
  await helper.render(page,'membership',before,390,false);assert.equal(await page.locator('.member-promotion-strip').count(),0);assert.ok((await page.locator('.member-price').textContent()).includes('29.9'));checks.push({label:'promotion-end-price-unchanged',passed:true})
  fs.writeFileSync(path.join(out,'layout-results.json'),JSON.stringify({passed:true,checks,reports,isolated:true,remoteWrites:0,realDevice:false},null,2));console.log(JSON.stringify({layoutChecks:checks.length,reportExports:reports.length,passed:true}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
