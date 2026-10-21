// Lossless re-encoding only: preserve size, alpha and every visible pixel.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
let sharp;try{sharp=require('sharp')}catch(_){sharp=require('sharp')}
const root=path.resolve(__dirname,'..'),source=path.join(root,'branding/code-quality-20261019/login-hero-master.png'),target=path.join(root,'miniprogram/pages/login/assets/hero.png')
async function prepare(){
 const input=fs.readFileSync(source),before=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true})
 // PNG is included by the WeChat compiler's image-resource pipeline. A WebP
 // loading from the simulator's local directory does not prove it ships.
 let png=input
 const candidate=await sharp(input).png({palette:true,colours:256,quality:100,dither:0,effort:10,compressionLevel:9,adaptiveFiltering:false}).toBuffer()
 if(candidate.length<input.length&&(await sharp(candidate).ensureAlpha().raw().toBuffer()).equals(before.data))png=candidate
 if(png.length>200*1024)throw Error('Lossless PNG hero exceeds 200KiB budget')
 const after=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true})
 if(before.info.width!==after.info.width||before.info.height!==after.info.height)throw Error('Image dimensions changed')
 let visible=0;for(let i=0;i<before.data.length;i+=4){if(before.data[i+3]!==after.data[i+3])throw Error('Alpha changed');if(before.data[i+3]){visible++;for(let j=0;j<3;j++)if(before.data[i+j]!==after.data[i+j])throw Error('Visible pixel changed')}}
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,png)
 const webp=path.join(path.dirname(target),'hero.webp');if(fs.existsSync(webp))fs.unlinkSync(webp)
 const report={passed:true,format:'png',width:before.info.width,height:before.info.height,masterBytes:input.length,pngBytes:png.length,budgetBytes:200*1024,visiblePixels:visible,alphaIdentical:true,visiblePixelsIdentical:true,exactPixelsIdentical:before.data.equals(after.data),runtimeSha256:crypto.createHash('sha256').update(png).digest('hex')}
 const manifestFile=path.join(root,'branding/theme-refresh-20261014/welcome-manifest.json')
 if(fs.existsSync(manifestFile)){const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));manifest.assets=manifest.assets.filter(r=>r.name!=='hero.webp'&&r.name!=='hero.png');manifest.assets.push({name:'hero.png',bytes:png.length});manifest.bytes=manifest.assets.reduce((s,r)=>s+r.bytes,0);if(manifest.bytes>manifest.limit)throw Error('Welcome asset budget exceeded');fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2))}
 fs.writeFileSync(path.join(root,'branding/code-quality-20261019/hero-lossless.json'),JSON.stringify(report,null,2));return report
}
module.exports=prepare
if(require.main===module)prepare().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1})
