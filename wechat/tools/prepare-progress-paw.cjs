const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp')
async function main(){
  const source=path.resolve(__dirname,'../branding/subscription-progress-simple-20261012')
  const target=path.resolve(__dirname,'../miniprogram/assets/purchase-entry/progress-paw.png')
  // Reuse the existing editable four-toe paw shape; only the brand tint changes.
  const svg=fs.readFileSync(path.resolve(__dirname,'../miniprogram/assets/item-doodle/paw.svg'),'utf8').replaceAll('#FFE15A','#F1B4C9')
  fs.mkdirSync(source,{recursive:true});fs.writeFileSync(path.join(source,'progress-paw.svg'),svg)
  const png=await sharp(Buffer.from(svg)).resize(64,64).png({palette:true,effort:10}).toBuffer()
  fs.writeFileSync(target,png);console.log(JSON.stringify({bytes:png.length}))
}
main().catch(e=>{console.error(e);process.exitCode=1})
