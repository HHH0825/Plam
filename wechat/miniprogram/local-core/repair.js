'use strict'
const {utf8,decode,sha256}=require('./integrity')
const seal=value=>{const body=JSON.stringify(value);return utf8(JSON.stringify({body,hash:sha256(body)}))}
function unpack(raw){const e=JSON.parse(decode(raw));if(e.hash!==sha256(e.body))throw Error('恢复提交校验失败');return JSON.parse(e.body)}
async function signature(io){const heads=[];for(const slot of [0,1]){const bytes=await io.read('head-'+slot+'.json');heads.push(bytes===null?null:sha256(bytes))}return sha256(JSON.stringify(heads))}
async function checkedWrite(io,path,raw){await io.write(path,raw);const check=await io.read(path);if(!check||sha256(check)!==sha256(raw))throw Error('恢复文件保存校验失败')}
// A repair intent is written ONLY after explicit external-restore confirmation.
// It includes both new descriptors and evidence of both old descriptors. Startup
// may finish this exact authorized operation after an interrupted rename.
async function resume(io){
 const raw=await io.read('repair-intent.json');if(raw===null)return false
 const intent=unpack(raw)
 if(intent.format!=='catpaw-control-repair'||!Array.isArray(intent.targets)||intent.targets.length!==2||!Array.isArray(intent.old)||intent.old.length!==2)throw Error('恢复提交记录损坏，请重新核对外部备份')
 for(const slot of [0,1]){
  const t=intent.targets[slot],old=intent.old[slot]
  if(!/^repair-[a-z0-9-]+-[01]\.json$/.test(t.path)||!/^[a-f0-9]{64}$/.test(t.hash)||old!==null&&(!/^evidence-[a-z0-9-]+-[01]\.json$/.test(old.path)||!/^[a-f0-9]{64}$/.test(old.hash)))throw Error('恢复文件路径无效')
  const target=await io.read(t.path);if(!target||sha256(target)!==t.hash)throw Error('恢复目标损坏，原资料仍保留')
  const head=unpack(target);if(head.format!==1||!head.tables||!Number.isSafeInteger(head.generation))throw Error('恢复目标版本无效')
  for(const ref of Object.values(head.tables)){if(!/^table-[a-z0-9_-]+\.json$/.test(ref.path))throw Error('恢复资料路径无效');const bytes=await io.read(ref.path);if(!bytes||sha256(bytes)!==ref.hash)throw Error('恢复目标资料缺失')}
  if(old){const bytes=await io.read(old.path);if(!bytes||sha256(bytes)!==old.hash)throw Error('原始提交证据缺失，恢复已停止')}
  const current=await io.read('head-'+slot+'.json'),currentHash=current===null?null:sha256(current)
  if(currentHash!==(old?.hash||null)&&currentHash!==t.hash)throw Error('原目录已变化，请重新核对恢复来源')
 }
 const {Store}=require('./store'),verified=new Store(io);verified.head=unpack(await io.read(intent.targets[0].path));await verified.verify()
 for(const slot of [0,1]){const t=intent.targets[slot],bytes=await io.read(t.path),temp=t.path+'.pending';await checkedWrite(io,temp,bytes);await io.rename(temp,'head-'+slot+'.json')}
 await io.remove('repair-intent.json');return true
}
async function replace(store,tables,{confirmed=false,expectedSignature}={}){
 if(!confirmed)throw Error('替换损坏目录前需要明确确认')
 const io=store.io;if(await signature(io)!==expectedSignature)throw Error('损坏目录已变化，请重新核对')
 const tag=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),old=[]
 for(const slot of [0,1]){const bytes=await io.read('head-'+slot+'.json');if(bytes===null)old.push(null);else{const path='evidence-'+tag+'-'+slot+'.json';await checkedWrite(io,path,bytes);old.push({path,hash:sha256(bytes)})}}
 const {Store}=require('./store'),stageIO={...io,async rename(from,to){if(!/^head-[01]\.json$/.test(to))throw Error('无效恢复暂存目标');await io.rename(from,'repair-'+tag+'-0.json')}},stage=new Store(stageIO,{id:()=> 'restore-'+tag})
 stage.head={format:1,generation:1,slot:1,tables:{},changedAt:null}
 await stage.transaction(tx=>{for(const [name,rows]of Object.entries(tables))tx.set(name,rows)})
 const first=await io.read('repair-'+tag+'-0.json'),second=seal({...unpack(first),generation:1}),targets=[{path:'repair-'+tag+'-0.json',hash:sha256(first)},{path:'repair-'+tag+'-1.json',hash:sha256(second)}]
 await checkedWrite(io,targets[1].path,second)
 if(await signature(io)!==expectedSignature)throw Error('原目录已变化，未替换')
 const intent=seal({format:'catpaw-control-repair',old,targets});await checkedWrite(io,'repair-intent.partial',intent);await io.rename('repair-intent.partial','repair-intent.json')
 await resume(io);await store.open();return store.verify()
}
module.exports={resume,replace,signature}
