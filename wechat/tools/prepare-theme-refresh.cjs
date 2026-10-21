// Approved artwork only. Do not regenerate the former geometric cats.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp')
const source=path.resolve(__dirname,'../branding/theme-refresh-20261014'),app=path.resolve(__dirname,'../miniprogram'),old=path.resolve(__dirname,'../branding/login-collection-20261011')
const svg=body=>`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><g stroke="#302E29" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`
const shapes={
 wallet:svg('<path d="M13 17L39 9Q43 8 43 13V22" fill="#FFF9D9"/><rect x="10" y="18" width="44" height="35" rx="8" fill="#FFFCED"/><path d="M12 23Q28 27 51 22" fill="none"/><path d="M44 34H56V44H44Q38 39 44 34Z" fill="#FFE580"/><circle cx="46" cy="39" r="1.6" fill="#302E29" stroke="none"/>'),
 box:svg('<path d="M12 21L32 11L52 21V47Q52 51 47 53L32 59L17 53Q12 51 12 47Z" fill="#FFFCF2"/><path d="M12 21L32 31L52 21M32 31V58M24 21L33 17L41 21L32 25Z" fill="none"/>'),
 'welcome-box':svg('<path d="M9 20L30 9L53 20V49L32 58L9 48Z" fill="#FFE478"/><path d="M9 20L31 31L53 20M31 31V57" fill="none"/><g stroke="none" fill="#FFA8B7"><ellipse cx="40" cy="38" rx="2" ry="3"/><ellipse cx="46" cy="36" rx="2" ry="3"/><ellipse cx="50" cy="41" rx="2" ry="3"/><path d="M40 47Q37 42 43 40Q47 39 50 45Q50 49 46 48Q42 51 40 47Z"/></g>'),
 'welcome-statistics':svg('<circle cx="32" cy="33" r="23" fill="#FFFDF5"/><path d="M32 10V33L52 45Q66 21 32 10Z" fill="#FFE060"/><path d="M32 33L52 45Q45 57 31 56L32 33Z" fill="#F5D3C4"/>'),
 'welcome-food':svg('<path d="M10 32Q11 58 32 58Q52 58 55 32Z" fill="#FFFDF4"/><ellipse cx="32" cy="32" rx="23" ry="9" fill="#FFE7A3"/><path d="M13 29Q17 19 23 24Q28 15 35 22Q42 16 48 27" fill="#FFFDF4"/><path d="M37 27L48 6Q51 2 54 5L43 29M44 29L58 14Q62 10 63 14L49 31" fill="#E7BE82"/><path d="M21 38Q31 43 44 37" fill="none" stroke="#E7BE82"/><circle cx="24" cy="28" r="1.8" fill="#F4B6C1" stroke="none"/><circle cx="33" cy="25" r="1.8" fill="#EBC85B" stroke="none"/>')
}
async function vector(name,body,dest){
 if(name.startsWith('switch-'))body=body.replace('viewBox="0 0 64 64"',name==='switch-wallet'?'viewBox="6 6 52 52"':'viewBox="7 7 50 54"')
 if(name==='welcome-statistics')body=body.replace('viewBox="0 0 64 64"','viewBox="6 7 52 52"')
 if(name==='welcome-box')body=body.replace('viewBox="0 0 64 64"','viewBox="6 6 50 55"')
 fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(path.join(source,name+'.svg'),body)
 await sharp(Buffer.from(body)).resize(192).png({palette:true,colours:64,effort:10}).toFile(dest)
}
async function cutout(name,side,dest){
 const input=path.join(source,name+'-source.png'),meta=await sharp(input).metadata()
 if(!meta.hasAlpha)throw Error('Expected transparent approved artwork: '+name)
 await sharp(input).trim({threshold:12}).resize({width:side,height:side,fit:'inside',withoutEnlargement:true}).png({palette:true,colours:name==='title'?16:96,quality:90,effort:10,dither:0}).toFile(dest)
}
function manifest(name,dir,limit){
 const assets=fs.readdirSync(dir).filter(n=>n.endsWith('.png')||n.endsWith('.webp')||n.endsWith('.wxss')).map(n=>({name:n,bytes:fs.statSync(path.join(dir,n)).size})),bytes=assets.reduce((n,r)=>n+r.bytes,0)
 if(bytes>limit)throw Error(name+' asset budget exceeded: '+bytes)
 fs.writeFileSync(path.join(source,name+'-manifest.json'),JSON.stringify({bytes,limit,assets},null,2));return bytes
}
async function prepareSwitch(){
 const dir=path.join(app,'assets/theme-refresh');fs.mkdirSync(dir,{recursive:true})
 for(const name of ['wallet','box'])await vector('switch-'+name,shapes[name],path.join(dir,name+'.png'))
}
async function prepareWelcome(){
 const dir=path.join(app,'pages/login/assets');fs.mkdirSync(dir,{recursive:true})
 const names=['notebook','camera','paw','peek-paw','strokes','frame-corner-tl','frame-corner-tr','frame-corner-bl','frame-corner-br','frame-edge-top','frame-edge-bottom','frame-edge-left','frame-edge-right']
 for(const name of names){const body=fs.readFileSync(path.join(old,name+'.svg'),'utf8');fs.writeFileSync(path.join(source,'welcome-'+name+'.svg'),body);if(!fs.existsSync(path.join(dir,name+'.png'))){const m=await sharp(Buffer.from(body)).metadata();await sharp(Buffer.from(body)).resize(m.width*3,m.height*3).png({palette:true,colours:96,effort:10}).toFile(path.join(dir,name+'.png'))}}
 for(const [name,key]of [['food','welcome-food'],['box','welcome-box'],['statistics','welcome-statistics']])if(!fs.existsSync(path.join(dir,name+'.png')))await vector(key,shapes[key],path.join(dir,name+'.png'))
 await require('./prepare-quality-hero.cjs')();if(!fs.existsSync(path.join(dir,'title.png')))await cutout('title',900,path.join(dir,'title.png'))
 for(const name of ['wishlist','subscription','ring']){const file=path.join(dir,name+'.png');if(fs.existsSync(file))fs.unlinkSync(file)}
 const frames=names.filter(n=>n.startsWith('frame-')).map(n=>`.welcome .sketch-frame .${n.slice(6)}{background-image:url('data:image/png;base64,${fs.readFileSync(path.join(dir,n+'.png')).toString('base64')}');}`).join('\n')+'\n'
 fs.writeFileSync(path.join(dir,'frame.wxss'),frames);return manifest('welcome',dir,300*1024)
}
async function prepareCats(){
 const dir=path.join(app,'assets/white-doodle');fs.mkdirSync(dir,{recursive:true})
 for(const name of ['cat-search','cat-book','cat-camera'])await cutout(name,420,path.join(dir,name+'.png'))
 const cat=await sharp(path.join(source,'cat-book-source.png')).trim({threshold:12}).resize({width:365,height:365,fit:'inside'}).png({palette:true,colours:128,quality:88,dither:0}).toBuffer()
 const fallback=`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="576"><rect width="720" height="576" fill="white"/><text x="52" y="105" font-family="Microsoft YaHei,sans-serif" font-size="36" font-weight="600" fill="#292929">猫爪物帐</text><path d="M52 127H224" stroke="#FFE15A" stroke-width="12" stroke-linecap="round"/><image x="178" y="170" width="365" height="365" href="data:image/png;base64,${cat.toString('base64')}"/></svg>`
 fs.writeFileSync(path.join(source,'share-fallback.svg'),fallback)
 await sharp(Buffer.from(fallback)).png({palette:true,colours:128,quality:88,dither:0,effort:10}).toFile(path.join(dir,'share-fallback.png'))
 // Retire stale editable geometric sources and the unused runtime sleep pose.
 for(const name of ['cat-search.svg','cat-book.svg','cat-camera.svg','cat-sleep.svg','cat-sleep.png','share-fallback.svg']){const file=path.join(dir,name);if(fs.existsSync(file))fs.unlinkSync(file)}
 const assets=['cat-search.png','cat-book.png','cat-camera.png','share-fallback.png'].map(name=>({name,bytes:fs.statSync(path.join(dir,name)).size})),bytes=assets.reduce((s,r)=>s+r.bytes,0)
 if(bytes>200*1024)throw Error('Cats/fallback budget exceeded: '+bytes)
 fs.writeFileSync(path.join(source,'cats-manifest.json'),JSON.stringify({bytes,limit:200*1024,assets},null,2));return bytes
}
module.exports={prepareCats,prepareWelcome,prepareSwitch}
if(require.main===module)(async()=>{await prepareSwitch();if(!process.argv.includes('--icons-only'))console.log(JSON.stringify({welcome:await prepareWelcome(),cats:await prepareCats()}))})().catch(e=>{console.error(e);process.exitCode=1})
