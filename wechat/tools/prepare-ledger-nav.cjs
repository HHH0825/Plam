const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp')
const source=path.resolve(__dirname,'../branding/ledger-navigation-20261013'),target=path.resolve(__dirname,'../miniprogram/assets/ledger-nav')
const paw=`<g fill="#F1B4C9" stroke="none"><ellipse cx="18" cy="20" rx="1.8" ry="2.5" transform="rotate(-24 18 20)"/><ellipse cx="23" cy="17.5" rx="1.8" ry="2.5"/><ellipse cx="28" cy="20" rx="1.8" ry="2.5" transform="rotate(24 28 20)"/><ellipse cx="31" cy="24" rx="1.5" ry="2"/><path d="M17 28c0-4 4-7 7-7s8 5 7 8c-1 4-5 2-7 2s-7 2-7-3Z"/></g>`
const wrap=s=>`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g stroke="#3F3E39" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${s}</g></svg>`
const drawings={
 ledger:wrap(`<path d="m28 5 8-.2v12l-4-3-4 3Z" fill="#FFE397"/><path d="m13 8 23-.2q5 .1 5 6l-.5 24q0 5-5.5 5l-23-.4q-5 0-5-5.5L8 14q.2-6 5-6Z" fill="#FFFDF2"/><path d="m15 9-.3 33M20 36l13-.3" fill="none"/>${paw}`),
 statistics:wrap(`<path d="M6 41h36" fill="none"/><path d="M8 29q0-2 2-2h4q2 0 2 2v12H8Z" fill="#FFF7DB"/><path d="M20 23q0-2 2-2h4q2 0 2 2v18h-8Z" fill="#F5B3C7"/><path d="M32 19q0-2 2-2h4q2 0 2 2v22h-8Z" fill="#FFE397"/><g transform="translate(15 -6) scale(.62)">${paw}</g>`)
}
async function main(){fs.mkdirSync(source,{recursive:true});fs.mkdirSync(target,{recursive:true});let bytes=0;for(const[name,svg]of Object.entries(drawings)){fs.writeFileSync(path.join(source,name+'.svg'),svg+'\n');const png=await sharp(Buffer.from(svg)).resize(96,96).png({palette:true,effort:10}).toBuffer();fs.writeFileSync(path.join(target,name+'.png'),png);bytes+=png.length}if(bytes>10*1024)throw Error('Navigation icons exceed 10KiB');console.log(JSON.stringify({iconsBytes:bytes}))}
main().catch(e=>{console.error(e);process.exitCode=1})
