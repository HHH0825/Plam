// Actual controllers and WXML/WXSS; offline rendering is not a WeChat screenshot.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const helper=require('./verify-member-tools.cjs'),root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/free-tools-20261025')
const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../test-results/free-tools-fixture.json'),'utf8')).responses
async function model(name,mode='books',kind='free'){
 let definition;const file=path.join(root,'pages',name,'index.js'),local=createRequire(file)
 const app={globalData:{token:'isolated-free-tools',user:{id:1}},requireSession:()=>true}
 const status={...structuredClone(fixture['/membership']),supported:true,status:kind,active:kind==='active',expires_at:kind==='active'?1798761600:kind==='expired'?1791907200:null}
 if(kind==='legacy')delete status.free_entitlements
 const notice={module:{exports:{}},getApp:()=>app,wx:{getStorageSync(){},setStorageSync(){}},require:()=>({serviceScope:()=> 'isolated-layout'})};vm.runInNewContext(fs.readFileSync(path.join(root,'pages/membership/lib/member-announcement.js'),'utf8'),notice)
 const api={request:async url=>{const response=fixture[url]||fixture[url.split('?')[0]];if(!response)throw Error('Missing isolated response '+url);return structuredClone(response)}}
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:n=>n.endsWith('/member-announcement')?notice.module.exports:n.endsWith('/member')?{...require('../miniprogram/utils/member'),wrap:d=>d,load:async()=>status}:n.endsWith('/api')?api:n.endsWith('/navigation')?{resetNavigation(){},navigate(){}}:local(n),Page:d=>definition=d,getApp:()=>app,wx:{setNavigationBarTitle(){},getStorageSync(){},setStorageSync(){},disableAlertBeforeUnload(){},showToast(){}},console,setTimeout,clearTimeout})
 const p={...definition,data:structuredClone(definition.data),_visible:true,_seq:1,setData(patch){Object.assign(this.data,patch)}}
 p.onLoad?.({mode,month:'2026-10'});await p.load();assert.ok(!p.data.error,p.data.error)
 return p.data
}
async function main(){
 fs.mkdirSync(out,{recursive:true});const entry=path.join(out,'preview.html');fs.writeFileSync(entry,'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']})
 const checks=[]
 try{
  const p=await browser.newPage();await p.goto(pathToFileURL(entry).href);await helper.renderer(p)
  const variants=[['membership','membership','books','free'],['announcement','membership','books','free'],['membership-active','membership','books','active'],['books-free','member-tools','books','free'],['entries-free','member-tools','books','free'],['budget-free','member-tools','budgets','free'],['budget-expired','member-tools','budgets','expired'],['legacy-service','member-tools','books','legacy'],['comparison','member-benefits','books','free']]
  for(const[label,name,mode,kind]of variants){
   const data=await model(name,mode,kind)
   if(label!=='announcement')data.announcementOpen=false
   if(label==='entries-free'){data.bookTab='entries';data.selectedEntries=[data.entries[0].id];data.entries[0].selected=true}
   for(const[width,large,height]of [[320,false,844],[390,false,844],[430,false,844],[768,false,844],[390,false,568],[320,true,844]]){
    const audit=await helper.render(p,name,data,width,false)
    await p.setViewportSize({width,height})
    if(large)await p.evaluate(()=>{const rows=[...document.querySelectorAll('.page div,.page span,.page button')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);for(const[n,size]of rows)n.style.fontSize=size*1.3+'px'})
    assert.deepEqual(audit.broken,[],label+' missing image')
    const actual=await p.evaluate(()=>({bodyWidth:document.documentElement.scrollWidth,plans:document.querySelectorAll('.member-plan').length,buttons:[...document.querySelectorAll('.book-more,.move-card button')].map(n=>n.disabled),outside:[...document.querySelectorAll('.member-plan,.member-feature,.member-announcement-window,.budget-overview,.book-display,.tools-segments,.benefits-column')].filter(n=>{const r=n.getBoundingClientRect();return r.left<-.5||r.right>innerWidth+1}).map(n=>n.className)}))
    assert.equal(actual.bodyWidth,width,label+' horizontal overflow');assert.deepEqual(actual.outside,[],label+' card overflow')
    if(name==='membership')assert.equal(actual.plans,1)
    if(label==='entries-free')assert.ok(actual.buttons.every(x=>!x))
    const image=label+'-'+width+(large?'-large':height===568?'-short':'')+'.png'
    await p.screenshot({path:path.join(out,image),fullPage:true});checks.push({label,width,large,height,passed:true,...actual})
   }
  }
  fs.writeFileSync(path.join(out,'layout-results.json'),JSON.stringify({passed:true,checks,source:'actual WXML/WXSS and controllers with isolated SQLite API data',nativeRuntime:false,realDeviceTested:false,remoteWrites:0,deployed:false},null,2));console.log(JSON.stringify({passed:true,checks:checks.length}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
