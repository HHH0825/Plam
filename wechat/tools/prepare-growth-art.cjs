const fs=require('node:fs'),path=require('node:path'),sharp=require(process.env.PALM_SHARP_PATH || 'sharp')
const root=path.resolve(__dirname,'..'),source=path.join(root,'docs/design/growth-20261018/unlimited-original.png')
fs.mkdirSync(path.join(root,'miniprogram/pages/membership/assets'),{recursive:true})
sharp(source).trim({threshold:10}).resize(210,210,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png({palette:true,quality:30,colours:64,dither:0,compressionLevel:9,adaptiveFiltering:true,effort:10}).toFile(path.join(root,'miniprogram/pages/membership/assets/unlimited.png')).then(r=>console.log({bytes:r.size,width:r.width,height:r.height})).catch(e=>{console.error(e);process.exitCode=1})
