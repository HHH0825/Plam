// Ten distinct cosmetics silhouettes in the existing editable vector family.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp')
const root=path.resolve(__dirname,'..'),source=path.join(root,'branding/beauty-icons-20261018'),output=path.join(root,'miniprogram/assets/item-covers')
const P=(d,fill='none')=>`<path d="${d}" fill="${fill}"/>`,R=(x,y,w,h,r=8,fill='#FFFEFA')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`,C=(x,y,r,fill='#FFFEFA')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`
const y='#FFE378',pink='#F7C9D9',g='#E9EDF0',white='#FFFEFA',sage='#E5F1EA'
const rows=[
 ['lipstick','口红','唇膏 唇彩',P('M34 55V27l24-13v41Z',pink)+R(30,52,32,19,3,y)+R(26,69,40,42,5,pink)+R(80,49,24,62,5,g)+P('M26 98h40 M84 102h16')],
 ['foundation','粉底液','粉底 底妆',R(27,47,71,65,8,g)+R(39,32,47,16,3,y)+P('M49 32V17h38v9H63v6',white)+R(39,66,47,29,4,white)+P('M50 77h25 M50 86h17')],
 ['compact','粉饼／气垫','粉饼 气垫 气垫粉底',C(64,40,29,g)+C(64,40,22,white)+P('M52 29l17-5 M48 40l28-9')+R(31,67,66,10,4,pink)+P('M24 78q40-19 80 0v21q-40 25-80 0Z',pink)+P('M24 78q40 23 80 0')+R(45,81,38,20,9,white)+P('M55 83v15 M73 83v15')],
 ['eyeshadow','眼影盘','眼影 彩妆盘',R(17,18,94,39,6,g)+R(24,25,80,23,3,white)+R(14,57,100,53,7,white)+R(23,67,23,31,3,pink)+R(53,67,23,31,3,y)+R(83,67,22,31,3,sage)+P('M54 106h20')],
 ['mascara','睫毛膏','睫毛刷',R(25,47,27,65,5,pink)+R(28,37,21,11,3,y)+P('M78 71V39')+R(70,71,17,40,4,g)+R(73,15,11,26,5,pink)+P('M68 18h21 M68 25h21 M68 32h21 M69 39h19 M32 98h13')],
 ['serum','精华液','精华 滴管精华 肌底液',P('M41 58q-12 4-12 18v26q0 10 10 10h50q10 0 10-10V76q0-14-12-18Z',pink)+R(41,43,46,17,4,y)+P('M52 43V25q0-16 12-16t12 16v18Z',g)+R(42,77,44,23,4,white)+P('M64 80q-12 13 0 14t0-14',sage)],
 ['face-cream','面霜','护肤霜 润肤霜',P('M26 62h76v35q0 16-38 16T26 97Z',pink)+P('M26 62q38 17 76 0 M26 97q38 15 76 0')+R(44,72,40,20,5,white)+P('M19 46 29 26q34-13 66 5l10 20q-46 10-86-5Z',y)+P('M29 26q28 18 66 5')],
 ['sheet-mask','面膜','面膜贴 片状面膜',P('M31 17h66v96H31Z',sage)+P('M31 27h66 M31 103h66 M31 17l7 5 6-5 7 5 7-5 7 5 7-5 7 5 7-5 11 5')+P('M45 48q19-15 38 0v24q-5 19-19 23-14-4-19-23Z',white)+P('M51 60h8 M70 60h8 M61 64l-3 9h9 M57 82h14')],
 ['makeup-remover','卸妆水','卸妆液 卸妆露 洁肤水',R(29,31,43,81,9,g)+R(33,13,35,20,4,pink)+R(36,53,29,34,4,white)+P('M45 63h12 M46 74h10')+R(83,65,29,39,6,white)+P('M90 74h15 M90 83h15 M90 92h15')],
 ['makeup-brush','化妆刷','刷具 美妆刷 散粉刷',P('M45 58q-20-14-15-35 7 9 12-10 11 8 19-3 4 14 14 9 12 24-9 39Z',pink)+R(43,55,27,17,3,y)+P('M47 72h19l-3 40H50Z',g)+P('M43 25l8 25 M57 21v28 M69 29l-7 20')]
]
async function main(){
 fs.mkdirSync(source,{recursive:true});let bytes=0
 const legacy=JSON.parse(fs.readFileSync(path.join(root,'branding/item-covers-20261018/catalogue.json'),'utf8'))
 const added=[]
 for(const[key,name,aliases,body]of rows){const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><g stroke="#494641" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${body}</g><path d="m107 16 5-3m-1 10 6 1" stroke="#F4D264" stroke-width="3" stroke-linecap="round" fill="none"/></svg>`;fs.writeFileSync(path.join(source,key+'.svg'),svg);const png=await sharp(Buffer.from(svg)).png({palette:true,colours:64,effort:10,compressionLevel:9}).toBuffer();fs.writeFileSync(path.join(output,key+'.png'),png);bytes+=png.length;added.push({key,name,group:'daily',art:'/assets/item-covers/'+key+'.png',version:3,aliases})}
 if(bytes>20*1024)throw Error('Beauty icon budget exceeded: '+bytes)
 const catalogue=[...legacy,...added],groups=['digital','home','daily','clothing','books','mobility','sports','tools','other']
 if(catalogue.length!==100||new Set(catalogue.map(r=>r.key)).size!==100)throw Error('Unexpected icon IDs')
 fs.writeFileSync(path.join(source,'catalogue.json'),JSON.stringify(catalogue,null,2)+'\n')
 const compact=catalogue.map(r=>[r.key,r.name,groups.indexOf(r.group),...(r.version?[r.version,r.aliases]:[])])
 fs.writeFileSync(path.join(root,'miniprogram/utils/item-cover-catalogue.js'),'// Editable sources and full catalogue are kept in branding.\nconst groups='+JSON.stringify(groups)+'\nmodule.exports='+JSON.stringify(compact)+'.map(([key,name,type,version,aliases])=>({key,name,group:groups[type],art:"/assets/item-covers/"+key+".png",...(version?{version,aliases}:{})}))\n')
 fs.writeFileSync(path.join(source,'asset-budget.json'),JSON.stringify({newIcons:10,totalIcons:100,newPngBytes:bytes,pixelSize:128,budget:20*1024},null,2))
 const bg=Buffer.from(`<svg width="1056" height="500"><rect width="1056" height="500" fill="#FFFDF5"/><style>text{font-family:Microsoft YaHei,sans-serif;fill:#494641}</style><text x="28" y="39" font-size="24" font-weight="bold">10个化妆护肤新图标 · 不同轮廓，一眼分清</text>${added.map((r,i)=>`<rect x="${24+i%5*202}" y="${65+Math.floor(i/5)*203}" width="192" height="187" rx="18" fill="white" stroke="#EEEADF"/><text x="${120+i%5*202}" y="${229+Math.floor(i/5)*203}" font-size="18" text-anchor="middle">${r.name}</text>`).join('')}</svg>`)
 const tiles=await Promise.all(added.map(async(r,i)=>({input:await sharp(path.join(output,r.key+'.png')).resize(116,116).png().toBuffer(),left:62+i%5*202,top:84+Math.floor(i/5)*203})))
 await sharp(bg).composite(tiles).png().toFile(path.join(source,'10个化妆护肤图标总览.png'));console.log(JSON.stringify({newIcons:10,totalIcons:100,bytes}))
}
main().catch(e=>{console.error(e);process.exitCode=1})
