// Original editable ornaments; only optimized transparent PNGs enter the app.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp')
const source=path.resolve(__dirname,'../branding/me-glass-20261012'),runtime=path.resolve(__dirname,'../miniprogram/assets/me-profile')
const paw=color=>`<g fill="${color}"><ellipse cx="17" cy="8" rx="3.3" ry="4.6" transform="rotate(-20 17 8)"/><ellipse cx="26" cy="5" rx="3.4" ry="4.7"/><ellipse cx="35" cy="9" rx="3.2" ry="4.5" transform="rotate(24 35 9)"/><ellipse cx="10" cy="17" rx="3" ry="4.2" transform="rotate(-35 10 17)"/><path d="M15 27c-2-5 3-7 5-11 3-5 8-4 10 1 2 4 7 6 4 11-3 5-7 0-10 1-4 1-7 3-9-2z"/></g>`
const drawings={
 left:`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="104" viewBox="0 0 80 104"><g transform="translate(2 21) rotate(-13 25 18)">${paw('#F4ABC0')}</g><g transform="translate(35 61) rotate(14 25 18) scale(.72)">${paw('#EFCB70')}</g></svg>`,
 right:`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="104" viewBox="0 0 80 104"><g transform="translate(31 14) rotate(16 25 18) scale(.94)">${paw('#B7CDD8')}</g><g transform="translate(2 63) rotate(-16 25 18) scale(.75)">${paw('#D7C4E4')}</g></svg>`
}
async function main(){
 fs.mkdirSync(source,{recursive:true});fs.mkdirSync(runtime,{recursive:true})
 let bytes=0
 for(const[name,svg]of Object.entries(drawings)){fs.writeFileSync(path.join(source,name+'.svg'),svg);const png=await sharp(Buffer.from(svg)).resize(240,312).png({palette:true,effort:10}).toBuffer();fs.writeFileSync(path.join(runtime,name+'.png'),png);bytes+=png.length}
 // Upper profile now has paws only; the menu area retains the global dots.
 fs.writeFileSync(path.resolve(__dirname,'../miniprogram/pages/me/background.wxss'),`.profile-wash { background-color:#FFFFFF; background-image:linear-gradient(180deg,#FFF7E0 0%,#FFF7E0 58%,#FFFAEC 76%,#FFFFFF 100%); background-size:100% 100%; background-repeat:no-repeat; }\n`)
 console.log(JSON.stringify({ornamentPngBytes:bytes}))
}
main().catch(e=>{console.error(e);process.exitCode=1})
