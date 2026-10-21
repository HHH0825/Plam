// Production art exported from the approved sketch; originals stay outside the app.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp')
const dir=path.resolve(__dirname,'../branding/items-header-20261012'),runtime=path.resolve(__dirname,'../miniprogram/assets/items-header')
async function main(){
 fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(runtime,{recursive:true})
 const [sketch,cat]=process.argv.slice(2)
 if(sketch)fs.copyFileSync(sketch,path.join(dir,'approved-sketch.png'))
 if(cat)fs.copyFileSync(cat,path.join(dir,'cat-box-source.png'))
 const source=path.join(dir,'cat-box-source.png'),meta=await sharp(source).metadata()
 if(!meta.hasAlpha)throw Error('Cat asset must have genuine alpha transparency')
 const png=await sharp(source).trim({threshold:8}).resize({width:360,height:360,fit:'inside'}).png({palette:true,colours:128,effort:10,dither:.3}).toBuffer()
 if(png.length>80*1024)throw Error('Header PNG exceeds 80KiB budget')
 fs.writeFileSync(path.join(runtime,'cat-box.png'),png)
 console.log(JSON.stringify({file:'assets/items-header/cat-box.png',bytes:png.length,metadata:await sharp(png).metadata()}))
}
main().catch(e=>{console.error(e);process.exitCode=1})
