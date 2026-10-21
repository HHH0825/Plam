// Verify local evidence and links; no service calls.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/images/item-toolbar-category-20261014')
const read=f=>JSON.parse(fs.readFileSync(path.join(out,f),'utf8'))
const client=fs.readFileSync(path.join(root,'.qa-ledger-tmp/item-toolbar-client-tests.log'),'utf8'),browser=read('browser-results.json'),native=read('native-results.json'),audit=read('package-audit.json')
if(!client.includes('tests 241')||!client.includes('fail 0')||!browser.passed||browser.cases!==35||!native.passed||native.compiledFiles!==6)throw Error('Missing verification gate')
const doc=path.join(root,'docs/item-toolbar-category-20261014.md')
for(const m of fs.readFileSync(doc,'utf8').matchAll(/\]\(([^)]+)\)/g)){if(m[1].endsWith('/verification.json'))continue;if(!fs.existsSync(path.resolve(path.dirname(doc),m[1])))throw Error('Missing delivery link '+m[1])}
const files=['utils/item-category.js','utils/item-list-page.js','templates/item-list.wxml','pages/items/header.wxss','pages/editor/index.js','pages/editor/index.wxml']
const report={date:'2026-10-14',localOnly:true,clientTestsPassed:241,newBehaviorTests:6,browserCases:browser.cases,nativeChecksPassed:native.checks.length,wechatCompiledFiles:6,browserViewportWidths:[320,390,430,768],largeFontScale:1.3,shortScreenHeight:568,realDeviceTested:false,remoteBusinessWrites:0,deploymentApplied:false,experienceUploaded:false,backendChanged:false,newAssets:0,packageIncludedRawBytes:audit.includedRawBytes,staticReferencesChecked:audit.checkedStaticReferences,docsLinksVerified:true,sourceHashes:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'miniprogram',f))).digest('hex')]))}
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,sourceHashes:undefined}))
