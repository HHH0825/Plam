function (input) {
  const app = getApp(), api = require('./utils/api');
  const required = ['free_quota_verified','cos_attribution_verified','existing_cls_logs_verified','current_qps_limit_verified','paid_overflow_disabled_verified'];
  if (!input || !required.every(k=>input[k]===true) || !Number.isFinite(input.qps) || input.qps<=0 || input.qps>100) return {blocked:true,reason:'PREFLIGHT_UNVERIFIED'};
  if (!app.globalData.token || !app.globalData.user?.id) return {blocked:true,reason:'REAL_LOGIN_REQUIRED'};
  if (!Number.isInteger(input.calls_remaining) || input.calls_remaining<710 || input.calls_remaining>2000) return {blocked:true,reason:'QUOTA_UNVERIFIED'};
  if (!/^\d{8}$/.test(input.round||'') || !Array.isArray(input.test_items) || input.test_items.length!==10 ||
      new Set(input.test_items).size!==10 || !input.test_items.every(id=>Number.isSafeInteger(id)&&id>0)) return {blocked:true,reason:'TEST_MANIFEST_REQUIRED'};
  if (app._stabilityRunning) return {blocked:true,reason:'ROUND_ALREADY_RUNNING'};
  const token=app.globalData.token, owner=app.globalData.user.id, started=Date.now(), interval=Math.ceil(1000/input.qps);
  const ledgerKey='palmAcceptanceBudget:'+input.round;
  let ledger;
  try {
    ledger=wx.getStorageSync(ledgerKey)||{calls:2000-input.calls_remaining};
    if(!Number.isInteger(ledger.calls)||ledger.calls<0||ledger.calls>2000) return {blocked:true,reason:'BUDGET_LEDGER_INVALID'};
    ledger.calls=Math.max(ledger.calls,2000-input.calls_remaining);
    wx.setStorageSync(ledgerKey,ledger);
  } catch(_){return {blocked:true,reason:'BUDGET_LEDGER_UNAVAILABLE'};}
  const maxCalls=Math.min(1600-ledger.calls,input.calls_remaining-400);
  if(maxCalls<310) return {blocked:true,reason:'CLEANUP_RESERVE_REQUIRED'};
  const state={phase:'verify_test_items',scope:'native_sdk_reads_and_writes',sent:0,completed:0,errors:0,final_failures:0,retries:0,
    samples:[],stages:[],stopped:false,real_accounts:1,logical_clients_only:true,round:input.round};
  const items=[];
  let nextStart=started, issueQueue=Promise.resolve(), serial=0;
  const stop=()=>state.stopped=true;
  app._stability=state;app._stabilityRunning=true;app._stabilityStop=stop;
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function issue(path,options,kind,clients,attempt=0){
    const gate=issueQueue.then(async()=>{
      await wait(Math.max(0,nextStart-Date.now()));
      if(state.stopped||token!==app.globalData.token||owner!==app.globalData.user?.id||Date.now()-started>=3600000||state.sent>=maxCalls) throw Error('STOPPED');
      nextStart=Date.now()+interval;
      const latest=wx.getStorageSync(ledgerKey);
      if(!latest||!Number.isInteger(latest.calls)||latest.calls>=1600) throw Error('STOPPED');
      latest.calls++;wx.setStorageSync(ledgerKey,latest);state.sent++;if(attempt)state.retries++;
    });
    issueQueue=gate.catch(()=>{});await gate;
    const begin=Date.now();
    try{
      const result=await api.request(path,options);
      state.completed++;state.samples.push({kind,clients,ms:Date.now()-begin,ok:true,at:Date.now()-started,attempt});return result;
    }catch(error){
      state.completed++;state.errors++;
      state.samples.push({kind,clients,ms:Date.now()-begin,ok:false,status:Number.isInteger(error.status)?error.status:0,at:Date.now()-started,attempt});
      const minute=state.samples.filter(s=>s.at>=Date.now()-started-60000);
      if(error.status===401||error.code==='ITEM_VERSION_CONFLICT'||(Date.now()-started>=60000&&minute.filter(s=>!s.ok).length/minute.length>.05)) stop();
      throw error;
    }
  }
  async function operation(path,options,kind,clients){
    try{return await issue(path,options,kind,clients);}
    catch(error){
      if(state.stopped||error.message==='STOPPED'){stop();return null;}
      if(!state.stopped&&(!error.status||error.status>=500||error.retrySameRequest===true)){
        await wait(interval);
        try{return await issue(path,options,kind,clients,1);}catch(_){state.final_failures++;return null;}
      }
      state.final_failures++;return null;
    }
  }
  (async()=>{
    try{
      for(const id of input.test_items){
        const item=await issue('/items/'+id,{},'manifest',1);
        if(!item||item.id!==id||!String(item.name).startsWith('qa-'+input.round+'-')||!Number.isSafeInteger(item.revision)) throw Error('STOPPED');
        items.push(item);
      }
      for(const clients of [1,2,5,10]){
        if(state.stopped) break;
        const before=state.sent;state.phase='clients_'+clients;
        await Promise.all(Array.from({length:clients},async(_,worker)=>{
          for(let job=worker;job<75&&!state.stopped;job+=clients){
            if(job<50) await operation('/items',{},'read',clients);
            else{
              const item=items[worker], target=!item.is_pinned;
              const options={method:'PUT',data:{is_pinned:target},revision:item.revision,
                requestId:'qa-'+input.round+'-'+started.toString(36)+'-'+(++serial)};
              const result=await operation('/items/'+item.id+'/pin',options,'write',clients);
              if(result){if(result.id!==item.id||result.revision!==item.revision+1){stop();throw Error('STOPPED');} items[worker]=result;}
              else{stop();break;}
            }
          }
        }));
        state.stages.push({logical_clients:clients,issued:state.sent-before});
      }
      state.phase=state.stopped?'stopped':'complete';
    }catch(_){state.stopped=true;state.phase='stopped';}
    finally{app._stabilityRunning=false;app._stabilityStop=null;}
  })();
  return {started:true,planned_business_calls:310,cleanup_reserve_calls:400,real_accounts:1,logical_clients_only:true};
}
