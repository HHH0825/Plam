// Check the rendered title/icon group, using actual source or delivery WXML/WXSS.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const root=path.resolve(process.argv[2]||path.join(__dirname,'../miniprogram')),out=path.resolve(process.argv[3]||path.join(__dirname,'../../test-results/login-brand/source'))
process.env.PALM_VISUAL_ROOT=root
const helper=require('./verify-member-tools.cjs'),{welcomeLayout}=require(path.join(root,'pages/login/lib/layout.js'))
async function main(){
 fs.mkdirSync(out,{recursive:true});const entry=path.join(out,'preview.html');fs.writeFileSync(entry,'<!doctype html><meta charset="utf-8"><body></body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']});const checks=[]
 try{const page=await browser.newPage();await page.goto(pathToFileURL(entry).href);await helper.renderer(page)
  for(const width of [320,360,375,390,393,414,430,600,768])for(const fontScale of [1,1.3,1.6,2])for(const logoFailed of [false,true]){
   await helper.render(page,'login',{...welcomeLayout({windowWidth:width,windowHeight:844}),devLogin:false,busy:false,error:'',logoFailed,titleFailed:false,heroFailed:false,cameraFailed:false,foodFailed:false,featureFailed:false,decorFailed:false},width,false)
   if(fontScale!==1)await page.evaluate(scale=>{const nodes=[...document.querySelectorAll('.page div,.page span,.page button')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);for(const[n,size]of nodes)n.style.fontSize=size*scale+'px'},fontScale)
   const geometry=await page.evaluate(()=>{
    const mark=document.querySelector('.brand-mark').getBoundingClientRect(),name=document.querySelector('.brand-name').getBoundingClientRect();
    return{groupCenter:(mark.left+name.right)/2,viewportCenter:innerWidth/2,verticalDelta:(mark.top+mark.height/2)-(name.top+name.height/2),left:mark.left,right:name.right,fontSize:parseFloat(getComputedStyle(document.querySelector('.brand-name')).fontSize),title:document.querySelector('.brand-name').textContent,tagRemoved:!document.body.textContent.includes('小猫的生活手账')}
   })
   assert.ok(Math.abs(geometry.groupCenter-geometry.viewportCenter)<=.6,JSON.stringify({width,fontScale,logoFailed,...geometry}));assert.ok(Math.abs(geometry.verticalDelta)<=.6)
   assert.ok(geometry.left>=0&&geometry.right<=width+.5);assert.equal(geometry.tagRemoved,true);assert.equal(geometry.title,'猫爪物帐')
   checks.push({width,fontScale,logoFailed,passed:true,...geometry})
   if(!logoFailed&&([320,390,430,768].includes(width)&&fontScale===1||width===390&&fontScale===1.3))await page.screenshot({path:path.join(out,`login-${width}-${fontScale}.png`),fullPage:true})
   if(width===390&&fontScale===1&&!logoFailed)await page.locator('.brand').screenshot({path:path.join(out,'brand-390.png')})
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,project:root,cases:checks.length,realDevice:false,checks},null,2));console.log('Passed '+checks.length+' title/icon centering and font-size cases')
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
