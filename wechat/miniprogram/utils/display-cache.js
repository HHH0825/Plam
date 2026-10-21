// Opt-in display reads only. Mutations and entitlement/capacity checks use api.request.
let scope='',epoch=0
const rows=new Map(),pending=new Map(),TTL=15000,LIMIT=32
const clone=value=>JSON.parse(JSON.stringify(value))
function identity(){const a=getApp().globalData;return require('./cloud-transport').serviceScope()+'|'+a.user?.id+'|'+a.token}
function clear(){epoch++;rows.clear();pending.clear();scope=''}
function owner(){const key=identity();if(scope!==key){clear();scope=key}return key}
function read(path){
 if(!/^(\/(items|auth\/me|stats|insights|ledger\/settings|ledger\/statistics|ledger\/entries|member\/books|member\/budget))(\?|$)/.test(path))return require('./api').request(path)
 const key=owner(),version=epoch,hit=rows.get(path),now=Date.now()
 if(hit&&now>=hit.at&&now-hit.at<TTL)return Promise.resolve(clone(hit.value))
 if(pending.has(path))return pending.get(path).then(clone)
 const task=Promise.resolve().then(()=>require('./api').request(path)).then(value=>{
  if(key!==identity()||version!==epoch)throw Error('资料已更新，请重新读取')
  rows.delete(path);if(JSON.stringify(value).length<524288)rows.set(path,{at:Date.now(),value:clone(value)})
  while(rows.size>LIMIT)rows.delete(rows.keys().next().value)
  return value
 }).finally(()=>{if(pending.get(path)===task)pending.delete(path)})
 pending.set(path,task);return task.then(clone)
}
function invalidate(path,method='GET'){
 if(method!=='GET'&&!['/rewards/visit','/rewards/greeting'].includes(path))clear()
}
function present(page,patch,done){const changed={};for(const [key,value]of Object.entries(patch))if(JSON.stringify(page.data[key])!==JSON.stringify(value))changed[key]=value;if(Object.keys(changed).length)page.setData(changed,done);else done?.()}
module.exports={read,clear,invalidate,present}
