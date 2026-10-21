// All I/O below is local. The sandbox cannot call the production API or cloud SDK.
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../../test-results/rewards-native-project')
fs.mkdirSync(out,{recursive:true})
function copy(dir,rel=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name.startsWith('project.private')||['node_modules','.git'].includes(e.name))continue;const r=path.join(rel,e.name),target=path.join(out,r);if(e.isDirectory()){fs.mkdirSync(target,{recursive:true});copy(path.join(dir,e.name),r)}else fs.copyFileSync(path.join(dir,e.name),target)}}
copy(root)
const config=JSON.parse(fs.readFileSync(path.join(out,'project.config.json'),'utf8'));config.projectname='猫爪签到喵铺离线验收';config.condition={};fs.writeFileSync(path.join(out,'project.config.json'),JSON.stringify(config,null,2))
fs.writeFileSync(path.join(out,'config.js'),`module.exports={API_TRANSPORT:'local_http',API_BASE:'http://127.0.0.1:9',DEV_LOGIN:true,DEV_ACCOUNT:'offline',CLOUD_PHOTOS_ENABLED:false}`)
const responses=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../test-results/rewards-fixture.json'),'utf8')).responses
fs.writeFileSync(path.join(out,'qa-fixture.js'),'module.exports='+JSON.stringify(responses))
fs.writeFileSync(path.join(out,'app.js'),`App({globalData:{token:'isolated-rewards-native',expiresAt:4102444800,user:require('./qa-fixture')['/auth/me'].user,qaState:'free'},_foreground:true,requireSession(){return true},hasSession(){return true}})`)
fs.copyFileSync(path.join(out,'utils/api.js'),path.join(out,'utils/api-original.js'))
fs.writeFileSync(path.join(out,'utils/api.js'),`const source=require('./api-original'),base=require('../qa-fixture'),accounts={};
function model(){const key=getApp().globalData.token;if(!key.startsWith('isolated-rewards-'))throw Error('Offline-only fixture guard');return accounts[key]||(accounts[key]={...JSON.parse(JSON.stringify(base['/rewards'])),seen:false})}
const clone=x=>JSON.parse(JSON.stringify(x));
async function request(url,options={}){
 const action=options.method||'GET',m=model();getApp().globalData.qaRequests=(getApp().globalData.qaRequests||0)+1;
 if(url.startsWith('/rewards')){
  await new Promise(r=>setTimeout(r,350));
  if(url==='/rewards'&&action==='GET')return clone(m);
  if(url==='/rewards/transactions')return {transactions:[{reason:'每日签到',amount:10,at:m.server_time},{reason:'永久容量＋1格',amount:-60,at:m.server_time-86400}]};
  if(url==='/rewards/invitation')return clone(m.invitation);
  if(url==='/rewards/greeting'){if(!getApp().globalData.qaAllowGreeting)return {...clone(m),show:false};const show=!m.seen;m.seen=true;return {...clone(m),show}};
  if(url==='/rewards/checkin'){if(!m.checkin.today_claimed){m.balance+=m.checkin.today_reward;m.checkin.today_claimed=true;m.checkin.days.find(d=>d.today).claimed=true}return clone(m)};
  if(url==='/rewards/redeem'){const d=options.data;if(d.expected_extra!==m.capacity.extra||d.expected_price!==m.shop.next_price)throw Error('离线兑换已变化');if(m.balance<m.shop.next_price)throw Error('喵粒不足');m.balance-=m.shop.next_price;m.capacity.extra++;m.capacity.free_limit++;m.capacity.limit=m.capacity.free_limit;m.capacity.can_add=m.capacity.used<m.capacity.limit;return clone(m)};
  throw Error('Unsupported offline action');
 }
 if(action!=='GET')throw Error('离线验收禁止真实业务写入');
 const route=url.split('?')[0];
 if(route==='/membership'){const active=getApp().globalData.qaState==='active';return {...clone(base[route]),capacity:clone(m.capacity),active,status:active?'active':'free',server_time:m.server_time,expires_at:active?1836864000:null,entitlements:active?['ad_free','unlimited_items','books','budgets']:[]}}
 const value=base[url]||base[route];if(value===undefined)throw Error('Missing offline fixture '+url);return clone(value)
}
module.exports={...source,request};`)
const page=path.join(out,'pages/rewards/index.js')
fs.writeFileSync(page,fs.readFileSync(page,'utf8').replace('Page(require(\'../../utils/member\').wrap({',`Page(require('../../utils/member').wrap({
 async qaRewardLayout(){const r=await new Promise(resolve=>wx.createSelectorQuery().in(this).selectAll('.seed-wallet').boundingClientRect().selectAll('.checkin-day').boundingClientRect().selectAll('.task-row').boundingClientRect().selectAll('.capacity-product').boundingClientRect().selectAll('.price-row').boundingClientRect().exec(resolve));this.setData({qaRewardLayout:{wallet:r[0][0],days:r[1],tasks:r[2],product:r[3][0],tiers:r[4].length}})},`))
console.log(JSON.stringify({project:out,offline:true,cloudWrites:0}))
