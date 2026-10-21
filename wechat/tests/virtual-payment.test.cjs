const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto')
const {createHandler}=require('../deploy/cloudbase/pay-notify')
const id='P'+'a'.repeat(30),other='P'+'b'.repeat(30)
function harness(){
 const app={globalData:{token:'alice',user:{id:1}}},storage=new Map(),calls=[],payCalls=[],loginCalls=[],module={exports:{}}
 let platform='ios',version='8.0.68',sdk='2.19.2',supported=true,payResult='success',handler
 const signed=JSON.stringify({offerId:'123',buyQuantity:1,env:0,currencyType:'CNY',productId:'quarter',goodsPrice:990,outTradeNo:id,attach:'attach'})
 const payment={signData:signed,mode:'short_series_goods',paySig:'a'.repeat(64),signature:'b'.repeat(64)}
 const api={request:async(path,options)=>{calls.push({path,options});if(handler)return handler(path,options);if(path==='/pay/orders')return {orders:[]};if(path==='/pay/order')return {order:{id,price_cents:990},payData:payment};return {order:{id,status:'fulfilled'}}}}
 const wx={getAppBaseInfo:()=>({version,SDKVersion:sdk}),getDeviceInfo:()=>({platform}),canIUse:()=>supported,
  getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),login:o=>{loginCalls.push(o);o.success({code:'fresh-code'})},
  requestVirtualPayment:o=>{payCalls.push(o);if(payResult==='success')o.success({});else o.fail({errMsg:payResult})}}
 vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/pages/membership/lib/virtual-payment'),'utf8'),{module,require:n=>n.endsWith('/api')?api:n.endsWith('/payment-platform')?{platform:()=>['android','ios'].includes(platform)?platform:''}:{serviceScope:()=> 'service'},getApp:()=>app,wx,Map,JSON,Number,Error,Promise,String,setTimeout:fn=>setImmediate(fn)})
 return {payment:module.exports,app,storage,calls,payCalls,loginCalls,payData:payment,wx,setDevice:(p,v=version,s=sdk)=>{platform=p;version=v;sdk=s},support:x=>supported=x,result:x=>payResult=x,respond:fn=>handler=fn}
}
test('iOS minimum equality and newer clients pass; old iOS, old SDK, unavailable API and devtools stop before ordering',async()=>{
 for(const version of ['8.0.68','8.0.69','8.1.0','9.0.0']){const h=harness();h.setDevice('ios',version);assert.equal((await h.payment.buy('quarter',true,990)).kind,'confirmed')}
 for(const [platform,version,sdk,ios] of [['ios','8.0.67','3.0.0',true],['ios','8.0.68','3.0.0',false],['android','8.0.70','2.19.1',true],['devtools','8.0.70','3.0.0',true]]){
  const h=harness();h.setDevice(platform,version,sdk);await assert.rejects(h.payment.buy('quarter',ios));assert.equal(h.calls.length,0);assert.equal(h.loginCalls.length,0)
 }
 const h=harness();h.support(false);await assert.rejects(h.payment.buy('quarter',true,990));assert.equal(h.calls.length,0)
})
test('Android checkout has no iOS gate and passes original signed JSON unchanged',async()=>{
 const h=harness();h.setDevice('android','8.0.10');await h.payment.buy('quarter',false,990)
 assert.equal(h.payCalls[0].signData,h.payData.signData);assert.equal(h.calls.find(c=>c.path==='/pay/order').options.data.code,'fresh-code')
 assert.equal(h.app.globalData.membership,undefined)
 assert.equal([...h.storage.values()].some(v=>String(v).includes('signData')),false)
})

test('checkout refuses a stale displayed price before launching a real payment',async()=>{
 const h=harness();h.setDevice('android');await assert.rejects(h.payment.buy('month',false,1),/价格已更新/)
 assert.equal(h.payCalls.length,0)
})

test('one-fen test order uses the exact server signature and still requires verified delivery',async()=>{
 const h=harness();h.setDevice('android');h.payData.signData=JSON.stringify({...JSON.parse(h.payData.signData),goodsPrice:1,productId:'cat_test_month'})
 h.respond(path=>path==='/pay/orders'?{orders:[]}:path==='/pay/order'?{order:{id,price_cents:1},payData:h.payData}:{order:{id,status:'fulfilled'}})
 assert.equal((await h.payment.buy('month',false,1)).kind,'confirmed')
 assert.equal(JSON.parse(h.payCalls[0].signData).goodsPrice,1)
})
test('double tap shares one checkout, one login and one platform call',async()=>{
 const h=harness(),one=h.payment.buy('quarter',true,990),two=h.payment.buy('month',true)
 assert.equal(one,two);await one;assert.equal(h.loginCalls.length,1);assert.equal(h.payCalls.length,1)
})
test('client success alone leaves pending state and retains only the order ID',async()=>{
 const h=harness();h.respond((path)=>path==='/pay/orders'?{orders:[]}:path==='/pay/order'?{order:{id,price_cents:990},payData:h.payData}:{order:{id,status:'pending'}})
 assert.equal((await h.payment.buy('quarter',true,990)).kind,'pending')
 assert.deepEqual([...h.storage.values()],[id]);assert.equal(h.app.globalData.membership,undefined)
})
test('cancel shows cancellation without simulating a successful membership',async()=>{
 const h=harness();h.result('requestVirtualPayment:fail cancel');assert.equal((await h.payment.buy('quarter',true,990)).kind,'cancelled')
 assert.equal(h.calls.some(c=>c.path==='/pay/query'),false);assert.equal(h.app.globalData.membership,undefined)
})
test('network failure after payment retains recovery order and never starts another payment',async()=>{
 const h=harness();h.respond(path=>{if(path==='/pay/orders')return {orders:[]};if(path==='/pay/order')return {order:{id,price_cents:990},payData:h.payData};throw Error('offline')})
 await assert.rejects(h.payment.buy('quarter',true,990),/offline/);assert.deepEqual([...h.storage.values()],[id])
 await assert.rejects(h.payment.buy('quarter',true,990),/offline/);assert.equal(h.payCalls.length,1)
})

