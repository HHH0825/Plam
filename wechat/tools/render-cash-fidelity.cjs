const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp')
const source=path.resolve(__dirname,'../branding/cash-fidelity-20261014'),out=path.resolve(__dirname,'../miniprogram/assets/cash-fidelity')
async function main(){fs.mkdirSync(out,{recursive:true});let bytes=0;for(const file of fs.readdirSync(source).filter(n=>n.endsWith('.svg'))){const p=path.join(source,file),meta=await sharp(p).metadata(),data=await sharp(p).resize({width:meta.width*3,height:meta.height*3}).png({palette:true,effort:10}).toBuffer();fs.writeFileSync(path.join(out,file.replace('.svg','.png')),data);bytes+=data.length}
 const url=name=>'url("data:image/png;base64,'+fs.readFileSync(path.join(out,name+'.png')).toString('base64')+'")'
 const styles=path.resolve(out,'../../styles'),backgrounds='.edge-top,.edge-bottom{background-image:'+url('edge-h')+'}.edge-left,.edge-right{background-image:'+url('edge-v')+'}.ledger-home .ledger-book-main-number::after{background-image:'+url('underline')+'}'
 fs.writeFileSync(path.join(styles,'cash-fidelity-backgrounds.wxss'),backgrounds)
 let fidelity=fs.readFileSync(path.join(styles,'cash-fidelity.wxss'),'utf8')
 fidelity=fidelity.replace(/\.edge-top,\.edge-bottom\{background-image:url\("data:[^"]+"\)\}/g,'').replace(/\.edge-left,\.edge-right\{background-image:url\("data:[^"]+"\)\}/g,'').replace(/\.ledger-home \.ledger-book-main-number::after\{background-image:url\("data:[^"]+"\)\}/g,'')+'\n'+backgrounds+'\n'
 fs.writeFileSync(path.join(styles,'cash-fidelity.wxss'),fidelity)
 for(const target of [path.join(styles,'ledger-journal.wxss'),path.resolve(styles,'../pages/me/index.wxss')]){const base=fs.readFileSync(target,'utf8').split('/* Independent corner/edge art')[0];fs.writeFileSync(target,base+fidelity)}
 const analysis=path.join(styles,'cash-analysis.wxss'),base=fs.readFileSync(analysis,'utf8').split('.cash-analysis-card.ledger-card')[0];fs.writeFileSync(analysis,base+fs.readFileSync(path.join(styles,'cash-analysis-fidelity.wxss'),'utf8'))
 console.log(JSON.stringify({bytes,assets:fs.readdirSync(out).length}));if(bytes>220*1024)throw Error('Art exceeds budget')}
main().catch(e=>{console.error(e);process.exitCode=1})
