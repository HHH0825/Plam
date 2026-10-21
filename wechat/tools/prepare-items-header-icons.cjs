// Editable vector versions of the three icons in the approved header sketch.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp')
const source=path.resolve(__dirname,'../branding/items-header-20261012'),out=path.resolve(__dirname,'../miniprogram/assets/items-header')
const wrap=body=>`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g stroke="#3F3E39" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`
const icons={
 'wishlist':wrap(`<path d="M13 8.5 30 8q6 0 6 6l-.5 21q0 6-6 6.5l-16-.5q-5-.5-5-6L8.5 15q.3-6 4.5-6.5Z" fill="#FFFDF2"/><path d="m16 5 .2 8M28 4.5v8" fill="none"/><path d="m15 20 10-.3m-10 7 8 .2M15 34l5 .2" fill="none" stroke="#E7C767" stroke-width="2.8"/><path d="M34 28c-5.7-8.2-13 0-6.1 7.2l6.4 6.6 6.2-7c6-7.5-1.2-13.8-6.5-6.8Z" fill="#F5B3C7"/>`),
 'subscription':wrap(`<path d="m12 8 21-.5q5 .2 5 6l-.3 18.5q0 8-6 8l-20 .3q-5 0-5-6l.5-20.5q0-6 4.8-5.8Z" fill="#FFFDF2"/><path d="m7.5 18 30.5-.5" fill="none"/><path d="m16 4.5.2 8M29 4v8" fill="none"/><g fill="#E7C767" stroke="none"><circle cx="15.5" cy="24" r="1.8"/><circle cx="23" cy="24" r="1.8"/><circle cx="15" cy="32" r="1.8"/></g><circle cx="35" cy="33" r="10.6" fill="#F5B3C7"/><path d="m35 27-.2 6.5 4.5.7" fill="none"/>`),
 'storage':wrap(`<path d="m9 17 .7 19q.3 6 6.3 6l17-.5q5-.2 5.5-6L39 17" fill="#FFF3C8"/><path d="m11 8.5 25-.3q6 0 6 5.5l-.5 5q-17 1.5-35-.2L6.2 14q-.2-5.2 4.8-5.5Z" fill="#FFFDF2"/><path d="m20 27 9-.2" fill="none"/>`)
}
async function main(){fs.mkdirSync(source,{recursive:true});fs.mkdirSync(out,{recursive:true});let bytes=0;for(const[name,svg]of Object.entries(icons)){fs.writeFileSync(path.join(source,'entry-'+name+'.svg'),svg+'\n');const png=await sharp(Buffer.from(svg)).resize(144,144).png({palette:true,effort:10}).toBuffer();fs.writeFileSync(path.join(out,'entry-'+name+'.png'),png);bytes+=png.length}const total=bytes+fs.statSync(path.join(out,'cat-box.png')).size;if(total>80*1024)throw Error('Header art exceeds 80KiB');console.log(JSON.stringify({iconsBytes:bytes,totalHeaderArtBytes:total}))}
main().catch(e=>{console.error(e);process.exitCode=1})