test('failed native call and failed query show separate safe codes and keep the original order',async()=>{
 const h=harness();h.setDevice('android')
 h.wx.requestVirtualPayment=o=>{h.payCalls.push(o);o.fail({errCode:-123,errMsg:'invalid paySig '+h.payData.paySig+' signature='+h.payData.signature})}
 h.respond(path=>{if(path==='/pay/orders')return {orders:[]};if(path==='/pay/order')return {order:{id,price_cents:990},payData:h.payData};throw Error('查询微信订单；微信错误码268490003')})
 await assert.rejects(h.payment.buy('quarter',false,990),e=>{
  assert.match(e.message,/支付错误码-123/);assert.match(e.message,/268490003/);assert.match(e.message,/invalid paySig/);assert.equal(e.message.includes(h.payData.paySig),false);assert.equal(e.message.includes(h.payData.signature),false);return true
 })
 assert.deepEqual([...h.storage.values()],[id]);assert.equal(h.payCalls.length,1)
})

test('failed native callback still trusts independently verified fulfillment',async()=>{
 const h=harness();h.result('requestVirtualPayment:fail unknown')
 assert.equal((await h.payment.buy('quarter',true,990)).kind,'confirmed')
 assert.equal(h.app.globalData.membership,undefined)
})

test('failed native call with unpaid query never pretends payment was submitted',async()=>{
 const h=harness();h.result('requestVirtualPayment:fail unknown')
 h.respond(path=>path==='/pay/orders'?{orders:[]}:path==='/pay/order'?{order:{id,price_cents:990},payData:h.payData}:{order:{id,status:'pending',can_purchase_again:true}})
 await assert.rejects(h.payment.buy('quarter',true,990),/微信支付调用未完成/)
 assert.deepEqual([...h.storage.values()],[id])
})

test('authorized absent test order permits one new manual attempt and reveals native failure without secrets',async()=>{
 const h=harness();h.setDevice('android');h.storage.set('palmPayment:service:1',other)
 h.wx.requestVirtualPayment=o=>{h.payCalls.push(o);o.fail({errCode:-9,errMsg:'invalid productId session_key="small-secret" '+h.payData.signData})}
 h.respond((path,options)=>{
  if(path==='/pay/query')return {order:{id:options.data.out_trade_no,status:'pending',lookup_state:'not_found',can_purchase_again:options.data.out_trade_no===other}}
  if(path==='/pay/order')return {order:{id,price_cents:990},payData:h.payData}
  return {orders:[]}
 })
 await assert.rejects(h.payment.buy('quarter',false,990),e=>{
  assert.match(e.message,/支付错误码-9/);assert.match(e.message,/invalid productId/);assert.equal(e.message.includes(h.payData.signData),false);assert.doesNotMatch(e.message,/small-secret/);return true
 })
 assert.equal(h.payCalls.length,1);assert.deepEqual([...h.storage.values()],[id])
})

