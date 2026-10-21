const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const helper=require('./verify-member-tools.cjs'),out=path.resolve(__dirname,'../docs/images/member-release-20261016')
async function main(){
 fs.mkdirSync(out,{recursive:true});const entry=path.join(out,'subscription-preview.html');fs.writeFileSync(entry,'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']})
 const checks=[]
 try{
  const page=await browser.newPage();await page.goto(pathToFileURL(entry).href);await helper.renderer(page)
  for(const platform of ['android','ios']){
   const status=JSON.parse(fs.readFileSync(path.join(out,'membership-'+platform+'.json'),'utf8'))
   const data=await helper.state('membership','free',status)
   assert.deepEqual(data.plans.map(p=>p.price_cents),platform==='ios'?[450,1150,3390]:[390,990,2990])
   for(const width of [320,390,430,768]){
    const audit=await helper.render(page,'membership',data,width,false)
    assert.equal(audit.bodyWidth,width);assert.deepEqual(audit.broken,[]);assert.deepEqual(audit.overflow,[])
    const cards=await page.locator('.member-plan').count();assert.equal(cards,3)
    const prices=await page.locator('.member-plan').allTextContents();assert.equal(prices.some(t=>t.includes(platform==='ios'?'33.9':'29.9')),true)
    await page.screenshot({path:path.join(out,`subscription-${platform}-${width}.png`),fullPage:true})
    checks.push({platform,width,prices:status.plans.map(p=>p.price_cents),passed:true})
   }
  }
  fs.writeFileSync(path.join(out,'subscription-layout-results.json'),JSON.stringify({passed:true,isolated:true,realPayment:false,checks},null,2));console.log('Eight dual-platform price layout checks passed')
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
