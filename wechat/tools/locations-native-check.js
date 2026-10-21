function(action) {
  const app=getApp(),qa=app._locationsQA;
  if(action==='measure')return new Promise(resolve=>wx.createSelectorQuery().in(getCurrentPages().slice(-1)[0]).select('.storage-page').boundingClientRect().selectAll('.location-row,.stored-item').boundingClientRect().select('.storage-create').boundingClientRect().exec(result=>resolve({pageWidth:result[0]?.width,rowWidths:result[1]?.map(r=>r.width),createWidth:result[2]?.width})));
  if(action==='restore') {if(qa){wx.cloud.callHTTPFunction=qa.original;wx.showModal=qa.modal;delete app._locationsQA;}return {restored:true,remoteWrites:0};}
  if(action==='setup') {
    if(qa)return {active:true,remoteWrites:0};
    if(!app._purchasesQA)throw Error('Install the read-only baseline fixture first');
    const sample=app._purchasesQA.item,state={original:wx.cloud.callHTTPFunction,modal:wx.showModal,mode:'normal',calls:[],writes:0,locations:[{id:990101,name:'书桌抽屉',revision:0},{id:990102,name:'衣柜上层',revision:0}],items:[{...sample,storage_location_id:990101,storage_location_name:'书桌抽屉'},{...sample,id:990002,name:'每天陪我的水杯',icon_type:'daily',category:'日用品',storage_location_id:null,storage_location_name:null},{...sample,id:990003,name:'周末读的书',icon_type:'books',category:'阅读',status:'idle',storage_location_id:990101,storage_location_name:'书桌抽屉'}]};
    app._locationsQA=state;
    /* Only confirmations in this isolated memory fixture are auto-accepted. */
    wx.showModal=function(spec){setTimeout(()=>spec.success?.({confirm:true,cancel:false}),0);};
    wx.cloud.callHTTPFunction=function(spec){
      const route=spec.path.split('?')[0].replace('/api/mp',''),method=spec.method.toUpperCase();let data,statusCode=200;
      if(!route.startsWith('/storage-locations')&&route!=='/items'&&!/^\/items\/99000[123]$/.test(route))return state.original.call(wx.cloud,spec);
      state.calls.push({route,method});
      if(method==='GET'&&route==='/items')data=state.items;
      else if(method==='GET'&&route.startsWith('/items/'))data=state.items.find(i=>i.id===Number(route.split('/').pop()));
      else if(method==='GET'&&route==='/storage-locations'){
        if(state.mode==='unavailable'){statusCode=404;data={error:'记录不存在'};}
        else data={locations:state.locations.map(l=>({...l,count:state.items.filter(i=>i.storage_location_id===l.id).length})),unassigned_count:state.items.filter(i=>!i.storage_location_id).length};
      }else if(method==='POST'&&route==='/storage-locations/assign'){
        state.writes++;const body=typeof spec.data==='string'?JSON.parse(spec.data):spec.data;
        if(state.mode==='conflict'){statusCode=409;data={error:'物品已更新，请刷新核对',code:'ITEM_VERSION_CONFLICT',retry_same_request:false};}
        else if(!body.items.every(e=>state.items.some(i=>i.id===e.id&&i.revision===e.revision))){statusCode=409;data={error:'版本已变化',code:'ITEM_VERSION_CONFLICT',retry_same_request:false};}
        else {const location=state.locations.find(l=>l.id===body.storage_location_id);const moved=[];body.items.forEach(e=>{const i=state.items.find(i=>i.id===e.id);i.storage_location_id=location?.id||null;i.storage_location_name=location?.name||null;i.revision++;moved.push({id:i.id,revision:i.revision,storage_location_id:i.storage_location_id,storage_location_name:i.storage_location_name});});data={items:moved};}
      }else {statusCode=400;data={error:'本机验证未启用此写操作'};}
      const response={statusCode:200,data:JSON.stringify({palm_http:1,statusCode,data}),header:{}};
      setTimeout(()=>{spec.success?.(response);spec.complete?.(response);},0);return Promise.resolve(response);
    };
    return {active:true,remoteWrites:0};
  }
  if(action.indexOf('mode:')===0&&qa){qa.mode=action.slice(5);return {mode:qa.mode};}
  return {mode:qa?.mode,calls:qa?.calls,memoryWrites:qa?.writes,remoteWrites:0};
}