test('synchronous native failure also preserves its safe explanation',async()=>{
 const h=harness();h.setDevice('android');h.wx.requestVirtualPayment=()=>{throw Error('invalid mode')}
 h.respond(path=>path==='/pay/orders'?{orders:[]}:path==='/pay/order'?{order:{id,price_cents:990},payData:h.payData}:{order:{id,status:'pending',lookup_state:'not_found'}})
 await assert.rejects(h.payment.buy('quarter',false,990),/invalid mode/)
})
test('reopened client recovers from server orders even if the create response was lost',async()=>{
 const h=harness();h.respond(path=>path==='/pay/orders'?{orders:[{id,status:'pending'}]}:{order:{id,status:'fulfilled'}})
 assert.equal((await h.payment.checkPending()).status,'fulfilled');assert.equal(h.payCalls.length,0);assert.equal(h.loginCalls.length,0)
})
test('account change while wx.login resolves cannot order or launch payment',async()=>{
 const h=harness();h.wx.login=o=>{h.app.globalData.token='bob';o.success({code:'fresh'})}
 await assert.rejects(h.payment.buy('quarter',true,990),/账户已切换/);assert.equal(h.payCalls.length,0);assert.equal(h.calls.some(c=>c.path==='/pay/order'),false)
})
test('unknown pending order blocks new purchase and malformed signed parameters never launch',async()=>{
 const h=harness();h.respond(path=>path==='/pay/orders'?{orders:[{id,status:'pending'}]}:{order:{id,status:'pending'}})
 await assert.rejects(h.payment.buy('quarter',true,990),/待确认/);assert.equal(h.loginCalls.length,0)
 const broken=harness();broken.payData.signData=JSON.stringify({outTradeNo:other,env:1,goodsPrice:1})
 await assert.rejects(broken.payment.buy('quarter',true,990),/参数异常/);assert.equal(broken.payCalls.length,0)
})
const env={PALM_PAY_RELAY_URL:'https://cloud1-test-123.ap-shanghai.app.tcloudbase.com/palm/payments/wechat/notify',PALM_PAY_RELAY_HOST:'cloud1-test-123.ap-shanghai.app.tcloudbase.com',PALM_PAY_NOTIFY_SECRET:'n'.repeat(48)}

test('iOS checkout submits its terminal and exact displayed server price',async()=>{
 const h=harness();h.payData.signData=JSON.stringify({...JSON.parse(h.payData.signData),goodsPrice:1150,productId:'ios_quarter'})
 h.respond(path=>path==='/pay/orders'?{orders:[]}:path==='/pay/order'?{order:{id,price_cents:1150,platform:'ios'},payData:h.payData}:{order:{id,status:'fulfilled'}})
 await h.payment.buy('quarter',true,1150)
 const data=h.calls.find(r=>r.path==='/pay/order').options.data
 assert.equal(data.platform,'ios');assert.equal(data.expected_price_cents,1150)
})

test('relay total deadline aborts a connection that never produces a response',async()=>{
 const {EventEmitter}=require('node:events');let expiry,delay,destroyed=false
 const req=new EventEmitter();req.end=()=>{};req.destroy=error=>{destroyed=true;req.emit('error',error)}
 const exports={}
 vm.runInNewContext(fs.readFileSync(require.resolve('../deploy/cloudbase/pay-notify'),'utf8'),{exports,require:n=>n==='node:https'?{request:()=>req}:crypto,process:{env},URL,Buffer,Date,console:{warn(){}},setTimeout:(fn,ms)=>{expiry=fn;delay=ms;return 1},clearTimeout(){}})
 const promise=exports.main({Type:'Timer',TriggerName:'palm-pay-reconcile'});assert.equal(delay,2500);expiry()
 assert.equal((await promise).ErrCode,1);assert.equal(destroyed,true)
})
test('cloud event relay signs exact raw JSON and acknowledges only backend confirmation',async()=>{
 let sent
 const receive=createHandler(env,async(url,raw,headers)=>{sent={url,raw,headers};return {ErrCode:0}},()=>1800000000)
 const event={Event:'xpay_goods_deliver_notify',OpenId:'owner',OutTradeNo:id,Env:0}
 assert.equal((await receive(event)).ErrCode,0)
 assert.equal(sent.headers['X-Palm-Pay-Signature'],crypto.createHmac('sha256',env.PALM_PAY_NOTIFY_SECRET).update('1800000000\n'+sent.raw).digest('hex'))
 const failed=createHandler(env,async()=>({ErrCode:1}));assert.equal((await failed(event)).ErrCode,1)
 const timeout=createHandler(env,async()=>{throw Error('secret error')});assert.equal((await timeout(event)).ErrMsg,'payment_unconfirmed')
})
test('relay rejects unsupported currency, subscription, malformed events and arbitrary destinations',async()=>{
 let calls=0;const receive=createHandler(env,async()=>{calls++;return {ErrCode:0}})
 for(const Event of ['xpay_coin_pay_notify','xpay_subscribe_signing_result_notify','anything'])assert.equal((await receive({Event,Env:0,OutTradeNo:id,OpenId:'owner'})).ErrCode,1)
 assert.equal((await receive({Event:'xpay_goods_deliver_notify',Env:1,OutTradeNo:id,OpenId:'owner'})).ErrCode,1);assert.equal(calls,0)
 assert.equal((await createHandler({...env,PALM_PAY_RELAY_URL:'https://evil.test/'})( {Type:'Timer',TriggerName:'palm-pay-reconcile'})).ErrCode,1)
})
test('timer forwards only reconciliation action and refund callback uses same verification relay',async()=>{
 const bodies=[],receive=createHandler(env,async(_url,raw)=>{bodies.push(JSON.parse(raw));return {ErrCode:0}})
 assert.equal((await receive({Type:'Timer',TriggerName:'palm-pay-reconcile'})).ErrCode,0)
 assert.deepEqual(bodies[0],{action:'reconcile'})
 assert.equal((await receive({Event:'xpay_refund_notify',Env:0,OpenId:'owner',OutTradeNo:id})).ErrCode,0)
})
