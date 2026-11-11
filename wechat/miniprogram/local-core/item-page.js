const R=require('./rules'),{utf8,decode,sha256}=require('./integrity'),{scan}=require('./scan')
const signature=(store,day)=>sha256(JSON.stringify([day,...['items','maintenance_records','disposal_records','usage_records','expense_payments','storage_locations'].map(n=>store.head.tables[n]?.hash||'')]))
function compare(a,b,sort){const pin=Number(!!b.is_pinned)-Number(!!a.is_pinned);if(pin)return pin;const key=[null,'holding_days','purchase_price','daily_net_cost','daily_net_cost'][sort];if(key){if(a[key]==null&&b[key]!=null)return 1;if(b[key]==null&&a[key]!=null)return-1;const diff=sort===4?Number(a[key])-Number(b[key]):Number(b[key])-Number(a[key]);if(diff)return diff}return b.id-a.id}
async function aggregates(store,day){
 const result={maintenance:new Map(),disposal:new Map(),usage:new Map(),fixed:new Map(),locations:new Map()}
 const add=(map,id,n)=>map.set(id,(map.get(id)||0)+n)
 for(const name of ['maintenance_records','disposal_records','usage_records','expense_payments','storage_locations'])await scan(store,name,rows=>{for(const r of rows){if(name==='maintenance_records')add(result.maintenance,r.item_id,r.cost_cents);if(name==='disposal_records')result.disposal.set(r.item_id,r);if(name==='expense_payments'&&!r.voided&&r.item_id)add(result.fixed,r.item_id,r.cost_cents);if(name==='storage_locations'&&!r.deleted)result.locations.set(r.id,r.name);if(name==='usage_records'){const p=result.usage.get(r.item_id)||{count:0,last:null,today:false};p.count++;p.last=!p.last||r.used_on>p.last?r.used_on:p.last;p.today=p.today||r.used_on===day;result.usage.set(r.item_id,p)}}})
 return result
}
function project(r,a,day){
 const disposal=a.disposal.get(r.id),maintenance=a.maintenance.get(r.id)||0,fixed=a.fixed.get(r.id)||0,usage=a.usage.get(r.id)||{count:0,last:null,today:false},proceeds=disposal?.proceeds_cents||0,days=R.days(r.purchase_date,disposal?.disposed_on||day),net=r.purchase_cents+maintenance+fixed-proceeds,daily=n=>days>0?R.money(Math.sign(n)*Math.floor(Math.abs(n)/days+0.5)):null,location=a.locations.get(r.storage_location_id)
 const clean=Object.fromEntries(Object.entries(r).filter(([k])=>!k.endsWith('_cents')&&!['user_id','_id','create_fingerprint'].includes(k)))
 return {...clean,purchase_price:R.money(r.purchase_cents),photo_url:r.photo_key?'/api/mp/items/'+r.id+'/photo':null,photo_version:r.photo_key||'',cover_mode:r.cover_mode||'icon',cover_icon_key:r.cover_icon_key||r.icon_type,is_pinned:!!r.is_pinned,used_today:usage.today,maintenance_total:R.money(maintenance),fixed_expense_total:R.money(fixed),usage_count:usage.count,last_recorded_use:usage.last,disposal_proceeds:R.money(proceeds),net_cost:R.money(net),holding_days:days,daily_purchase_cost:daily(r.purchase_cents),daily_net_cost:daily(net),storage_location_id:location?r.storage_location_id:null,storage_location_name:location||'',milestones:{earned:[],next:null},daily_target:null}
}
async function cached(store,day,check){
 const io=store.io,sig=signature(store,day);let index
 try{const raw=await io.read('query-index.json');if(raw){const envelope=JSON.parse(decode(raw));if(envelope.hash===sha256(envelope.body)){const parsed=JSON.parse(envelope.body);if(parsed.version===1&&parsed.signature===sig&&Array.isArray(parsed.parts))index=parsed}}}catch(_){}
 if(index)return index
 const a=await aggregates(store,day),parts=[];let number=0
 await scan(store,'items',async rows=>{check();const items=rows.filter(r=>!r.deleted_at).map(r=>project(r,a,day));if(!items.length)return;const file='query-part-'+sig.slice(0,24)+'-'+number+++'.json',raw=utf8(JSON.stringify(items));await io.write(file,raw);const bytes=await io.read(file);if(!bytes||sha256(bytes)!==sha256(raw))throw Error('列表缓存保存失败');parts.push({file,hash:sha256(raw),count:items.length})})
 index={version:1,signature:sig,parts};const body=JSON.stringify(index),raw=utf8(JSON.stringify({body,hash:sha256(body)}));await io.write('query-index.pending',raw);await io.rename('query-index.pending','query-index.json');check()
 const keep=new Set(parts.map(p=>p.file));for(const file of await io.list())if(/^query-part-[a-f0-9]{24}-\d+\.json$/.test(file)&&!keep.has(file))await io.remove?.(file)
 return index
}
async function query(store,q,clock,check=()=>{}){
 const day=R.today(clock()),offset=Number(q.offset||0),limit=Number(q.limit||60),sort=Number(q.sort||0);R.integer(offset,0,Number.MAX_SAFE_INTEGER);R.integer(limit,1,100);R.integer(sort,0,4)
 const scope=q.scope==='disposed'?'disposed':'held',term=(q.q||'').trim().toLocaleLowerCase(),selected=[],categories=new Set();let total=0,scopeTotal=0
 const consume=rows=>{check();for(const row of rows){if(scope==='disposed'?row.status!=='disposed':!['active','idle'].includes(row.status))continue;scopeTotal++;categories.add(row.category);if(q.status&&row.status!==q.status||q.category&&row.category!==q.category||term&&![row.name,row.category,row.notes||''].join(' ').toLocaleLowerCase().includes(term))continue;total++;let lo=0,hi=selected.length;while(lo<hi){const mid=(lo+hi)>>1;if(compare(row,selected[mid],sort)<0)hi=mid;else lo=mid+1}if(lo<offset+limit+1){selected.splice(lo,0,row);if(selected.length>offset+limit+1)selected.pop()}}}
 // A damaged/failed cache is disposable. Retry once from authoritative records;
 // no path here clears, repairs or initializes business data.
 try{const index=await cached(store,day,check);for(const p of index.parts){if(!/^query-part-[a-f0-9]{24}-\d+\.json$/.test(p.file))throw Error('列表缓存路径无效');const raw=await store.io.read(p.file);if(!raw||sha256(raw)!==p.hash)throw Error('列表缓存需重建');const rows=JSON.parse(decode(raw));if(!Array.isArray(rows)||rows.length!==p.count)throw Error('列表缓存数量无效');consume(rows)}}
 catch(error){check();selected.length=0;categories.clear();total=scopeTotal=0;await store.io.remove?.('query-index.json').catch(()=>{});const a=await aggregates(store,day);await scan(store,'items',rows=>consume(rows.filter(r=>!r.deleted_at).map(r=>project(r,a,day))))}
 return {items:selected.slice(offset,offset+limit),next_offset:offset+limit<total?offset+limit:null,total,scope_total:scopeTotal,categories:[...categories].sort(),version:signature(store,day)}
}
module.exports={query,project,compare}
