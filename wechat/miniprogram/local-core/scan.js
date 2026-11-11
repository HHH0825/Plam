const {sha256,decode}=require('./integrity')
// A scan retains one bounded shard at a time and never fills Store.table's cache.
async function scan(store,name,consume){
 if(!/^[a-z][a-z0-9_]{0,47}$/.test(name))throw Error('无效数据表')
 if(!store.head)await store.open();if(store.uncertain)throw Error('上次保存需重新打开核对')
 const ref=store.head.tables[name];if(!ref)return 0
 const read=async(path,hash)=>{if(!/^table-[a-z0-9_-]+\.json$/.test(path))throw Error('资料分片路径无效');const raw=await store.io.read(path);if(!raw||sha256(raw)!==hash)throw Error('资料缺失或损坏，请先恢复');return JSON.parse(decode(raw))}
 const root=await read(ref.path,ref.hash);let count=0
 if(Array.isArray(root)){for(let n=0;n<root.length;n+=500){const part=root.slice(n,n+500);await consume(part,count);count+=part.length}}
 else{if(root.kind!=='shards'||!Array.isArray(root.parts))throw Error('资料分片格式损坏');for(const p of root.parts){const rows=await read(p.path,p.hash);if(!Array.isArray(rows)||rows.length!==p.count)throw Error('资料分片数量不一致');await consume(rows,count);count+=rows.length}}
 if(count!==ref.count)throw Error('资料总数不一致');return count
}
module.exports={scan}
