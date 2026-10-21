// Actual WXML/WXSS and local assets; no account or network access.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../../test-results/code-quality/layout'),helper=require('./verify-member-tools.cjs')
const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../test-results/growth-fixture.json'),'utf8')).responses
function data(name,width){let d;const file=path.join(root,'pages',name,'index.js');vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:createRequire(file),Page:p=>d=p.data,wx:{},getApp:()=>({globalData:{},hasSession:()=>false})});d=structuredClone(d);Object.assign(d,{loading:false,error:'',busy:false})
 if(name==='login')Object.assign(d,require('../miniprogram/pages/login/lib/layout').welcomeLayout({windowWidth:width,windowHeight:844}),{devLogin:false})
 if(name==='member-benefits')Object.assign(d,{catalogLoading:false,catalogError:'',serviceExpanded:true,service:require('../miniprogram/pages/member-benefits/lib/member-benefits').service(fixture['/membership'])})
 if(name==='member-tools')Object.assign(d,{member:{active:true,supported:true},mode:'books',bookSheetOpen:true,bookForm:{name:'装满小小喜欢的生活收藏册',cover:'travel',archived:false},bookPreview:{name:'装满小小喜欢的生活收藏册',coverName:'旅行手记',coverPath:d.covers[1].path}})
 if(name==='membership')Object.assign(d,{membership:fixture['/membership'],feedbackMessage:'感谢你愿意陪猫爪慢慢成长。',selected:'month',announcementOpen:false})
 if(name==='rewards')Object.assign(d,{model:fixture['/rewards'],growthOpen:false,exchangeOpen:false})
 return d
}
async function main(){fs.mkdirSync(out,{recursive:true});const entry=path.join(out,'preview.html');fs.writeFileSync(entry,'<!doctype html><meta charset="utf-8"><body></body>');const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']});const checks=[]
 try{const page=await browser.newPage();await page.goto(pathToFileURL(entry).href);await helper.renderer(page)
  for(const name of ['login','member-benefits','member-tools','membership','rewards'])for(const width of [320,390,430,768])for(const large of [false,true]){
   const r=await helper.render(page,name,data(name,width),width,large);assert.ok(r.bodyWidth<=width+1,JSON.stringify({name,width,large,...r}));assert.deepEqual(r.broken,[],name)
   const sizes=await page.evaluate(()=>[...document.querySelectorAll('.login-button,.benefits-service-toggle,.sheet-close,.book-cover-option')].map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));assert.ok(sizes.every(r=>r.w>=44&&r.h>=44),JSON.stringify({name,width,large,sizes}))
   checks.push({name,width,large,passed:true,broken:r.broken});await page.screenshot({path:path.join(out,name+'-'+width+(large?'-large':'')+'.png'),fullPage:true})
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,cases:checks.length,fixtureOnly:true,checks},null,2));console.log('Passed '+checks.length+' actual-template layout cases')
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
