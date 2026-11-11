'use strict'
const {utf8,decode,sha256,crc32}=require('../../../local-core/integrity')
const fail=message=>{throw Object.assign(Error(message),{code:'INVALID_BACKUP'})}
const safe=name=>typeof name==='string'&&/^(?:data|photos)\/[a-zA-Z0-9_-]+\.(?:json|jpg|jpeg|png|webp)$/.test(name)
const number=(a,p,n)=>new DataView(a.buffer,a.byteOffset,a.byteLength)[n===2?'getUint16':'getUint32'](p,true)
function header(size,fields){const a=new Uint8Array(size),v=new DataView(a.buffer);for(const[p,n,value]of fields)v[n===2?'setUint16':'setUint32'](p,value,true);return a}
function concat(a,b){const c=new Uint8Array(a.length+b.length);c.set(a);c.set(b,a.length);return c}
// Stored ZIP entries: one file in memory at a time, no compression library or
// native extraction. Input names are restricted to this application's format.
async function exportBackup(io,output,files,{createdAt=new Date().toISOString(),validate=()=>{}}={}){
 if(!Array.isArray(files)||files.length>60000)fail('备份文件数量不支持')
 const seen=new Set();for(const f of files){if(!safe(f.name)||seen.has(f.name))fail('备份文件路径无效或重复');seen.add(f.name)}
 const temp=output+'.partial',entries=[],manifest={format:'catpaw-local-backup',version:1,createdAt,encrypted:false,files:[]};let offset=0
 await io.write(temp,new Uint8Array())
 async function entry(name,bytes){const filename=utf8(name),crc=crc32(bytes),local=header(30,[[0,4,0x04034b50],[4,2,20],[6,2,0x800],[8,2,0],[14,4,crc],[18,4,bytes.length],[22,4,bytes.length],[26,2,filename.length]]);if(offset+local.length+filename.length+bytes.length>0xffffffff)fail('备份超过ZIP格式上限');await io.append(temp,concat(local,filename));await io.append(temp,bytes);entries.push({name:filename,offset,size:bytes.length,crc});offset+=local.length+filename.length+bytes.length}
 for(const f of files){if(await io.size(f.path)>16*1024*1024)fail('单个资料文件超过备份上限，请先分片');const bytes=await io.read(f.path);if(bytes===null)fail('备份资料缺失：'+f.name);await validate(f,bytes);manifest.files.push({name:f.name,bytes:bytes.length,sha256:sha256(bytes)});await entry(f.name,bytes)}
 await entry('manifest.json',utf8(JSON.stringify(manifest)))
 const start=offset
 for(const e of entries){const central=header(46,[[0,4,0x02014b50],[4,2,20],[6,2,20],[8,2,0x800],[10,2,0],[16,4,e.crc],[20,4,e.size],[24,4,e.size],[28,2,e.name.length],[42,4,e.offset]]);await io.append(temp,concat(central,e.name));offset+=central.length+e.name.length}
 await io.append(temp,header(22,[[0,4,0x06054b50],[8,2,entries.length],[10,2,entries.length],[12,4,offset-start],[16,4,start]]))
 // Validate the finished archive before exposing it as a successful export.
 await (await inspectBackup(io,temp)).verifyFiles()
 await io.rename(temp,output)
 return manifest
}
async function inspectBackup(io,path,{maxBytes=1024*1024*1024,maxFiles=60000,maxFileBytes=16*1024*1024}={}){
 const size=await io.size(path);if(size<22||size>maxBytes)fail('备份大小不支持')
 const end=await io.readRange(path,size-22,22);if(end.length!==22||number(end,0,4)!==0x06054b50||number(end,20,2)!==0||number(end,4,2)||number(end,6,2))fail('不支持的ZIP结构')
 const count=number(end,10,2),centralSize=number(end,12,4),centralAt=number(end,16,4)
 if(count!==number(end,8,2)||count<1||count>maxFiles+1||centralAt+centralSize!==size-22||centralSize>16*1024*1024)fail('备份目录无效')
 const directory=await io.readRange(path,centralAt,centralSize);if(directory.length!==centralSize)fail('备份目录不完整');let pos=0,total=0;const entries=new Map(),ranges=[]
 for(let i=0;i<count;i++){
  if(pos+46>directory.length||number(directory,pos,4)!==0x02014b50)fail('备份目录损坏')
  const flags=number(directory,pos+8,2),method=number(directory,pos+10,2),packed=number(directory,pos+20,4),length=number(directory,pos+24,4),n=number(directory,pos+28,2),extra=number(directory,pos+30,2),comment=number(directory,pos+32,2),at=number(directory,pos+42,4),crc=number(directory,pos+16,4)
  if(pos+46+n+extra+comment>directory.length||flags!==0x800||method!==0||packed!==length||length>maxFileBytes||number(directory,pos+34,2)!==0)fail('仅支持本程序导出的完整备份包，单文件大小须在限制内')
  const name=decode(directory.slice(pos+46,pos+46+n));if((name!=='manifest.json'&&!safe(name))||entries.has(name))fail('备份路径无效或重复')
  const local=await io.readRange(path,at,30);if(local.length!==30||number(local,0,4)!==0x04034b50||number(local,6,2)!==flags||number(local,8,2)!==method||number(local,14,4)!==crc||number(local,18,4)!==length||number(local,22,4)!==length||number(local,26,2)!==n)fail('备份文件头不一致')
  const localExtra=number(local,28,2),rawName=await io.readRange(path,at+30,n);if(decode(rawName)!==name)fail('备份文件名不一致')
  const dataAt=at+30+n+localExtra;if(dataAt+length>centralAt||at<0)fail('备份文件越界')
  total+=length;if(total>maxBytes)fail('备份展开大小超限');ranges.push([at,dataAt+length]);entries.set(name,{name,at:dataAt,length,crc});pos+=46+n+extra+comment
 }
 ranges.sort((a,b)=>a[0]-b[0]);if(pos!==directory.length||ranges[0][0]!==0||ranges.some((r,i)=>i&&r[0]!==ranges[i-1][1])||ranges[ranges.length-1][1]!==centralAt)fail('备份存在重叠或额外文件')
 async function read(name){const e=entries.get(name);if(!e)fail('备份缺少文件');const a=await io.readRange(path,e.at,e.length);if(a.length!==e.length||crc32(a)!==e.crc)fail('备份文件损坏');return a}
 if(!entries.has('manifest.json')||entries.get('manifest.json').length>8*1024*1024)fail('备份缺少有效清单')
 let manifest;try{manifest=JSON.parse(decode(await read('manifest.json')))}catch(_){fail('备份清单损坏')}
 if(manifest.format!=='catpaw-local-backup'||manifest.version!==1||manifest.encrypted!==false||!Array.isArray(manifest.files)||manifest.files.length!==entries.size-1||!Number.isFinite(Date.parse(manifest.createdAt)))fail('备份版本或清单不支持')
 const listed=new Set();for(const f of manifest.files){if(!safe(f.name)||listed.has(f.name)||!entries.has(f.name)||f.bytes!==entries.get(f.name).length||!/^[a-f0-9]{64}$/.test(f.sha256))fail('备份文件清单不匹配');listed.add(f.name)}
 async function verifyFiles(consume=async()=>{}){for(const f of manifest.files){const a=await read(f.name);if(sha256(a)!==f.sha256)fail('备份校验失败：'+f.name);await consume(f.name,a)}}
 return {manifest,totalBytes:total,verifyFiles}
}
module.exports={exportBackup,inspectBackup}
