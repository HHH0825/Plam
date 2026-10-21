// Package generated reference edits; source art stays outside the mini-program.
const fs=require('node:fs'),path=require('node:path')
const sharp=require('sharp')
const out=path.resolve(__dirname,'../docs/images/membership-tools-20261015'),assets=path.resolve(__dirname,'../miniprogram/assets/membership')
const generated='test-results/local-inputs/generated-images/'
const sources={books:['exec-490420f5-a4a5-40b7-9a8f-284a28a1920a.png',312,201],analysis:['exec-247ca185-e8bc-4a16-bbce-c4d1b32619c6.png',297,201],budget:['exec-4b96ce80-c3e6-49fb-86fa-9eebefd3c949.png',276,216],palette:['exec-d85adb17-a38e-45ab-9ca5-ea7787822ee1.png',282,240]}
const common='Edit the supplied tiny PNG icon into a genuinely sharp, high resolution redraw. The PNG is the edit target, not merely loose inspiration. Preserve the exact recognizable shapes, object arrangement, proportions, facial expression, black slightly wobbly hand drawn outlines, soft pastel fills and original flat doodle style. Clean crisp antialiased outlines suitable for shrinking to a 76px UI icon on a 3x-density phone. Preserve white enclosed book pages and white cat faces as opaque white; background must be truly transparent alpha. No words, letters, branding, shadows, glow, photo texture, UI, frame, extra objects or redesign. Center the complete original composition with only a narrow transparent safety margin. '
const prompts={books:'An open white book with grey short page lines, a small outlined white cat face overlapping the lower right page, a tiny blue airplane in the upper right.',analysis:'Three simple outlined pastel vertical bars increasing left to right, sage green, dusty blue, pale peach; small white cat face to the lower right, with black eyes, tiny mouth, pink cheeks.',budget:'White calendar with pastel pink header, two black binding loops, six grey date squares; three stacked pale yellow coins overlapping the lower right.',palette:'Pale yellow artist palette with pastel colored paint dabs and a white cat face at the upper right, original compact rounded silhouette.'}
async function main(){
 fs.mkdirSync(out,{recursive:true});const records=[]
 for(const[name,[file,width,height]]of Object.entries(sources)){
  const source=path.join(generated,file),target=path.join(assets,name+'.png')
  fs.copyFileSync(source,path.join(out,name+'-hd-source.png'))
  const transparent={r:0,g:0,b:0,alpha:0}
  let quality=90
  for(const value of [90,80,70,60]){
   quality=value
   await sharp(source).trim({threshold:10}).resize(width-6,height-6,{fit:'contain',background:transparent}).extend({top:3,bottom:3,left:3,right:3,background:transparent}).png({palette:true,colours:128,quality:value,dither:0,compressionLevel:9,effort:10,adaptiveFiltering:true}).toFile(target)
   if(fs.statSync(target).size<=20*1024)break
  }
  const metadata=await sharp(target).metadata(),stats=await sharp(target).stats(),bytes=fs.statSync(target).size
  if(bytes>20*1024||!metadata.hasAlpha||stats.channels[3].min!==0||stats.channels[3].max<250)throw Error('Asset budget or transparency failed: '+name)
  records.push({name,width:metadata.width,height:metadata.height,bytes,paletteQuality:quality,transparent:true,sourceFile:name+'-hd-source.png',tool:'built-in imagegen',prompt:common+prompts[name]})
 }
 const totalBytes=records.reduce((n,r)=>n+r.bytes,0)
 if(totalBytes>80*1024)throw Error('Icon total budget exceeded')
 fs.writeFileSync(path.join(out,'asset-results.json'),JSON.stringify({passed:true,assets:records,totalBytes,limit:80*1024},null,2))
 // Same CSS-size drawings shown on white at 2x and 3x device density.
 for(const density of [2,3]){
  const cellW=260,cellH=95*density,canvasW=cellW*4,canvasH=cellH*2+70,composites=[]
  const title=Buffer.from(`<svg width="${canvasW}" height="60"><style>text{font:18px 'Microsoft YaHei';fill:#333}</style><text x="16" y="23">${density}×像素密度 · 上：原图 / 下：高清修复 · 页面显示76×61</text></svg>`)
  composites.push({input:title,top:0,left:0})
  let column=0
  for(const name of Object.keys(sources)){
   for(const [row,file]of [[0,path.join(out,name+'-before.png')],[1,path.join(assets,name+'.png')]]){
    const input=await sharp(file).resize(76*density,61*density,{fit:'contain',background:{r:255,g:255,b:255,alpha:1}}).png().toBuffer()
    composites.push({input,left:column*cellW+12,top:60+row*cellH+10})
   }
   column++
  }
  await sharp({create:{width:canvasW,height:canvasH,channels:4,background:'#FFFFFF'}}).composite(composites).png().toFile(path.join(out,`icons-before-after-${density}x.png`))
 }
 console.log(JSON.stringify({totalBytes,assets:records.map(({name,width,height,bytes})=>({name,width,height,bytes}))}))
}
main().catch(e=>{console.error(e);process.exitCode=1})
