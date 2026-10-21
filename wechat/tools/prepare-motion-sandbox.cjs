const fs=require('node:fs'),path=require('node:path')
let script=fs.readFileSync(path.join(__dirname,'prepare-growth-sandbox.cjs'),'utf8').replaceAll("'growth-native-project'","'motion-native-project'")
new Function('require','__dirname',script)(require,__dirname)

const folder=path.resolve(__dirname,'../../test-results/motion-native-project'),api=path.join(folder,'utils/api.js');fs.writeFileSync(api,fs.readFileSync(api,'utf8').replace("const route=url.split('?')[0];","const route=url.split('?')[0];if(route==='/auth/me')return {...clone(base[route]),user:clone(getApp().globalData.user)};"))
