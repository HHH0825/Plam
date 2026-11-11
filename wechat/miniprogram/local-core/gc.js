const {decode,sha256}=require('./integrity')
// Run while the Store write queue is held, before allocating another generation.
// Only obsolete structured table files are removed. Photos, ZIPs, recovery intent,
// pending future generations and evidence are never removed here.
async function collect(store){
 const io=store.io;if(!io.remove||store.uncertain)return 0
 const names=await io.list(),heads=[]
 for(const slot of [0,1]){const h=await store.descriptor(slot);if(h)heads.push(h)}
 for(const name of names.filter(n=>/^recovery-evidence-|^evidence-/.test(n))){const raw=await io.read(name);let e,h;try{e=JSON.parse(decode(raw));if(e.hash!==sha256(e.body))throw Error();h=JSON.parse(e.body);if(h.format!==1||!h.tables)throw Error()}catch(_){return 0}heads.push(h)}
 if(!heads.length)return 0
 const refs=new Set(),partsCache=store._gcParts||(store._gcParts=new Map())
 for(const h of heads)for(const ref of Object.values(h.tables)){
  if(!/^table-[a-z0-9_-]+\.json$/.test(ref.path))throw Error('数据引用无效，未清理')
  refs.add(ref.path);let parts=partsCache.get(ref.path)
  if(!parts){const bytes=await io.read(ref.path);if(!bytes||sha256(bytes)!==ref.hash)throw Error('数据损坏，未清理');parts=[];if(bytes[0]===123){const doc=JSON.parse(decode(bytes));if(doc.kind!=='shards'||!Array.isArray(doc.parts))throw Error('分片格式无效');for(const p of doc.parts){if(!/^table-[a-z0-9_-]+\.json$/.test(p.path))throw Error('分片路径无效');parts.push(p.path)}}partsCache.set(ref.path,parts)}
  parts.forEach(p=>refs.add(p))
 }
 let count=0
 for(const name of names){const m=name.match(/^table-[a-z_]+-(\d+)-[a-z0-9_-]+\.json$/);if(m&&Number(m[1])<=store.head.generation&&!refs.has(name)){await io.remove(name);partsCache.delete(name);count++}}
 return count
}
module.exports={collect}
