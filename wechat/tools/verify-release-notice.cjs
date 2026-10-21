const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const {render}=require('./verify-rewards.cjs'),helper=require('./verify-member-tools.cjs'),notice=require('../miniprogram/utils/release-notice-content'),out=path.resolve(__dirname,process.env.RELEASE_NOTICE_OUTPUT||'../docs/images/release-notice-20261018')
async function main(){
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'preview.html'),'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']}),checks=[]
 try{
  const p=await browser.newPage();await p.goto(pathToFileURL(path.join(out,'preview.html')).href);await helper.renderer(p)
  const base={isArchive:false,items:[],shown:[],loading:false,error:'',query:'',status:'',category:'',filterOpen:false,sortIndex:0,sortOptions:['最近添加'],sortLabels:['最近添加'],entryIconErrors:{},photoStates:{},updateNotice:notice,updateNoticeUnread:true,announcementOpen:false,announcementClosing:false,announcementBusy:false,announcementFading:false,announcementFlightStyle:'',announcementPulse:false,memberThemeStyle:'',memberThemeClass:''}
  for(const [width,large] of [[320,false],[390,false],[430,false],[768,false],[320,true],[390,true]]){
   for(const state of ['unread','read','open','long','icon-error']){
    const data={...base,updateNoticeUnread:state==='unread',announcementOpen:['open','long'].includes(state),updateNoticeIconError:state==='icon-error',updateNotice:state==='long'?{...notice,paragraphs:Array.from({length:8},()=>notice.paragraphs.join(''))}:notice}
    await render(p,'pages/items/index',data,width,large);await p.evaluate(()=>scrollTo(0,0))
    const r=await p.evaluate(()=>{const icon=document.querySelector('.item-update-entry'),title=document.querySelector('.heading-title>.title'),label=document.querySelector('.collection-eyebrow-label'),cat=document.querySelector('.held-kitten'),d=document.querySelector('.member-announcement-window');return {width:innerWidth,body:document.documentElement.scrollWidth,broken:[...document.images].filter(n=>!n.naturalWidth).map(n=>n.src),icon:icon.getBoundingClientRect().toJSON(),title:title.getBoundingClientRect().toJSON(),label:label.getBoundingClientRect().toJSON(),cat:cat.getBoundingClientRect().toJSON(),dialog:d?.getBoundingClientRect().toJSON(),close:document.querySelector('.member-announcement-close')?.getBoundingClientRect().toJSON(),scroll:document.querySelector('.member-announcement-scroll')?.clientHeight}})
    const name=`items-${state}-${width}${large?'-large':''}`;assert.ok(r.body<=r.width+1,name);assert.deepEqual(r.broken,[],name);assert.ok(r.icon.width>=44&&r.icon.height>=44,name);assert.ok(r.icon.right<=r.cat.left+2,name+JSON.stringify(r));assert.ok(r.icon.left>=r.label.right-1,name);assert.ok(r.icon.top<=r.label.top&&r.icon.bottom>=r.label.bottom,name);assert.ok(r.icon.bottom<=r.title.top+1,name)
    assert.equal(await p.locator('.update-unread').count(),state==='unread'?1:0)
    if(r.dialog){assert.ok(r.close.height>=44&&r.close.bottom<=r.dialog.bottom&&r.dialog.height<=844*.82+1);assert.ok(r.scroll>80)}
    checks.push({name,...r});await p.screenshot({path:path.join(out,name+'.png')})
   }
  }
  await render(p,'pages/disposed/index',{...base,isArchive:true},390,false);assert.equal(await p.locator('.item-update-entry').count(),0);checks.push({name:'archive-has-no-release-entry',passed:true})
  const me=await helper.state('me','active');await helper.render(p,'me',me,390,false);assert.equal(await p.locator('#menu-support').count(),0);assert.equal(await p.locator('#menu-feedback').count(),1);await p.screenshot({path:path.join(out,'me-390.png'),fullPage:true});checks.push({name:'me-feedback-remains-support-removed',passed:true})
  const membership=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../test-results/growth-fixture.json'),'utf8')).responses['/membership'];const member={loading:false,error:'',membership,announcementOpen:true,feedbackMessage:membership.promotion.feedback_message,plans:[],features:[],selected:'month',memberThemeStyle:'',memberThemeClass:''};await render(p,'pages/membership/index',member,390,false);await p.screenshot({path:path.join(out,'member-announcement-390.png')});assert.ok((await p.locator('.member-announcement-close').boundingBox()).height>=44);checks.push({name:'membership-notice-regression',passed:true})
  fs.writeFileSync(path.join(out,'layout-results.json'),JSON.stringify({passed:true,checks,fixtureOnly:true,cloudWrites:0,realDevice:false},null,2));console.log(JSON.stringify({passed:true,checks:checks.length}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
