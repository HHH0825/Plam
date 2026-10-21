const fs=require('node:fs'),path=require('node:path'),sharp=require(process.env.PALM_SHARP_PATH || 'sharp')
const inputs=process.argv.slice(2)
if(inputs.length!==2) throw new Error('Pass generated kitten and wash PNG paths.')
const root=path.resolve(__dirname,'../miniprogram/assets/me'),originals=path.resolve(__dirname,'../branding/me-refresh')
async function main(){
  fs.mkdirSync(root,{recursive:true});fs.mkdirSync(originals,{recursive:true})
  for(const [index,name,width]of [[0,'resting-kitten-v1',512],[1,'watercolor-wash-v1',768]]){
    fs.copyFileSync(inputs[index],path.join(originals,name+'-source.png'))
    const output=path.join(root,name+'.png')
    await sharp(inputs[index]).resize({width}).png({palette:true,colours:128,dither:.25,effort:10}).toFile(output)
    const meta=await sharp(output).metadata();if(!meta.hasAlpha) throw new Error(name+' requires alpha')
    console.log(JSON.stringify({name,width:meta.width,height:meta.height,hasAlpha:meta.hasAlpha,bytes:fs.statSync(output).size}))
  }
  const bytes=fs.readdirSync(root).filter(name=>name.endsWith('.png')).reduce((n,name)=>n+fs.statSync(path.join(root,name)).size,0)
  if(bytes>250*1024) throw new Error('PNG asset budget exceeded: '+bytes)
  console.log(JSON.stringify({totalPngBytes:bytes,limit:250*1024}))
}
main().catch(e=>{console.error(e);process.exitCode=1})
