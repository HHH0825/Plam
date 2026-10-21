// This separate simulator project accepts fake accounts and never calls deployed services.
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'../../test-results/beauty-icons-project'),out=path.resolve(__dirname,'../../test-results/subscriptions-native-project')
fs.mkdirSync(out,{recursive:true});fs.cpSync(root,out,{recursive:true})
const config=JSON.parse(fs.readFileSync(path.join(out,'project.config.json'),'utf8'));config.projectname='订阅分期隔离验收';config.condition={};fs.writeFileSync(path.join(out,'project.config.json'),JSON.stringify(config,null,2))
fs.writeFileSync(path.join(out,'config.js'),`module.exports={API_TRANSPORT:'local_http',API_BASE:'http://127.0.0.1:9',DEV_LOGIN:false,CLOUD_PHOTOS_ENABLED:false}`)
const base=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../test-results/member-fixture.json'),'utf8')).responses
base['/auth/me'].capabilities.fixed_expense_quick_add=1
base['/items']=[];base['/ledger/settings']={enabled:true};base['/fixed-expenses']={plans:[],totals:{cents:'0.00',linked_cents:'0.00',unlinked_cents:'0.00',principal_cents:'0.00'}}
fs.writeFileSync(path.join(out,'qa-fixture.js'),'module.exports='+JSON.stringify(base))
fs.writeFileSync(path.join(out,'app.js'),`App({globalData:{token:'isolated-subscriptions-native',expiresAt:4102444800,user:require('./qa-fixture')['/auth/me'].user,qaRequests:[]},_foreground:true,requireSession(){return true},hasSession(){return true}})`)
fs.copyFileSync(path.join(out,'utils/api.js'),path.join(out,'utils/api-original.js'))
fs.writeFileSync(path.join(out,'utils/api.js'),`const real=require('./api-original'),base=require('../qa-fixture');const clone=x=>JSON.parse(JSON.stringify(x));let plan=null,receipts={};
async function request(url,o={}){const app=getApp();if(!app.globalData.token.startsWith('isolated-subscriptions-'))throw Error('Offline fake accounts only');const method=o.method||'GET';app.globalData.qaRequests.push({url,method,data:o.data,requestId:o.requestId});
if(url==='/fixed-expenses'&&method==='POST'){if(receipts[o.requestId])return clone(receipts[o.requestId]);const d=o.data,p=d.initial_payment;plan={...clone(d),id:9901,revision:p?1:0,next_cycle_index:p?1:0,next_due_on:p?'2026-11-21':d.anchor_on,paid_cost:p?p.amount:'0.00',paid_principal:p?p.principal:'0.00',principal_total:d.principal_total||'0.00',remaining_principal:'5500.00',suggested_principal:'500.00',paid_periods:p?1:0,completed:false,initial_payment_created:!!p,initial_payment_id:p?9902:null,payments:p?[{...p,id:9902,kind:d.kind,cycle_index:0,due_on:d.anchor_on,voided:false}]:[]};receipts[o.requestId]=clone(plan);return clone(plan)}
if(url==='/fixed-expenses/9901'&&method==='GET')return clone(plan);
if(url==='/fixed-expenses'&&method==='GET')return {plans:plan?[clone(plan)]:[],totals:clone(base[url].totals)};
if(url.startsWith('/ledger/entries/')){const row={id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',kind:'expense',source:'installment',source_name:'分期付款',source_id:9902,expense_id:9901,name:'手机分期',amount:'505.00',principal:'500.00',cost:'5.00',occurred_on:'2026-10-20',created_at:'2026-10-21T04:30:00+00:00',category:'installment',category_name:'分期',state:app.globalData.qaDeleted?'void':'active',editable:false,deletable:!app.globalData.qaDeleted,refunds:[],changes:app.globalData.qaDeleted?[{}]:[],revision:app.globalData.qaDeleted?1:0};if(method==='DELETE'){app.globalData.qaDeleted=true;row.state='void';row.deletable=false;row.revision=1;if(plan){plan.payments[0].voided=true;plan.paid_cost='0.00';plan.paid_principal='0.00';plan.next_cycle_index=0;plan.next_due_on=plan.anchor_on;plan.revision++}}return row}
if(method!=='GET')throw Error('No real mutations in offline fixture');const route=url.split('?')[0],r=base[url]||base[route];if(r===undefined)throw Error('Missing offline fixture '+url);return clone(r)}
module.exports={...real,request};`)
console.log(JSON.stringify({project:out,offline:true,productionCalls:0}))
