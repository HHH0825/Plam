// Export the editable vector as a small transparent local runtime asset.
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright')
async function main(){
 const svg=fs.readFileSync(path.resolve(__dirname,'../branding/me-overview-20261011/settings.svg'),'utf8')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
 try{const page=await browser.newPage({viewport:{width:96,height:96}});await page.setContent('<style>body{margin:0;background:transparent}svg{width:96px;height:96px;display:block}</style>'+svg);await page.screenshot({path:path.resolve(__dirname,'../miniprogram/assets/white-doodle/compact-settings.png'),omitBackground:true})}finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
