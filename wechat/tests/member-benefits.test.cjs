const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module')
const content=require('../miniprogram/pages/member-benefits/lib/member-benefits')
function harness(){
 let definition,response=async()=>({supported:true,plans:[]});const app={globalData:{token:'alice'},requireSession:()=>true},calls=[]
 const file=require.resolve('../miniprogram/pages/member-benefits/index'),local=createRequire(file)
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:n=>n.endsWith('/member')?{wrap:d=>d,load:()=>response()}:n.endsWith('/navigation')?{resetNavigation(){}}:local(n),Page:d=>definition=d,getApp:()=>app,getCurrentPages:()=>[{route:'pages/membership/index'},{route:'pages/member-benefits/index'}],wx:{navigateBack:o=>calls.push(o),redirectTo:o=>calls.push(o),showToast(){}},console})
 const page={...definition,data:structuredClone(definition.data),_visible:true,setData(p){Object.assign(this.data,p)}}
 return {page,app,calls,respond:f=>response=f}
}
test('both editions share real free capabilities and member extras exclude the retired calendar',()=>{
 assert.equal(content.freeFeatures.length,9);assert.equal(content.memberFeatures.length,2);assert.equal(content.memberFeatures[0],'免小程序内广告');assert.ok(content.freeFeatures.includes('订阅／分期记录'));assert.ok(!content.memberFeatures.some(x=>x.includes('账单日历')));assert.match(content.introduction.join(''),/免费版就能陪你完成/)
})
test('comparison is readable without prices and late response cannot restore another account catalog',async()=>{
 const h=harness();let finish;h.respond(()=>new Promise(r=>finish=r));const request=h.page.load();h.app.globalData.token='bob';finish({supported:true,plans:[{name:'old-user',months:1,price_cents:390}]});await request;assert.equal(h.page.data.freeFeatures.length,9);assert.doesNotMatch(h.page.data.service.catalog,/old-user/)
})
test('comparison failures keep public content and never initiate a payment',async()=>{
 const h=harness();h.respond(async()=>{throw Error('offline')});await h.page.load();assert.match(h.page.data.catalogError,/读取失败/);assert.equal(h.page.data.memberFeatures.length,2);assert.equal(h.calls.length,0);h.page.toggleService();assert.equal(h.page.data.serviceExpanded,true);h.page.returnMembership();assert.equal(h.calls.length,1);assert.equal(h.calls[0].delta,1)
})
test('service terms use live terminal catalog and remove only the requested refund paragraph',()=>{
 const r=content.service({supported:true,plans:[{id:'month',name:'月会员',months:1,price_cents:290}]});assert.match(r.catalog,/2\.90/);assert.doesNotMatch(r.catalog,/29\.90/);assert.match(r.terms.join(''),/赠送会员同样适用/);assert.doesNotMatch(r.terms.join(''),/安卓退款|App Store|其他有效授权保留/);assert.equal(r.terms.length,3);assert.match(r.terms.join(''),/付款后由服务器核实/);assert.match(r.terms.join(''),/到期不会删除已有记录/)
})
