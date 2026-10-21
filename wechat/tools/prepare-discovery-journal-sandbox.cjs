const fs=require('node:fs'),path=require('node:path')
let script=fs.readFileSync(path.join(__dirname,'prepare-growth-sandbox.cjs'),'utf8').replaceAll("'growth-native-project'","'discovery-native-project'")
new Function('require','__dirname',script)(require,__dirname)

const folder=path.resolve(__dirname,'../../test-results/discovery-native-project'),api=path.join(folder,'utils/api.js');fs.writeFileSync(api,fs.readFileSync(api,'utf8').replace("const route=url.split('?')[0];","const route=url.split('?')[0];if(route==='/auth/me')return {...clone(base[route]),user:clone(getApp().globalData.user)};"))

fs.writeFileSync(path.join(folder,'qa-fixture.js'),'module.exports='+JSON.stringify(require('../../test-results/discovery-fixture.json').responses));
fs.writeFileSync(api,fs.readFileSync(api,'utf8').replace("const route=url.split('?')[0];","const route=url.split('?')[0];if(route==='/insights'&&getApp().globalData.qaFailInsights)throw Error('离线模拟读取失败');"));
console.log(JSON.stringify({project:folder,offline:true,cloudWrites:0}));
