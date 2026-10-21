const {drawRing}=require('./ledger-analytics')
const {nativeCall}=require('./photo-edit')
const {discardImage}=require('./report-image')
// Coordinates are in the 720px export space. The preview uses these same commands.
function plan(ctx,model,cover=false,fontScale=1,draft){
 const appearance=draft||require('./member').effective()
 if(appearance.template==='simple'||appearance.template==='journal')return require('./member-report-templates').cash(ctx,model,cover,fontScale,appearance)
 const commands=[],width=720,left=54,inner=612,asset='/assets/cash-fidelity/',s=model.summary
 const add=c=>commands.push(c),art=(name,x,y,w,h)=>add({kind:'image',src:asset+name+'.png',x,y,width:w,height:h})
 const measure=(value,size,weight='normal')=>{ctx.font=weight+' '+size+'px sans-serif';return ctx.measureText(String(value)).width}
 const text=(value,x,y,size=24,weight='normal',color='#34332F',limit=inner,align='left')=>{
  size*=fontScale
  if(/¥|••••/.test(value))while(size>1&&measure(value,size,weight)>limit)size--
  const lines=[];let line='';for(const char of String(value)){if(line&&measure(line+char,size,weight)>limit){lines.push(line);line=''}line+=char}if(line)lines.push(line)
  for(const line of lines){const w=measure(line,size,weight);add({kind:'text',text:line,x:align==='center'?x-w/2:align==='right'?x-w:x,y:y+size*.84,size,weight,color,width:w,height:size*1.3});y+=size*1.35}
  return y
 }
 const line=(x,y,w,color='#EBD391',dashed=false)=>add({kind:'line',x,y,width:w,height:1.5,color,dashed})
 art('peek-cat',514,13,166,114);art('pink-paw',64,135,66,59);art('pink-paw',644,200,29,26)
 art('report-title',154,98,482,89);art('underline',154,181,482,20)
 let y=text(model.monthLabel,360,218,30,'bold','#34332F',inner,'center');y=text('截至'+model.cutoff,360,y+4,20,'normal','#34332F',inner,'center')
 y+=18;const heroTop=y,heroHeight=170*fontScale;add({kind:'ellipse',x:110,y,width:500,height:heroHeight,color:'#FFF3CB'});art('hero-strokes',142,y+58*fontScale,436,87)
 text(s.expense_label,360,y+19,27,'bold','#34332F',430,'center');text(s.expenseDisplay,360,y+63*fontScale,72,'bold','#242420',410,'center');y+=heroHeight+24
 const totalTop=y,totalBottom=Math.max(text('收入',198,y,24,'normal','#34332F',266,'center'),text(s.net_label.replace('本月',''),518,y,24,'normal','#34332F',266,'center'))
 y=Math.max(text(s.incomeDisplay,198,totalBottom+3,36,'bold','#34332F',266,'center'),text(s.netDisplay,518,totalBottom+3,36,'bold','#34332F',266,'center'))
 add({kind:'line',x:360,y:totalTop+8,width:1,height:y-totalTop-8,color:'#A69B81'});art('mini-cat',628,totalTop-26,57,51);y+=27
 if(!cover){
  line(42,y,636,'#F2D778',true);y+=27;art('pink-paw',65,y+8,42,38);art('report-section',128,y,470,59);art('underline',126,y+54,300,8);y+=76
  const chartTop=y,diameter=276,cx=218,cy=y+138
  add({kind:'ring',x:cx,y:cy,r:109,width:58,rows:model.rows,diameter})
  text('原支出',cx,cy-31,22,'normal','#34332F',160,'center');text(s.grossDisplay,cx,cy+4,28,'bold','#34332F',170,'center')
  let legendY=y+19
  for(const row of model.rows){add({kind:'dot',x:414,y:legendY+16,width:24,height:24,color:row.color});const a=text(row.name,442,legendY,24,'normal','#34332F',104),b=text(row.display,654,legendY,25,'normal','#34332F',112,'right');legendY=Math.max(a,b)+24}
  y=Math.max(chartTop+diameter,legendY)
  if(model.empty)y=text('本月暂无原支出',360,y+4,22,'normal','#898171',inner,'center')
  y+=14;add({kind:'panel',x:left,y,width:inner,height:52*fontScale,color:'#FFF3CF'})
  const gross='原支出 '+s.grossDisplay,refund='退款 '+s.refundDisplay
  text(gross,212,y+12,23,'normal','#34332F',296,'center');text(refund,519,y+12,23,'normal','#34332F',280,'center');line(365,y+13,1,'#C6B890');commands[commands.length-1].height=26*fontScale;y+=52*fontScale+21
  line(42,y,636,'#F2D778',true);y+=22;art('pink-paw',65,y+8,42,38);art('report-footprints',128,y,350,55);art('underline',126,y+53,207,8);y+=76
  if(model.empty)y=text('还没有可展示的支出发现',360,y,23,'normal','#898171',inner,'center')
  else{art('fork',87,y,40,49);art('calendar',389,y,48,48);const a=text('花费最多的分类：',144,y,21,'normal','#34332F',203),b=text('支出最高日：',454,y,21,'normal','#34332F',202);y=Math.max(text(model.topCategory,144,a+2,26,'bold','#34332F',203),text(model.topDate,454,b+2,26,'bold','#34332F',202));add({kind:'line',x:360,y:y-62,width:1,height:65,color:'#A69B81'})}
 }
 y+=50;art('sprout',48,y-49,58,64);art('corner-cat',605,y-51,78,76);art('pink-paw',646,y-88,24,21)
 y=text('猫爪物帐 · 按实际收付统计',360,y,19,'normal','#6F685C',inner,'center')
 const height=Math.ceil(y+38),frame=[]
 for(const [name,x,fy]of [['tl',26,66],['tr',664,66],['bl',26,height-50],['br',664,height-50]])frame.push({kind:'image',src:asset+'frame-'+name+'.png',x,y:fy,width:30,height:30})
 for(const fy of [66,height-30])for(let x=56;x<664;x+=80)frame.push({kind:'image',src:asset+'edge-h.png',x,y:fy,width:Math.min(80,664-x),height:10})
 for(const x of [26,684])for(let fy=96;fy<height-50;fy+=80)frame.push({kind:'image',src:asset+'edge-v.png',x,y:fy,width:10,height:Math.min(80,height-50-fy)})
 return require('./member').decorateLayout({width,height,commands:[...frame,...commands],heroTop},appearance)
}
function draw(ctx,layout,images={}){
 const round=(x,y,w,h,r)=>{ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath()}
 ctx.fillStyle='#FFFCF2';ctx.fillRect(0,0,layout.width,layout.height)
 for(const c of layout.commands){
  if(c.kind==='image'){if(images[c.src])ctx.drawImage(images[c.src],c.x,c.y,c.width,c.height)}
  else if(c.kind==='rect'){ctx.fillStyle=c.color;ctx.fillRect(c.x,c.y,c.width,c.height)}
  else if(c.kind==='ring')drawRing(ctx,c.rows,c.x,c.y,c.r,c.width)
  else if(c.kind==='panel'){ctx.fillStyle=c.color;round(c.x,c.y,c.width,c.height,c.height/2);ctx.fill()}
  else if(c.kind==='ellipse'){ctx.fillStyle=c.color;ctx.beginPath();ctx.ellipse(c.x+c.width/2,c.y+c.height/2,c.width/2,c.height/2,0,0,Math.PI*2);ctx.fill()}
  else if(c.kind==='dot'){ctx.fillStyle=c.color;ctx.beginPath();ctx.arc(c.x,c.y,12,0,Math.PI*2);ctx.fill()}
  else if(c.kind==='line'){ctx.strokeStyle=c.color;ctx.lineWidth=c.width===1?1:1.5;ctx.setLineDash(c.dashed?[10,11]:[]);ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.lineTo(c.x+(c.width===1?0:c.width),c.y+(c.width===1?c.height:0));ctx.stroke();ctx.setLineDash([])}
  else{ctx.fillStyle=c.color;ctx.font=c.weight+' '+c.size+'px sans-serif';ctx.textBaseline='alphabetic';ctx.fillText(c.text,c.x,c.y)}
 }
}
function preview(layout,width){
 const scale=width/layout.width,px=n=>(n*scale).toFixed(3)+'px'
 return {width,height:layout.height*scale,nodes:layout.commands.map((c,id)=>{
  let x=c.x,y=c.y,w=c.width,h=c.height,extra=''
  if(c.kind==='ring'){w=h=c.diameter;x-=w/2;y-=h/2}
  if(c.kind==='text'){y-=c.size*.84;extra='font-size:'+px(c.size)+';font-weight:'+c.weight+';line-height:'+px(c.size*1.3)+';color:'+c.color+';white-space:nowrap;'}
  if(c.kind==='dot'){x-=12;y-=12;w=h=24;extra='border-radius:50%;background:'+c.color+';'}
  if(c.kind==='ellipse'||c.kind==='panel')extra='border-radius:'+(c.kind==='ellipse'?'50%':px(h/2))+';background:'+c.color+';'
  if(c.kind==='rect')extra='background:'+c.color+';'
  if(c.kind==='line'){extra='border-'+(c.width===1?'left':'top')+':'+px(c.width===1?1:1.5)+' '+(c.dashed?'dashed':'solid')+' '+c.color+';';if(c.width!==1)h=0}
  return {...c,id,size:c.kind==='ring'?w*scale:undefined,style:'left:'+px(x)+';top:'+px(y)+';width:'+px(w||0)+';height:'+px(h||0)+';'+extra}
 })}
}
async function canvasFor(page){return new Promise((resolve,reject)=>wx.createSelectorQuery().in(page).select('#cash-report-canvas').fields({node:true,size:true},r=>r?.node?resolve(r.node):reject(Error('图片画布暂不可用，请重试'))).exec())}
async function render(page,model,current,cover=false,draft){
 const check=()=>{if(!current())throw Error('本次图片生成已取消')},canvas=await canvasFor(page);check()
 const ctx=canvas.getContext('2d'),layout=plan(ctx,model,cover,page._reportFontScale||1,draft),images={};canvas.width=layout.width;canvas.height=layout.height
 await Promise.all([...new Set(layout.commands.filter(c=>c.kind==='image').map(c=>c.src))].map(src=>new Promise(resolve=>{const art=canvas.createImage();art.onload=()=>{images[src]=art;resolve()};art.onerror=()=>resolve();art.src=src})))
 check();draw(ctx,layout,images)
 const result=await nativeCall('canvasToTempFilePath',{canvas,width:layout.width,height:layout.height,destWidth:layout.width,destHeight:layout.height,fileType:'png'},page)
 if(!current()){discardImage(result.tempFilePath);check()}if(!result.tempFilePath)throw Error('没有生成图片，请重试');return result.tempFilePath
}
module.exports={plan,draw,preview,canvasFor,render}
