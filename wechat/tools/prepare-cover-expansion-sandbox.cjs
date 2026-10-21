// Reuse the established offline sandbox; every response remains local fixture data.
const fs=require('node:fs'),path=require('node:path')
let script=fs.readFileSync(path.join(__dirname,'prepare-rewards-sandbox.cjs'),'utf8')
script=script.replaceAll('rewards-native-project','cover-expansion-native-project').replaceAll('rewards-fixture.json','growth-fixture.json')
const needle="if(url==='/rewards/invitation')return clone(m.invitation);"
if(!script.includes(needle))throw Error('Offline fixture template changed')
script=script.replace(needle,needle+`
  if(url==='/rewards/visit')return clone(m);
  if(url.startsWith('/rewards/achievements/')&&url.endsWith('/claim')){const id=url.split('/')[3],row=m.achievements.find(r=>r.id===id);if(!row||!row.achieved)throw Error('离线成就未达成');const already=row.claimed;if(!already){m.balance+=row.reward;row.claimed=true}return {...clone(m),already_claimed:already,awarded:already?0:row.reward}};
`)
new Function('require','__dirname',script)(require,__dirname)

const folder=path.resolve(__dirname,'../../test-results/cover-expansion-native-project'),built=path.resolve(__dirname,'../../test-results/cover-expansion-project');
function compiled(dir,rel=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const name=path.join(rel,e.name),target=path.join(folder,name);if(e.isDirectory()){fs.mkdirSync(target,{recursive:true});compiled(path.join(dir,e.name),name)}else if(!['app.js','config.js','utils/api.js'].includes(name.replaceAll('\\','/'))){fs.copyFileSync(path.join(dir,e.name),target)}}}
compiled(built);fs.copyFileSync(path.join(built,'utils/api.js'),path.join(folder,'utils/api-original.js'));
const api=path.join(folder,'utils/api.js');fs.writeFileSync(api,fs.readFileSync(api,'utf8').replace("const route=url.split('?')[0];","const route=url.split('?')[0];if(route==='/auth/me')return {...clone(base[route]),user:clone(getApp().globalData.user),capabilities:{...base[route].capabilities,item_cover_icons:true,item_cover_icons_version:getApp().globalData.qaLegacy?1:2}};"));
const sample=require(path.join(folder,'qa-fixture.js'));Object.assign(sample['/rewards'].capacity,{used:6,can_add:true});fs.writeFileSync(path.join(folder,'qa-fixture.js'),'module.exports='+JSON.stringify(sample));
console.log(JSON.stringify({project:folder,compiledRuntime:true,offline:true,cloudWrites:0}));
