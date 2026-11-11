const api=require('./api')
const listeners=new Set()
let cached=null,owner='',pending=null,visitPending=null,visited='',visitOwner='',visitStamp=0
function token(){return getApp().globalData.token||''}
function reset(){cached=null;owner='';pending=null;visitPending=null;visited='';visitOwner='';visitStamp=0;emit('reset')}
function emit(type,data){for(const fn of listeners)try{fn(type,data)}catch(_){}}
function subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)}
function accept(value,account){
 if(account!==token())throw Error('登录账户已切换')
 if(!value||!Number.isSafeInteger(value.balance)||!value.capacity||!value.local&&!value.checkin||!value.shop||typeof value.date!=='string')throw Error('资料暂不可用，请重试')
 cached=value;owner=account;return value
}
function load(){
 const account=token();if(!account)return Promise.reject(Error('请先登录'))
 if(pending&&owner===account)return pending
 owner=account
 const task=api.request('/rewards').then(r=>accept(r,account)).finally(()=>{if(pending===task)pending=null})
 pending=task;return task
}
async function mutate(action,data){const account=token(),r=await api.request('/rewards/'+action,{method:'POST',data});return accept(r,account)}
function visit(){
 const account=token();if(!account)return Promise.resolve(null)
 if(visitPending&&visitOwner===account)return visitPending
 visitOwner=account
 const task=api.request('/rewards/visit',{method:'POST',data:{}}).then(r=>{accept(r,account);visited=r.date;visitStamp=Date.now();return r}).finally(()=>{if(visitPending===task)visitPending=null})
 visitPending=task;return task
}
async function visitIfNeeded(model){
 if(visitOwner===token()&&visited===model.date)return model
 const response=await visit()
 // A lost response from yesterday can replay once; its acknowledged receipt
 // must not suppress today's distinct visit.
 return response.date<model.date?visit():response
}
function capacityReached(value){emit('capacity',value)}
function current(){return owner===token()?cached:null}
function foreground(){visitStamp=0}
function visitForForeground(){return visitStamp>0&&visitOwner===token()&&current()?Promise.resolve(current()):visit()}
async function forGreeting(){
 if(visitPending&&visitOwner===token())return visitPending
 if(visitOwner===token()&&current()&&Date.now()-visitStamp>=0&&Date.now()-visitStamp<2000)return current()
 return load()
}
function greetingArt(period){return ['evening','late'].includes(period)?'/assets/rewards/good-night.png':'/assets/rewards/good-day.png'}
module.exports={load,mutate,reset,current,subscribe,capacityReached,greetingArt,visit,visitIfNeeded,forGreeting,foreground,visitForForeground}
