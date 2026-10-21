// Extend the existing guarded offline harness; never alter release files.
require('./prepare-beauty-icons-sandbox.cjs')
const fs=require('node:fs'),path=require('node:path'),dir=path.resolve(__dirname,'../../test-results/beauty-icons-native-project')
const fixture=require(path.join(dir,'qa-fixture.js')),item={id:1,name:'隔离验收的物品',category:'数码',icon_type:'digital',cover_mode:'icon',cover_icon_key:'phone',purchase_price:'100.00',purchase_date:'2026-10-01',status:'active',net_cost:'100.00',daily_net_cost:'1.00',daily_purchase_cost:'1.00',holding_days:18,maintenance_records:[],usage_records:[],maintenance_total:'0.00',fixed_expense_total:'0.00',disposal_proceeds:'0.00',notes:''}
Object.assign(fixture,{'/items':[item],'/items/1':item,'/fixed-expenses':{plans:[],totals:{amount:'0.00'}},'/storage-locations':{locations:[],unassigned_count:1}})
fs.writeFileSync(path.join(dir,'qa-fixture.js'),'module.exports='+JSON.stringify(fixture))
const api=path.join(dir,'utils/api.js');fs.writeFileSync(api,fs.readFileSync(api,'utf8').replace("if(action!=='GET')throw", "if(url==='/auth/logout'&&action==='POST')return {};if(action!=='GET')throw"))
const login=path.join(dir,'pages/login/index.js'),body=fs.readFileSync(login,'utf8');if([...body.matchAll(/\bPage\(/g)].length!==1)throw Error('Unexpected login bootstrap')
fs.writeFileSync(login,`function __qualityPage(d){d.qaHeroLoaded=function(e){this.setData({qaHeroMeta:{passed:true,width:e.detail.width,height:e.detail.height,type:'png',source:'native-image-load'}})};d.qaImageInfo=function(){return this.data.qaHeroMeta||{passed:false,error:'Native image load event has not fired'}};Page(d)};\n`+body.replace(/\bPage\(/,'__qualityPage('))
const template=path.join(dir,'pages/login/index.wxml');fs.writeFileSync(template,fs.readFileSync(template,'utf8').replace('class="welcome-cat"','bindload="qaHeroLoaded" class="welcome-cat"'))
console.log('Offline login metadata instrumentation and sample responses prepared; no cloud writes')
