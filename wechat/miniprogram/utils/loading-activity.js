// One request lifecycle, independent of page/account timers and visual components.
const tasks=new Map(),listeners=new Set();let seq=0
function snapshot(){return [...tasks.values()]}
function notify(){const rows=snapshot();for(const fn of listeners)try{fn(rows)}catch(_){}}
function begin(path,method,token){const id=++seq;tasks.set(id,{path,method,token});notify();let done=false;return()=>{if(done)return;done=true;tasks.delete(id);notify()}}
function subscribe(fn){listeners.add(fn);fn(snapshot());return()=>listeners.delete(fn)}
module.exports={begin,subscribe,snapshot}
