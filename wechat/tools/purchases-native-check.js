function(action) {
  const app=getApp();
  if(action==='restore') {
    if(app._purchasesQA){wx.cloud.callHTTPFunction=app._purchasesQA.original;delete app._purchasesQA;}
    return {restored:true};
  }
  if(action.indexOf('mode:')===0 && app._purchasesQA) {app._purchasesQA.mode=action.slice(5);return {mode:app._purchasesQA.mode,remoteWrites:0};}
  if(action==='setup') {
    if(app._purchasesQA)return {active:true};
    const item={id:990001,name:'旅行相机',category:'数码',icon_type:'digital',status:'active',purchase_date:'2026-01-31',purchase_price:'1299.00',notes:'轻装出门',holding_days:252,net_cost:'1329.00',daily_net_cost:'5.27',daily_purchase_cost:'5.15',fixed_expense_total:'30.00',maintenance_total:'0.00',disposal_proceeds:'0.00',photo_url:null,is_pinned:false,revision:0,maintenance_records:[],usage_records:[],disposal:null,milestones:{earned:[],next:null},daily_target:null};
    const wish={id:990041,name:'便携降噪耳机',category:'数码',reason:'通勤时想安静听歌，先看看现在的耳机还能不能用。',expected_price:'399.00',review_on:'2026-10-15',review_days:5,status:'considering',created_on:'2026-10-10',revision:0,similar_items:[{...item,match_reason:'分类相同'}]};
    const payment={id:990061,paid_on:'2026-10-01',due_on:'2026-10-01',amount:'30.00',principal:'0.00',item_id:item.id,item_name:item.name,item_available:true,voided:false,notes:'本月续费'};
    const expense={id:990051,name:'照片云空间',kind:'subscription',status:'active',amount:'30.00',cycle:'month',cycle_days:1,anchor_on:'2026-10-01',service_from:'2026-10-01',service_until:'2026-10-14',next_due_on:'2026-11-01',due_days:22,remaining_days:4,principal_total:'0.00',remaining_principal:'0.00',paid_principal:'0.00',suggested_principal:'0.00',paid_periods:1,paid_cost:'30.00',item_id:item.id,item_name:item.name,item_available:true,check_renewal:false,completed:false,next_cycle_index:1,revision:1,notes:'只在确认付款后记账',payments:[payment]};
    const qa={original:wx.cloud.callHTTPFunction,item,wish,expense,calls:[],writes:0};app._purchasesQA=qa;
    wx.cloud.callHTTPFunction=function(spec){
      const route=spec.path.split('?')[0].replace('/api/mp',''),method=spec.method.toUpperCase();qa.calls.push({route,method});if(method!=='GET')qa.writes++;
      let statusCode=200,data;
      if(method!=='GET') {statusCode=400;data={error:'界面验证仅使用本机示例，本次操作没有写入云端。'};}
      else if(route==='/items')data=[item,{...item,id:990002,name:'每天陪我的水杯',category:'日用品',icon_type:'daily',purchase_price:'89.00',net_cost:'89.00',daily_net_cost:'0.35',fixed_expense_total:'0.00'},{...item,id:990003,name:'周末看的书',category:'阅读',icon_type:'books',status:'idle',purchase_price:'59.00',net_cost:'59.00',daily_net_cost:'0.23'}];
      else if(route==='/items/'+item.id)data=item;
      else if(route==='/wishlist')data=[wish,{...wish,id:990042,name:'床头阅读灯',category:'家居',expected_price:'',reason:'晚上读书更舒服',review_on:null,review_days:null}];
      else if(route==='/wishlist/'+wish.id)data=wish;
      else if(route==='/fixed-expenses')data={plans:[expense,{...expense,id:990052,name:'电脑分期',kind:'installment',amount:'8.00',planned_payment:'508.00',principal_total:'6000.00',remaining_principal:'4000.00',paid_principal:'2000.00',suggested_principal:'500.00',periods:12,paid_periods:4,next_due_on:'2026-10-10',due_days:0,remaining_days:null,paid_cost:'32.00'}],totals:{cents:'62.00',linked_cents:'62.00',unlinked_cents:'0.00',principal_cents:'2000.00'}};
      else if(route==='/fixed-expenses/'+expense.id)data=expense;
      else {statusCode=404;data={error:'本机界面示例未定义此路径'};}
      if(method==='GET' && ((qa.mode==='unavailable' && route==='/fixed-expenses') || (qa.mode==='deleted' && route==='/fixed-expenses/'+expense.id))){statusCode=404;data={error:'记录不存在'};}
      if(method==='GET' && qa.mode==='items-error' && route==='/items'){statusCode=503;data={error:'网络暂不可用'};}
      if(method==='GET' && qa.mode==='empty' && route==='/fixed-expenses')data={plans:[],totals:{cents:'0.00',linked_cents:'0.00',unlinked_cents:'0.00',principal_cents:'0.00'}};
      const response={statusCode:200,data:JSON.stringify({palm_http:1,statusCode,data}),header:{}};
      setTimeout(()=>{if(spec.success)spec.success(response);if(spec.complete)spec.complete(response);},0);return Promise.resolve(response);
    };
    return {active:true,remoteWrites:0};
  }
  const page=getCurrentPages().slice(-1)[0],qa=app._purchasesQA;
  return {route:page.route,busy:page.data.busy,editing:page.data.editing,paying:page.data.paying,shown:page.data.shown?.length,error:page.data.error,fixtureRequests:qa?.calls,remoteWrites:0};
}
