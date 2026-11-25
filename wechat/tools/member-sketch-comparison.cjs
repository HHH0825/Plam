// Contact sheets compare untouched reference crops with actual IDE screenshots.
const fs=require('node:fs'),path=require('node:path')
const sharp=require(process.env.PALM_SHARP_PATH || 'sharp')
const out=path.resolve(__dirname,'../docs/images/membership-sketch-20261015')
async function native(name){const normalized=await sharp(path.join(out,name+'-native.png')).resize({width:390}).png().toBuffer();const m=await sharp(normalized).metadata();return sharp(normalized).extract({left:0,top:44,width:390,height:m.height-44}).png().toBuffer()}
async function sheet(file,panels){
 const bitmaps=await Promise.all(panels.map(p=>p.image)),heights=await Promise.all(bitmaps.map(b=>sharp(b).metadata().then(m=>m.height))),width=20+panels.length*410,height=Math.max(...heights)+80
 const title=Buffer.from('<svg width="'+width+'" height="50"><style>text{font-family:Microsoft YaHei,sans-serif;font-size:18px;fill:#292929}</style>'+panels.map((p,i)=>'<text x="'+(20+i*410)+'" y="32">'+p.label+'</text>').join('')+'</svg>')
 await sharp({create:{width,height,channels:4,background:'#F0F3F6'}}).composite([{input:title,left:0,top:0},...bitmaps.map((input,i)=>({input,left:20+i*410,top:55}))]).png().toFile(path.join(out,file+'.png'))
}
async function main(){
 const ref=side=>sharp(path.join(out,'reference.png')).extract({left:side==='me'?41:580,top:75,width:520,height:1260}).resize({width:390}).png().toBuffer()
 await sheet('subscription-comparison',[{label:'原草图 · 订阅页',image:ref('subscription')},{label:'微信实际界面 · 顶部',image:native('subscription-free')},{label:'微信实际界面 · 下方权益',image:native('subscription-rights')}])
 await sheet('entry-comparison',[{label:'原草图 · 我的',image:ref('me')},{label:'微信实际界面 · 我的',image:native('me-entry')}])
 console.log('Created two reference/native contact sheets')
}
main().catch(e=>{console.error(e);process.exitCode=1})
