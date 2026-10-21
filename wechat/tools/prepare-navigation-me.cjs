// The editable source lives outside the mini-program package.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp')
const source=path.resolve(__dirname,'../branding/navigation-me-20261015/my-cat.svg')
const out=path.resolve(__dirname,'../miniprogram/assets/white-doodle')
async function prepare(){
 fs.mkdirSync(out,{recursive:true})
 const svg=fs.readFileSync(source)
 const files=[]
 for(const[name,size]of [['compact-nav-me',96],['nav-me',81]]){
  // Keep the existing editable runtime copies in sync for tooling; SVG is excluded from packaging.
  fs.writeFileSync(path.join(out,name+'.svg'),svg)
  const file=path.join(out,name+'.png')
  await sharp(svg).resize(size,size).png({palette:true,quality:100,compressionLevel:9}).toFile(file)
  files.push({name:name+'.png',size,bytes:fs.statSync(file).size})
 }
 return files
}
module.exports={prepare}
if(require.main===module)prepare().then(files=>console.log(JSON.stringify({files}))).catch(e=>{console.error(e);process.exitCode=1})
