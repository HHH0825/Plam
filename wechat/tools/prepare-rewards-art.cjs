// Export lightweight runtime sprites; original generated artwork stays in docs.
const fs=require('node:fs'),path=require('node:path')
const sharp=require(process.env.PALM_SHARP_PATH || 'sharp')
const root=path.resolve(__dirname,'..'),out=path.join(root,'miniprogram/assets/rewards'),source=path.join(root,'docs/design/rewards-20261017')
const generated=path.resolve(__dirname, '../../test-results/local-inputs/generated-images')
async function main(){
 fs.mkdirSync(out,{recursive:true});fs.mkdirSync(source,{recursive:true});fs.mkdirSync(path.join(root,'miniprogram/pages/rewards/assets'),{recursive:true})
 const sprites=path.join(generated,'exec-0430505c-6a89-4e89-b89b-fbd86ecb3f74.png'),greeting=path.join(generated,'exec-6b4a0bfc-de0f-45d1-be29-6e54ed5e51ac.png')
 fs.copyFileSync(sprites,path.join(source,'loading-original.png'));fs.copyFileSync(greeting,path.join(source,'greeting-original.png'))
 for(const[n,f]of [['approved-shop.png','exec-7945f3ff-20b9-48ff-a599-19edc54d2004.png'],['approved-dialogs.png','exec-aa2163c7-6ff7-49e7-b176-329cb2b57371.png']])fs.copyFileSync(path.join(generated,f),path.join(source,n))
 await sharp(sprites).resize(480,160,{fit:'fill'}).png({palette:true,colours:64,quality:85,effort:10}).toFile(path.join(out,'loading-strip.png'))
 const m=await sharp(sprites).metadata(),w=Math.floor(m.width/3)
 await sharp(sprites).extract({left:w*2,top:0,width:w,height:m.height}).resize(240,240).png({palette:true,colours:80,quality:85,effort:10}).toFile(path.join(out,'cat-box.png'))
 await require('./prepare-greeting-hd.cjs')()
 for(const[n,file,size]of [['wallet-cat','exec-2b38f151-af87-41c9-8a56-b18690aec656.png',180],['extra-space','exec-d79d563a-4c13-434d-bfdd-87369d984496.png',200]]){
  const input=path.join(generated,file);fs.copyFileSync(input,path.join(source,n+'-original.png'))
  await sharp(input).resize(size,size).png({palette:true,colours:64,quality:85,effort:10}).toFile((n==='extra-space'?path.join(root,'miniprogram/pages/rewards/assets/extra-space.png'):path.join(out,n+'.png')))
 }
 console.log(fs.readdirSync(out).map(f=>({file:f,bytes:fs.statSync(path.join(out,f)).size})))
}
main().catch(e=>{console.error(e);process.exitCode=1})
