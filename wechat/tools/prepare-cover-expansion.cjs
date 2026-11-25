// Extend the existing vector family; never regenerate the original 40 PNG files.
const fs=require('node:fs'),path=require('node:path')
const sharp=require(process.env.PALM_SHARP_PATH || 'sharp')
const root=path.resolve(__dirname,'..'),source=path.join(root,'branding/item-covers-20261018'),output=path.join(root,'miniprogram/assets/item-covers')
const P=(d,fill='none')=>`<path d="${d}" fill="${fill}"/>`,R=(x,y,w,h,r=8,fill='#FFFEFA')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`,C=(x,y,r,fill='#FFFEFA')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`
const y='#FFE378',p='#F7C9D9',g='#E9EDF0',white='#FFFEFA'
const rows=[
 ['keyboard','键盘','digital','蓝牙键盘 机械键盘',R(12,38,104,57,8,g)+[0,1,2].map(j=>[0,1,2,3,4,5,6].map(i=>R(21+i*13,47+j*12,8,7,2,j===0&&i===0?p:white)).join('')).join('')+R(43,83,42,6,2,y)+P('M58 38v-9q0-10 13-10')],
 ['mouse','鼠标','digital','无线鼠标 蓝牙鼠标',R(38,26,52,82,24,g)+P('M64 26V12 M39 61h50 M64 28v33')+R(59,39,10,17,5,y)],
 ['charger','充电器','digital','电源适配器 充电头',R(28,45,52,53,10,y)+P('M40 45V26h8v19 M60 45V26h8v19 M81 70q25-3 20 20v10')+R(93,99,16,13,3,g)+P('M53 60 44 76h12l-5 12')],
 ['power-bank','充电宝','digital','移动电源 备用电池',R(35,20,58,91,11,g)+R(46,28,14,6,2,y)+P('M58 43 48 66h15l-7 20 22-29H63l8-14Z',y)+P('M48 99h3m9 0h3m9 0h3')],
 ['router','路由器','digital','无线路由器 WiFi',R(22,63,84,39,10,g)+P('M29 63 21 24 M99 63l8-39 M44 36q20-15 40 0 M52 47q12-9 24 0')+C(64,55,2,y)+P('M33 88h5m9 0h5m9 0h5')],
 ['external-drive','移动硬盘','digital','固态硬盘 SSD 硬盘',R(32,24,64,86,10,g)+P('M47 25V15h15 M42 39h44')+R(42,46,44,43,7,white)+C(79,99,3,p)+P('M50 61h28 M50 73h19')],
 ['usb-drive','U盘','digital','优盘 USB 闪存盘',R(45,14,38,34,4,g)+R(35,45,58,67,10,y)+P('M55 23v12 M73 23v12')+C(64,91,7,p)+P('M48 59h32')],
 ['printer','打印机','digital','喷墨打印机 激光打印机',R(34,19,60,40,3,white)+R(18,46,92,50,9,g)+R(32,71,64,14,3,y)+P('M39 79h50v33H39Z',white)+P('M48 91h32 M48 102h25')+C(96,59,3,p)],
 ['projector','投影仪','digital','投影机',R(19,42,90,53,11,g)+C(80,66,18,y)+C(80,66,10,white)+P('M29 58h22 M29 68h17 M28 95v9 M99 95v9 M52 34h20')],
 ['ereader','电子书阅读器','digital','墨水屏 读书器 电纸书 阅读器',R(31,16,66,96,9,g)+R(38,25,52,67,3,white)+P('M47 40h34 M47 52h31 M47 64h34 M47 76h22')+C(64,102,3,y)],
 ['fridge','冰箱','home','冰柜 电冰箱',R(31,14,66,99,9,g)+P('M32 50h64 M43 28v13 M43 65v22 M41 113v4 M87 113v4')+P('M69 30h15v11H69Z',y)],
 ['washing-machine','洗衣机','home','洗烘一体机 烘干机',R(25,17,78,95,9,g)+P('M25 39h78 M36 28h18')+C(88,28,4,p)+C(64,74,27,white)+C(64,74,19,g)+P('M46 79q9-9 18 0t18 0',p)+P('M88 68v12')],
 ['air-conditioner','空调','home','挂机空调 空调机',R(13,27,102,44,10,white)+P('M21 54h86 M25 62h78 M64 79v28 M43 79q-11 14 0 27 M85 79q11 14 0 27')+C(101,39,3,y)],
 ['television','电视','home','电视机 智能电视',R(14,24,100,68,6,g)+R(21,31,86,52,3,white)+P('M43 92 35 107 M85 92l8 15 M49 49l28 17-28 12Z',y)+P('M43 108H27 M101 108H85')],
 ['rice-cooker','电饭煲','home','电饭锅',P('M29 48q1-20 35-20t35 20Z',g)+R(24,45,80,61,17,white)+P('M46 28v-9h36v9 M24 64H13v19h11 M104 64h11v19h-11')+R(46,66,36,25,7,y)+C(64,78,4,p)],
 ['microwave','微波炉','home','微波烤箱',R(15,31,98,67,8,white)+R(23,39,61,49,4,g)+P('M91 43v19 M22 99v7 M105 99v7')+C(98,76,8,y)+P('M33 71q15-15 33 0 M36 57h25')],
 ['air-fryer','空气炸锅','home','空气烤锅',R(30,18,68,92,20,g)+P('M31 58h66')+R(46,30,36,17,5,white)+P('M52 38h8m7 0h8')+R(56,65,16,29,5,y)+P('M41 104h46')],
 ['kettle','电热水壶','home','烧水壶 电水壶',P('M45 36h40l12 60q0 14-34 14T30 96Z',white)+P('M44 36h43v-9H44Z',y)+P('M85 46h10q26 0 17 28-3 10-17 11 M39 50 16 42l17 35')+R(51,51,20,40,7,g)+P('M55 65h12 M55 78h12')],
 ['coffee-machine','咖啡机','home','咖啡壶 意式咖啡机',P('M26 27h76v24H81v40h21v18H26Z',g)+R(25,19,78,23,6,y)+P('M60 53v12 M80 53v12')+P('M49 75h32v18q0 14-16 14T49 93Z',white)+P('M81 80h8q13 9-8 14')+C(37,56,4,p)],
 ['iron','电熨斗','home','熨斗 挂烫机',P('M25 81q19-36 61-39l22 39v15H20Z',white)+P('M20 96h88v10H20Z',g)+P('M48 48V28h29q15 0 15 18l-6-4 M37 80h54')+R(53,62,25,10,4,p)],
 ['hair-dryer','吹风机','daily','电吹风 风筒',P('M26 28h55q22 0 22 21T81 70H26Z',p)+P('M26 34H13v30h13 M57 70l-6 40h23l6-40',g)+C(81,49,13,white)+P('M75 39v20 M84 38v22 M63 110q-3 12 10 10')],
 ['electric-toothbrush','电动牙刷','daily','牙刷 声波牙刷',R(52,54,25,59,10,p)+P('M59 54V31h11v23')+R(53,12,23,26,7,white)+P('M60 17v15 M68 17v15')+C(64,75,5,y)+P('M61 100h7')],
 ['shaver','电动剃须刀','daily','剃须刀 刮胡刀',P('M40 48h48l-5 51q-2 14-19 14T45 99Z',g)+R(33,22,62,32,12,white)+C(47,38,9,y)+C(64,38,9,white)+C(81,38,9,y)+R(57,68,14,20,6,p)],
 ['scale','体重秤','daily','电子秤 体脂秤',R(21,22,86,87,17,g)+R(40,32,48,23,5,white)+P('M51 40h5v8 M65 40h10v8H65Z M33 67v24 M95 67v24')],
 ['lunch-box','饭盒','daily','便当盒 保温饭盒',R(22,39,84,64,15,y)+R(18,30,92,19,8,white)+P('M48 30v-9h32v9 M24 54h80 M50 55v39')+R(16,58,12,23,4,p)+R(100,58,12,23,4,p)],
 ['cutlery','餐具','daily','筷子 勺子 叉子 刀叉',P('M27 18v25q0 11 13 11t13-11V18 M40 18v94 M32 112h16')+P('M82 58q-19-4-19-22 0-21 19-21t19 21q0 18-19 22v54',y)],
 ['perfume','香水','daily','香氛 香水瓶',R(31,49,66,61,11,p)+R(46,31,36,19,4,white)+R(48,13,32,19,4,y)+R(43,65,42,29,4,white)+P('M55 80h18 M104 31l8-4 M103 43h12')],
 ['comb','梳子','daily','发梳 气垫梳',R(35,16,58,61,23,p)+R(55,76,18,36,6,y)+[0,1,2,3].map(i=>P(`M${46+i*12} 29v33`)).join('')+C(64,100,2,white)],
 ['dress','连衣裙','clothing','裙子 长裙',P('M48 17q16 12 32 0l8 30-11 14 27 49H24l27-49-11-14Z',p)+P('M51 60h26 M48 20l-6 22 M80 20l6 22 M54 77l-7 25 M74 77l7 25')+R(55,54,18,9,3,y)],
 ['skirt','半身裙','clothing','短裙 百褶裙',P('M42 27h44l20 80H22Z',p)+R(40,20,48,15,4,y)+P('M52 36 44 101 M64 36v66 M76 36l8 65')],
 ['hat','帽子','clothing','遮阳帽 棒球帽 渔夫帽',P('M35 75V57q0-29 29-29t29 29v18Z',y)+P('M18 73q47 19 92 0l7 19q-53 23-106 0Z',p)+P('M36 65h56 M64 29v35')],
 ['scarf','围巾','clothing','围脖 披肩',P('M35 23h58v29H35Z',p)+P('M43 52 35 105h25l9-53 M73 52l5 40h23L91 52',y)+P('M40 108v9 M48 108v9 M56 108v9 M82 95v9 M90 95v9 M98 95v9 M43 36h42')],
 ['gloves','手套','clothing','保暖手套',P('M25 73V40q0-14 12-14t12 14v18l7-10q11-11 16-1l-6 33-13 13H27Z',p)+R(24,88,33,17,4,y)+P('M70 37q2-15 14-10t7 19l-3 17 9-8q13-8 16 4l-13 29-16 10-17-8 5-19')+R(65,94,33,15,4,y)],
 ['glasses','眼镜','clothing','太阳镜 近视眼镜 墨镜',C(35,69,22,g)+C(93,69,22,g)+P('M57 65q7-9 14 0 M14 61l6-25h18 M114 61l-6-25H90 M25 59l10-7 M83 59l10-7')],
 ['handbag','手提包','clothing','包包 单肩包 斜挎包',P('M46 42V31q0-21 18-21t18 21v11')+P('M29 40h70l10 69H19Z',p)+P('M42 46v13 M86 46v13 M30 90h68')+R(53,64,23,17,4,y)],
 ['wallet','钱包','clothing','卡包 零钱包',R(18,30,92,71,10,p)+P('M24 30v-9h70v9 M19 42h90')+R(74,56,40,29,6,y)+C(86,70,4,white)+P('M31 53v35')],
 ['calculator','计算器','books','计算机 科学计算器',R(31,15,66,99,8,g)+R(40,25,48,22,3,white)+[0,1,2].map(j=>[0,1,2].map(i=>R(41+i*17,58+j*16,11,10,2,i===2?y:white)).join('')).join('')+P('M55 33h7v7 M70 33h7v7')],
 ['stapler','订书机','books','装订机',P('M23 85h79v20H20Z',g)+P('M22 60q0-9 10-11l68-13 11 21-65 17-6 16H23Z',p)+P('M30 60 96 47 M42 86h47')+R(20,99,89,11,4,y)],
 ['pencil-case','笔袋','books','文具袋 铅笔盒 文具盒',R(17,46,94,52,12,p)+P('M18 61h92 M26 54h66')+C(99,54,4,y)+P('M31 46V22h12v24 M55 46V17h12v29 M79 46l9-26 11 4-8 22')],
 ['helmet','头盔','mobility','骑行头盔 摩托头盔 安全帽',P('M20 70q0-47 44-47t44 47v23H68l-8-18H20Z',y)+P('M61 52h44v20H68Z',g)+P('M27 70v31h29 M70 94l-10 16H42 M57 29l-6 15')],
 ['stroller','儿童推车','mobility','婴儿车 宝宝推车',P('M44 28q32-23 55 16H44Z',p)+P('M43 44v34h54l9-34 M35 23H20 M31 23l21 65h45 M50 80l-13 27 M94 80l13 27')+C(36,109,10,g)+C(106,109,10,g)+R(51,58,43,18,5,y)],
 ['child-seat','儿童安全座椅','mobility','汽车安全座椅 宝宝座椅',R(33,15,62,72,20,p)+P('M42 41 64 64l22-23 M64 64v24')+R(17,80,94,28,12,g)+R(25,60,17,36,7,y)+R(86,60,17,36,7,y)+R(57,59,14,15,3,y)+P('M30 108v8 M98 108v8')],
 ['jump-rope','跳绳','sports','健身跳绳',P('M37 45v33q0 35 27 35t27-35V45')+R(27,16,20,41,8,p)+R(81,16,20,41,8,y)+P('M33 26h8 M87 26h8 M52 85q2 15 12 15')],
 ['swim-goggles','游泳镜','sports','泳镜 游泳眼镜',P('M21 52q-9-30 43-30t43 30')+R(15,48,43,36,13,g)+R(70,48,43,36,13,g)+P('M58 62q6-11 12 0 M26 57h17 M81 57h17 M13 63H7 M115 63h6 M43 94l-8 13 M87 94l8 13')],
 ['tent','帐篷','sports','露营帐篷 露营装备',P('M64 21 113 106H15Z',y)+P('M64 21v85 M64 49 37 106h54Z',p)+P('M64 49v57 M16 106l-7 8 M112 106l7 8 M58 12l6 9 7-9')],
 ['tape-measure','卷尺','tools','测量尺 米尺',R(29,32,68,69,16,y)+C(63,66,19,white)+P('M96 67h20v18H95 M100 72v9 M109 72v9 M47 29v-9h28v11')+P('M58 60h10v13H58Z')],
 ['flashlight','手电筒','tools','手电 照明灯',P('M44 43h40l-6 24v45H50V67Z',y)+R(35,18,58,28,8,g)+R(42,24,44,14,4,white)+R(57,75,14,18,5,p)+P('M45 13l-6-5 M64 12V6 M83 13l6-5')],
 ['guitar','吉他','other','木吉他 乐器',P('M64 52q-10-11-22-1-12 10-4 23-27 21-6 36 22 17 43-7 12-15-9-28 3-17-7-26-14-12Z',y)+P('M59 58 84 18l12 8-25 41Z',g)+P('M82 18l4-13 20 12-10 10Z',p)+C(58,80,10,white)+P('M44 97l20 11 M89 11l11 7')],
 ['plush-toy','玩偶','other','毛绒玩具 玩具 公仔',C(35,26,13,p)+C(93,26,13,p)+R(28,24,72,51,24,white)+R(35,69,58,41,20,y)+C(27,86,13,white)+C(101,86,13,white)+C(41,108,13,p)+C(87,108,13,p)+C(48,47,2,'#494641')+C(80,47,2,'#494641')+P('M59 57h10l-5 6Z',p)+P('M64 63v5 M56 68q8 6 16 0')],
 ['necklace','项链','other','首饰 吊坠 饰品',P('M35 19q-19 65 29 83 48-18 29-83 M42 22q-10 51 22 68 32-17 22-68')+P('M64 83 83 99l-19 20-19-20Z',p)+P('M45 99h38 M64 84l-7 15 7 20 7-20Z',y)]
]
async function main(){
 fs.mkdirSync(source,{recursive:true});fs.mkdirSync(output,{recursive:true});let bytes=0
 const legacy=JSON.parse(fs.readFileSync(path.join(root,'branding/item-covers-20261011/catalogue.json'),'utf8'))
 if(rows.length!==50||legacy.length!==40||new Set([...legacy.map(r=>r.key),...rows.map(r=>r[0])]).size!==90)throw Error('Unexpected catalogue')
 const newRows=[]
 for(const[key,name,group,aliases,body]of rows){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><g stroke="#494641" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${body}</g><path d="m107 16 5-3m-1 10 6 1" stroke="#F4D264" stroke-width="3" stroke-linecap="round" fill="none"/></svg>`
  fs.writeFileSync(path.join(source,key+'.svg'),svg)
  const png=await sharp(Buffer.from(svg)).resize(128,128).png({palette:true,colours:64,effort:10}).toBuffer();fs.writeFileSync(path.join(output,key+'.png'),png);bytes+=png.length
  newRows.push({key,name,group,art:'/assets/item-covers/'+key+'.png',version:2,aliases})
 }
 if(bytes>120*1024)throw Error('New icons exceed 120KiB')
 const catalogue=[...legacy,...newRows]
 fs.writeFileSync(path.join(source,'catalogue.json'),JSON.stringify(catalogue,null,2)+'\n')
 fs.writeFileSync(path.join(root,'miniprogram/utils/item-cover-catalogue.js'),'// Original editable vectors are kept in branding/item-covers-20261011 and -20261018.\nmodule.exports='+JSON.stringify(catalogue)+'\n')
 fs.writeFileSync(path.join(source,'asset-budget.json'),JSON.stringify({newIcons:50,totalIcons:90,newPngBytes:bytes,pixelSize:128,budget:120*1024},null,2))
 const tiles=await Promise.all(newRows.map(async(r,i)=>({input:await sharp(path.join(output,r.key+'.png')).resize(96,96).png().toBuffer(),left:24+(i%10)*150+27,top:65+Math.floor(i/10)*158})))
 const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;')
 const captions=Buffer.from(`<svg width="1548" height="890"><rect width="1548" height="890" fill="#FFFDF5"/><style>text{font-family:Microsoft YaHei,sans-serif;fill:#494641}</style><text x="26" y="38" font-size="24" font-weight="bold">50个新朋友 · 常用物品图标</text>${newRows.map((r,i)=>`<rect x="${24+(i%10)*150}" y="${58+Math.floor(i/10)*158}" width="142" height="148" rx="16" fill="white" stroke="#EEEADF"/><text x="${95+(i%10)*150}" y="${180+Math.floor(i/10)*158}" font-size="14" text-anchor="middle">${esc(r.name)}</text>`).join('')}</svg>`)
 await sharp(captions).composite(tiles).png().toFile(path.join(source,'50个新增图标总览.png'))
 console.log(JSON.stringify({newIcons:50,totalIcons:90,bytes}))
}
main().catch(e=>{console.error(e);process.exitCode=1})
