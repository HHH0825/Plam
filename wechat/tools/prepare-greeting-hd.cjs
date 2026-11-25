// Export greeting-only artwork; original images stay outside the mini-program.
const path=require('node:path'),fs=require('node:fs')
const sharp=require(process.env.PALM_SHARP_PATH || 'sharp')
const root=path.resolve(__dirname,'..')
async function exportGreetings(){
 const out=path.join(root,'miniprogram/assets/rewards')
 fs.mkdirSync(out,{recursive:true})
 const options={palette:true,quality:40,colours:128,dither:0,compressionLevel:9,adaptiveFiltering:true,effort:10}
 const background={r:0,g:0,b:0,alpha:0}
 await sharp(path.join(root,'docs/design/greeting-hd-20261018/day-original.png')).trim({threshold:10}).resize(384,368,{fit:'contain',background}).png(options).toFile(path.join(out,'good-day.png'))
 await sharp(path.join(root,'docs/design/rewards-20261017/greeting-original.png')).resize(510,340,{fit:'contain',background}).png(options).toFile(path.join(out,'good-night.png'))
}
module.exports=exportGreetings
if(require.main===module)exportGreetings().catch(e=>{console.error(e);process.exitCode=1})
