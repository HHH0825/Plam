// Original, editable vector drawings; no platform emoji artwork is bundled.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp')
const root=path.resolve(__dirname,'..'),source=path.join(root,'branding/item-covers-20261011'),output=path.join(root,'miniprogram/assets/item-covers')
const P=(d,fill='none')=>`<path d="${d}" fill="${fill}"/>`, R=(x,y,w,h,r=8,fill='#FFFEFA')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`, C=(x,y,r,fill='#FFFEFA')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`
const yellow='#FFE378',pink='#F7C9D9',gray='#E9EDF0'
const rows=[
 ['phone','手机','digital',R(39,18,50,92,12)+R(45,29,38,62,5,gray)+P('M55 23h18 M59 100h10')],
 ['tablet','平板','digital',R(23,23,82,82,10)+R(30,32,68,60,5,gray)+C(64,99,2,pink)],
 ['laptop','笔记本电脑','digital',R(27,24,74,57,6)+R(33,30,62,44,3,gray)+P('M28 81 15 99q0 7 14 7h70q14 0 14-7l-12-18Z',yellow)+P('M52 89h24')],
 ['monitor','显示器','digital',R(17,23,94,65,7)+R(24,30,80,49,3,gray)+P('M57 88v13m14-13v13 M43 105q21-5 42 0')],
 ['camera','相机','digital',P('M26 43h16l8-13h28l8 13h17q8 0 8 9v43q0 8-8 8H26q-9 0-9-8V52q0-9 9-9Z',gray)+C(65,71,23,yellow)+C(65,71,15,'#FFFDF5')+P('M27 52h10')+C(97,53,3,pink)],
 ['headphones','耳机','digital',P('M29 72V60a35 35 0 0 1 70 0v16 M37 66V60a27 27 0 0 1 54 0v8')+R(22,65,21,36,8,yellow)+R(85,65,21,36,8,pink)],
 ['watch','智能手表','digital',P('M49 42 46 15h36l-3 27 M49 86l-3 27h36l-3-27',pink)+R(36,37,56,55,14)+R(43,44,42,41,9,gray)+P('M64 52v14l11 6')],
 ['gamepad','游戏手柄','digital',P('M40 42h48q16 0 22 22l6 24q3 23-15 17L84 88H44l-17 17Q9 111 12 88l6-24q6-22 22-22Z',gray)+P('M37 56v23 M26 68h23')+C(87,61,5,pink)+C(99,74,5,yellow)],
 ['chair','椅子','home',R(35,18,58,54,12,pink)+R(27,66,74,20,7,yellow)+P('M34 87 28 111 M94 87l6 24 M44 33v23 M83 33v23')],
 ['lamp','台灯','home',P('M44 22h39l17 43H27Z',yellow)+P('M64 65v38 M45 109q19-12 38 0Z',gray)+P('M103 76l8 7 M24 76l-8 6')],
 ['fan','电风扇','home',C(64,51,35,gray)+P('M63 47q-18-32 2-25 17 6 2 25 M69 53q35-11 21 6-12 13-22 0 M60 58q-12 35-20 14-5-18 19-20',yellow)+C(64,52,6,pink)+P('M58 87v14h12V87 M42 109q23-12 44 0Z')],
 ['purifier','空气净化器','home',R(33,20,62,89,13)+P('M43 34h42 M44 45h40 M46 88h36 M46 96h36')+C(64,64,8,pink)+P('M105 33q-12-8 0-16 M20 48q-10-9 0-17')],
 ['vacuum','吸尘器','home',P('M48 97 75 38q8-17 16-12l8 6 M70 50l-12-7',gray)+R(42,54,25,35,9,yellow)+P('M28 100q21-9 45 0l6 12H22Z',pink)],
 ['cup','水杯','daily',P('M30 34h55v57q0 18-27 18T30 91Z')+P('M85 47h11q16 0 13 15-2 16-24 15 M42 23q-8-9 0-15 M61 23q-8-9 0-15')+P('M47 64q6-13 13-3 7-10 13 0 4 10-13 20Q43 72 47 64Z',pink)],
 ['thermos','保温杯','daily',R(41,18,46,18,6,yellow)+R(37,32,54,79,13)+P('M43 43h42 M49 91q16 6 29 0')+C(64,67,10,pink)],
 ['bowl','碗','daily',P('M18 59h92q-3 41-45 43Q24 100 18 59Z',yellow)+P('M16 59q47-12 96 0 M47 105h36 M40 40l37-24 M53 46 92 22')],
 ['pan','锅','daily',P('M27 49h67v35q0 21-34 21T27 84Z',yellow)+P('M23 53H10v17h17 M94 53h17v17H94 M26 46q34-25 69 0Z',gray)+R(53,24,19,9,4,pink)],
 ['umbrella','雨伞','daily',P('M17 64q6-40 47-44 40 4 47 44-16-13-31 0-16-13-32 0-15-13-31 0Z',pink)+P('M64 21Q46 42 48 64 M64 21q19 20 16 43 M64 64v37q0 17 14 9 M64 14v7')],
 ['toiletries','洗护用品','daily',R(33,43,62,68,12)+R(48,29,30,15,4,pink)+P('M63 29V17h25v10 M46 65h36v28H46Z',yellow)+P('M60 73q-13 14 0 14t0-14')],
 ['shirt','上衣','clothing',P('M45 27q19 16 38 0l26 18-14 22-12-8v49H45V59l-12 8-14-22Z',yellow)+P('M46 27q18 33 36 0')+C(64,71,8,pink)],
 ['coat','外套','clothing',P('M46 23h35l28 29-13 18-13-11v50H43V59L31 70 18 52Z',pink)+P('M64 39v69 M46 23l18 16-14 12 M81 23 64 39l13 12 M48 82h9 M72 82h9')],
 ['pants','裤子','clothing',P('M35 20h58l8 89H73L64 59l-9 50H27Z',gray)+P('M35 32h58 M65 32v16 M36 34l14 16 M91 34 77 47')],
 ['shoes','鞋子','clothing',P('M26 50q14 19 28-3l18 22 28 10q18 7 13 23H19q-5-25 7-52Z',yellow)+P('M19 93h93 M49 62l16-9 M57 70l15-9 M65 78l16-9')],
 ['backpack','背包','clothing',P('M49 31V23q15-15 30 0v8')+R(29,29,70,83,21,pink)+R(39,73,50,29,8,yellow)+P('M40 54h48 M43 85h42 M25 52v39 M103 52v39')],
 ['book','书','books',P('M17 27q24-7 47 7 24-14 47-7v75q-25-5-47 7-22-12-47-7Z',yellow)+P('M64 34v74 M28 44l24 6 M28 59l24 6 M76 50l23-6 M76 65l23-6')],
 ['notebook','笔记本','books',R(30,20,68,90,9,pink)+P('M44 21v87 M23 34h16 M23 51h16 M23 68h16 M23 85h16')+R(55,40,31,27,4,yellow)],
 ['pen','笔','books',P('M32 94 81 21l19 14-49 73-23 10Z',yellow)+P('M32 94l19 14 M75 30l19 13 M81 21q13-20 25-5 4 4-6 19 M28 118l3-12')],
 ['folder','文件夹','books',P('M17 39V26h33l11 13h50v65H17Z',pink)+P('M17 52h94l-10 54H26Z',yellow)+P('M38 68h32')],
 ['bike','自行车','mobility',C(28,88,22,gray)+C(102,88,22,gray)+P('M28 88 48 49l23 39H28l46-31 M71 88l21-58h13 M42 47h20 M86 50l16 38')],
 ['ebike','电动车','mobility',C(29,94,17,gray)+C(101,94,17,gray)+P('M29 94h48l12-43h13 M42 90V64h29l11 27 M80 53l8-27h14 M41 58h30',yellow)+P('M54 70 47 81h12l-6 10')],
 ['car','汽车','mobility',P('M17 63 32 33h64l15 30v34H17Z',yellow)+P('M35 41h25v22H24 M68 41h25l11 22H68',gray)+C(34,99,11,gray)+C(94,99,11,gray)+P('M28 77h14 M86 77h14')],
 ['suitcase','行李箱','mobility',P('M50 31V15h28v16')+R(31,30,66,75,12,yellow)+P('M48 44v48 M64 44v48 M80 44v48')+C(44,111,5,gray)+C(84,111,5,gray)+R(63,47,24,17,3,pink)],
 ['dumbbell','哑铃','sports',R(32,53,64,22,6,gray)+R(18,31,20,66,7,yellow)+R(90,31,20,66,7,pink)+P('M11 46v36 M117 46v36')],
 ['yoga-mat','瑜伽垫','sports',P('M32 38h65v66H32Q9 75 32 38Z',pink)+P('M32 38q-21 0-20 20t20 20q17 0 17-20T32 38 M32 49q-9 0-9 10t10 7 M49 91h35')],
 ['ball','球','sports',C(64,65,44,yellow)+P('M23 51q43 10 83-7 M28 91q31-23 78-12 M56 22q-12 41 20 84 M85 28q-9 33 11 65')],
 ['racket','球拍','sports',P('M47 82 25 111l10 7 22-30Z',pink)+P('M48 80q-30-29 2-55 31-24 47 3 16 27-18 51-16 11-31 1Z',gray)+P('M45 36l39 35 M53 28l39 35 M38 47l32 30 M41 65l39-35 M51 76l41-36')],
 ['toolbox','工具箱','tools',P('M47 39V23h34v16')+R(18,38,92,69,10,yellow)+P('M19 65h90')+R(56,58,16,17,3,pink)],
 ['screwdriver','螺丝刀','tools',P('M41 83 84 23l13-8 2 13-43 62Z',gray)+P('M33 74 62 96l-14 20q-20 3-26-18Z',yellow)+P('M31 92l14 10')],
 ['drill','电钻','tools',P('M25 30h56v14h27v16H81v13H62l-5 33H33l9-37H25Z',yellow)+P('M108 49h13 M81 43v19 M35 42h29 M64 74h13l-3 20H60',pink)],
 ['storage-box','收纳盒','other',P('M24 44 19 25l24 19 M104 44l5-19-24 19',yellow)+R(20,43,88,16,5,pink)+R(27,59,74,49,7,yellow)+R(47,71,34,20,4)+P('M56 81h16')]
]
async function main(){fs.mkdirSync(source,{recursive:true});fs.mkdirSync(output,{recursive:true});let bytes=0
 for(const[key,name,group,body]of rows){const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><g stroke="#494641" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${body}</g><path d="m107 16 5-3m-1 10 6 1" stroke="#F4D264" stroke-width="3" stroke-linecap="round" fill="none"/></svg>`;fs.writeFileSync(path.join(source,key+'.svg'),svg);const png=await sharp(Buffer.from(svg)).resize(128,128).png({palette:true,colours:64,effort:10}).toBuffer();fs.writeFileSync(path.join(output,key+'.png'),png);bytes+=png.length}
 const catalogue=rows.map(([key,name,group])=>({key,name,group,art:'/assets/item-covers/'+key+'.png'}));fs.writeFileSync(path.join(source,'catalogue.json'),JSON.stringify(catalogue,null,2)+'\n');fs.writeFileSync(path.join(root,'miniprogram/utils/item-cover-catalogue.js'),'// Generated from the original SVG catalogue.\nmodule.exports = '+JSON.stringify(catalogue,null,2)+'\n');console.log(JSON.stringify({icons:rows.length,bytes,limit:150*1024}));if(bytes>150*1024)throw Error('Icon budget exceeded')
}
main().catch(e=>{console.error(e);process.exitCode=1})
