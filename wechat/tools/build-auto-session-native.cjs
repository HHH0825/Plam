const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),context={}
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../test-results/wechat-terser.cjs'),'utf8'),context)
const source=fs.readFileSync(path.join(__dirname,'auto-session-native.js'),'utf8')
context.Terser.minify('const nativeCheck='+source,{compress:false,mangle:false,format:{comments:false,quote_style:1}}).then(r=>fs.writeFileSync(path.resolve(__dirname,'../../test-results/auto-session-native-source.js'),r.code.slice(r.code.indexOf('=')+1).replace(/;$/,''))).catch(e=>{console.error(e);process.exitCode=1})
