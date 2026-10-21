// Point only at an isolated demo backend. Dummy credentials never authorize a cloud write.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright')
const url=process.argv[2],out=path.resolve(__dirname,'../docs/images/member-release-20261016')
if(!url||new URL(url).hostname!=='127.0.0.1')throw Error('An isolated loopback demo URL is required')
async function main(){
 fs.mkdirSync(out,{recursive:true})
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
 const page=await browser.newPage({viewport:{width:1080,height:850}}),external=[],errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',r=>{if(new URL(r.request().url()).hostname!=='127.0.0.1'){external.push(r.request().url());return r.abort()}return r.continue()})
 const response=async(s,action)=>{const [r]=await Promise.all([page.waitForResponse(x=>new URL(x.url()).pathname===s),action()]);return r.json()}
 try{
  await page.goto(url)
  await page.fill('#env','offline-test-env');await page.fill('#key','isolated-ui-test-no-credentials')
  await response('/connect',()=>page.click('#connect'))
  assert.equal(await page.inputValue('#key'),'')
  await page.fill('#uid','1');await response('/lookup',()=>page.click('#lookup'))
  await page.selectOption('#duration','days');await page.fill('#days','7');await page.fill('#reason','离线验收：赠送7天')
  const preview=await response('/preview',()=>page.click('#preview'))
  assert.ok(preview.after_expires_at>preview.expires_at);await page.locator('#confirmation').waitFor({state:'visible'})
  await page.screenshot({path:path.join(out,'admin-preview.png'),fullPage:true})
  const granted=await response('/apply',()=>page.click('#apply'))
  assert.equal(granted.gifts.length,1);assert.equal(granted.gifts[0].days,7)
  await page.locator('#gifts .gift').waitFor();await page.screenshot({path:path.join(out,'admin-granted.png'),fullPage:true})
  const repeated=await page.evaluate(async operation=>{const r=await fetch('/apply',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({operation})});return r.json()},preview.operation)
  assert.equal(repeated.gifts.length,1);assert.equal(repeated.expires_at,granted.expires_at)
  await page.fill('#reason','离线验收：撤销指定赠送')
  await response('/preview',()=>page.getByRole('button',{name:'预览撤销',exact:true}).click())
  const revoked=await response('/apply',()=>page.click('#apply'))
  assert.equal(revoked.expires_at,0);assert.ok(revoked.gifts[0].revoked_at)
  await page.getByText(/已撤销/).waitFor();await page.screenshot({path:path.join(out,'admin-revoked.png'),fullPage:true})
  assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);assert.deepEqual(external,[]);assert.deepEqual(errors,[])
  fs.writeFileSync(path.join(out,'admin-ui-results.json'),JSON.stringify({passed:true,isolated:true,realCloudWrites:0,realPayments:0,checks:['credentials cleared','lookup by ID','preview before write','grant seven days','same request replays once','revoke only selected gift','no browser storage','no external requests','no page errors']},null,2))
  console.log('Maintainer UI: nine checks passed with isolated data')
 }finally{try{await page.click('#close')}catch(_){}await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
