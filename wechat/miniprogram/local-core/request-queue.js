'use strict'
const {sha256}=require('./integrity')
// Retain the same operation ID until a committed result has been acknowledged.
// This journal is separate from the data transaction, so a lost callback can be
// resolved from its durable receipt after reopening the app.
function submit(r,path,options){
 if((options.method||'GET')==='GET'||options.requestId||options.data?.operation_id||['/rewards/visit','/rewards/greeting'].includes(path))return r.business.request(path,options)
 return write(r,path,options)
}
async function write(r,path,options){
 const fingerprint=sha256(JSON.stringify([r.folder,options.method,path,options.data,options.revision]))
 const id=await r.control.transaction(async tx=>{const rows=await tx.get('requests'),old=rows.find(x=>x.id===fingerprint);if(old)return old.operation;if(rows.length>=1000)throw Error('未确认保存过多，请先核对资料并备份');const operation='local-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);rows.push({id:fingerprint,folder:r.folder,operation});tx.set('requests',rows);return operation})
 const acknowledge=()=>r.control.transaction(async tx=>tx.set('requests',(await tx.get('requests')).filter(x=>x.id!==fingerprint)))
 let result
 try{result=await r.business.request(path,{...options,requestId:id})}catch(error){if(error.status>=400&&error.status<500)await acknowledge();throw error}
 await acknowledge();return result
}
module.exports={submit}
