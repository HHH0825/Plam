// Reuse the established offline sandbox; every response remains local fixture data.
const fs=require('node:fs'),path=require('node:path')
let script=fs.readFileSync(path.join(__dirname,'prepare-rewards-sandbox.cjs'),'utf8')
script=script.replaceAll('rewards-native-project','growth-native-project').replaceAll('rewards-fixture.json','growth-fixture.json')
const needle="if(url==='/rewards/invitation')return clone(m.invitation);"
if(!script.includes(needle))throw Error('Offline fixture template changed')
script=script.replace(needle,needle+`
  if(url==='/rewards/visit')return clone(m);
  if(url.startsWith('/rewards/achievements/')&&url.endsWith('/claim')){const id=url.split('/')[3],row=m.achievements.find(r=>r.id===id);if(!row||!row.achieved)throw Error('离线成就未达成');const already=row.claimed;if(!already){m.balance+=row.reward;row.claimed=true}return {...clone(m),already_claimed:already,awarded:already?0:row.reward}};
`)
new Function('require','__dirname',script)(require,__dirname)
