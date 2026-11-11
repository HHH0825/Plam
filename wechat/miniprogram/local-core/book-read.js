const {scan}=require('./scan')
async function read(store){
 const settings=(await store.table('settings'))[0]||{},books=await store.table('books'),counts=new Map(),parents=new Map(),refunds=new Map(),add=(id,n)=>counts.set(id,(counts.get(id)||0)+n)
 await scan(store,'ledger_entries',rows=>{for(const r of rows){if(r.kind==='refund'){if(r.state==='active')refunds.set(r.parent_id,(refunds.get(r.parent_id)||0)+1)}else{parents.set(r.id,r.book_id||'default');if(r.state==='active')add(r.book_id||'default',1)}}})
 for(const [parent,count]of refunds)add(parents.get(parent)||'default',count)
 const all=[{id:'default',name:'日常账本',archived:false,revision:0,cover:'daily',sticker:'',order:settings.default_book_order||0},...books].sort((a,b)=>(a.order||0)-(b.order||0))
 return {books:all.map(b=>({...b,count:counts.get(b.id)||0})),order_revision:settings.book_order_revision||0}
}
module.exports={read}
