// Lossless packaging pass. Preserve decoded RGBA pixels and all image dimensions.
// Sources stay in the repository; snapshots and audit metadata live outside the app.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const sharp=require(process.env.PALM_SHARP_PATH || 'sharp')
const project=path.resolve(__dirname,'../miniprogram'),output=path.resolve(__dirname,'../branding/package-optimization-20261009')
const apply=process.argv.includes('--apply')
const visit=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?visit(path.join(directory,entry.name)):[path.join(directory,entry.name)])
const hash=value=>crypto.createHash('sha256').update(value).digest('hex')
async function main(){
 const skipped=[]
 for(const file of visit(path.join(project,'assets')).filter(file=>file.endsWith('.png'))){
  const before=fs.readFileSync(file),metadata=await sharp(before).metadata()
  if(before.length<8000)continue
  const options=before[25]===3?{palette:true,colours:256,dither:0,effort:10,compressionLevel:9}:{palette:false,compressionLevel:9,adaptiveFiltering:true}
  const after=await sharp(before).png(options).toBuffer()
  if(after.length>=before.length)continue
  const decoded=await sharp(before).ensureAlpha().raw().toBuffer(),result=await sharp(after).ensureAlpha().raw().toBuffer(),next=await sharp(after).metadata()
  if(!decoded.equals(result)||metadata.width!==next.width||metadata.height!==next.height||metadata.hasAlpha!==next.hasAlpha){skipped.push(path.relative(project,file).replace(/\\/g,'/'));continue}
  const name=path.relative(project,file).replace(/\\/g,'/'),backup=path.join(output,'originals',name)
  if(apply){fs.mkdirSync(path.dirname(backup),{recursive:true});if(!fs.existsSync(backup))fs.copyFileSync(file,backup);fs.writeFileSync(file,after)}
 }
 const rows=[]
 const originals=path.join(output,'originals')
 if(fs.existsSync(originals))for(const file of visit(originals)){
  const name=path.relative(originals,file).replace(/\\/g,'/'),before=fs.readFileSync(file),after=fs.readFileSync(path.join(project,name)),metadata=await sharp(before).metadata(),next=await sharp(after).metadata()
  const decoded=await sharp(before).ensureAlpha().raw().toBuffer(),result=await sharp(after).ensureAlpha().raw().toBuffer()
  if(!decoded.equals(result)||metadata.width!==next.width||metadata.height!==next.height||metadata.hasAlpha!==next.hasAlpha)throw Error('Snapshot invariant failed: '+name)
  rows.push({file:name,before:before.length,after:after.length,saved:before.length-after.length,width:metadata.width,height:metadata.height,exactPixels:true,beforeSha256:hash(before),afterSha256:hash(after)})
 }
 const audit={applied:apply,files:rows.length,savedBytes:rows.reduce((total,row)=>total+row.saved,0),skippedNonLossless:skipped,rows}
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,apply?'lossless-compression.json':'lossless-proposal.json'),JSON.stringify(audit,null,2))
 console.log(JSON.stringify({applied:apply,files:audit.files,savedBytes:audit.savedBytes}))
}
main().catch(error=>{console.error(error);process.exitCode=1})
