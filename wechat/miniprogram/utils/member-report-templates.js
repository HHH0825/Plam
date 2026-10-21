// Shared layouts for preview and export. Monetary values come from the same
// existing report model; visual templates never recalculate account totals.
function painter(ctx,appearance,fontScale=1){
 const colors=require('./member').palettes[appearance.theme]||require('./member').palettes.default
 const journal=appearance.template==='journal',commands=[],left=54,right=666,inner=612
 function rect(x,y,width,height,color){commands.push({kind:'rect',x,y,width,height,color})}
 function text(value,x,top,size=25,weight='normal',color='#34332F',width=inner,align='left'){
  size*=fontScale;ctx.font=weight+' '+size+'px sans-serif'
  const lines=[];let line='';for(const ch of String(value)){if(line&&ctx.measureText(line+ch).width>width){lines.push(line);line=''}line+=ch}if(line)lines.push(line)
  for(const content of lines){const measured=ctx.measureText(content).width;commands.push({kind:'text',text:content,lines:[content],x:align==='right'?x-measured:align==='center'?x-measured/2:x,y:top+size*.85,size,weight,color,width:measured,height:size*1.35,align:'left',ascent:0,lineHeight:size*1.35});top+=size*1.35}
  return top
 }
 function line(y){rect(left,y,inner,1,journal?'#E4DCC8':'#EAEAEA')}
 function heading(label,y){if(journal)rect(left,y+5,5,32,colors[0]);return text(label,left+(journal?17:0),y,29,'bold')+18}
 function finish(height){
  const background=[{kind:'rect',x:0,y:0,width:720,height,color:journal?colors[1]:'#FFFFFF'}]
  if(journal){background.push({kind:'rect',x:35,y:35,width:650,height:height-70,color:'#FFFFFF'});for(let y=54;y<height-40;y+=36)background.push({kind:'rect',x:50,y,width:620,height:1,color:'#F4F0E7'})}
  return require('./member').decorateLayout({width:720,height,commands:[...background,...commands]},appearance)
 }
 function header(title,subtitle){rect(left,48,journal?88:inner,journal?8:4,colors[0]);let y=text(title,left,77,38,'bold');y=text(subtitle,left,y+8,21,'normal','#707070');if(journal)commands.push({kind:'image',src:'/assets/membership/cat.png',x:600,y:68,width:58,height:58});return y+28}
 return {colors,journal,commands,left,right,inner,rect,text,line,heading,finish,header}
}
function cash(ctx,model,cover,fontScale,appearance){
 const p=painter(ctx,appearance,fontScale),s=model.summary;let y=p.header('猫爪收支小报',model.monthLabel+' · 截至'+model.cutoff)
 p.rect(p.left,y,p.inner,154*fontScale,p.colors[1]);let inside=p.text(s.expense_label,80,y+19,24,'normal','#6D6657');inside=p.text(s.expenseDisplay,80,inside+8,57,'bold','#292929',560);y=Math.max(y+154*fontScale,inside+22)+24
 const a=p.text('收入',p.left,y,23,'normal','#707070',280),b=p.text(s.net_label.replace('本月',''),386,y,23,'normal','#707070',280)
 y=Math.max(p.text(s.incomeDisplay,p.left,a+5,33,'bold','#292929',280),p.text(s.netDisplay,386,b+5,33,'bold','#292929',280))+24;p.line(y);y+=24
 if(!cover){
  y=p.heading('收支分类',y);const chartTop=y,cy=y+138
  p.commands.push({kind:'ring',x:210,y:cy,r:109,width:58,rows:model.rows,diameter:276})
  p.text('原支出',210,cy-30,21,'normal','#707070',150,'center');p.text(s.grossDisplay,210,cy+4,26,'bold','#292929',170,'center')
  let legend=y+8;for(const row of model.rows){p.rect(385,legend+7,14,14,row.color);const nameEnd=p.text(row.name,411,legend,23,'normal','#34332F',120);const amountEnd=p.text(row.display,666,legend,23,'normal','#34332F',125,'right');legend=Math.max(nameEnd,amountEnd)+18}
  y=Math.max(chartTop+276,legend)+18
  if(model.empty)y=p.text('本月暂无原支出',p.left,y,23,'normal','#707070')+12
  y=p.text('原支出 '+s.grossDisplay+'  ·  退款 '+s.refundDisplay,p.left,y,23,'normal','#707070')+24;p.line(y);y+=26
  y=p.heading('生活的小脚印',y)
  if(model.empty)y=p.text('还没有可展示的支出发现',p.left,y,23,'normal','#707070')
  else {y=p.text('花费最多的分类：'+model.topCategory,p.left,y,25)+10;y=p.text('支出最高日：'+model.topDate,p.left,y,25)}
 }
 y=p.text('猫爪物帐 · 按实际收付统计',p.left,y+36,20,'normal','#707070');return p.finish(Math.ceil(y+50))
}
function collection(ctx,report,icons,cover,appearance){
 const edition=require('./monthly').presentMonthly(report,icons),p=painter(ctx,appearance)
 let y=p.header('我的收藏小报',edition.monthEdition+' · 截至'+report.cutoff_date)
 p.rect(p.left,y,p.inner,130,p.colors[1]);let inner=p.text(edition.balance.label,p.left+22,y+17,23,'normal','#6D6657');inner=p.text('¥'+edition.balance.amount,p.left+22,inner+8,45,'bold','#292929',568);y=Math.max(y+130,inner+20)+26
 y=p.heading('本月账目 · 购入 '+report.totals.purchase_count+' 件',y)
 for(const [key,label] of [['purchase_total','购置支出'],['maintenance_total','维修支出'],['fixed_expense_total','订阅/分期支出'],['installment_principal_total','分期本金（另列）'],['disposal_total','处置回收']]){
  const end=Math.max(p.text(label,p.left,y,25,'normal','#707070',270),p.text('¥'+edition.totalsText[key],p.right,y,25,'normal','#292929',310,'right'));y=end+15;p.line(y);y+=16
 }
 y=p.text(edition.cashflowNote||'本月收支持平',p.left,y+4,21,'normal','#707070')+10;y=p.text(edition.cashflowScope,p.left,y,21,'normal','#707070')+28
 if(!cover){
  y=p.heading('本月支出与回收',y)
  for(const bar of edition.bars){y=Math.max(p.text(bar.label,p.left,y,23,'normal','#34332F',230),p.text('¥'+bar.amount,p.right,y,23,'normal','#34332F',340,'right'))+12;p.rect(p.left,y,p.inner,7,'#F1F1F1');if(bar.width>0)p.rect(p.left,y,p.inner*bar.width/100,7,bar.color);y+=31}
  if(edition.finding){y=p.heading('这月的一笔',y+14);y=p.text(edition.finding,p.left,y,26,'bold')+10;if(edition.findingBasis)y=p.text(edition.findingBasis,p.left,y,21,'normal','#707070')+20}
  if(edition.purchases.length){y=p.heading('本月收藏',y+10);for(const item of edition.purchases.slice(0,3)){const top=y;p.commands.push({kind:'image',src:item.art,fallback:item.fallbackArt,fit:'contain',x:p.left,y:top,width:76,height:82});const end=p.text(item.name,p.left+96,y,25,'bold','#292929',300);const dateEnd=p.text(item.purchase_date,p.left+96,end+6,20,'normal','#707070',300);const amountEnd=p.text('¥'+item.priceText,p.right,y,23,'normal','#292929',190,'right');y=Math.max(top+82,dateEnd,amountEnd)+18;p.line(y);y+=18}if(edition.purchases.length>3)y=p.text('另有 '+(edition.purchases.length-3)+' 件，见小程序完整记录。',p.left,y,21,'normal','#707070')+12}
 }
 if(!report.has_activity)y=p.text('这个月没有购入、维修、处置或订阅/分期记录。',p.left,y+10,23,'normal','#707070')+12
 y=p.text('猫爪物帐 · 每月一页',p.left,y+24,21,'bold')+10;y=p.text('费用按事件日期归月；更正记录后，历史结果可能变化。',p.left,y,20,'normal','#707070');return p.finish(Math.ceil(y+50))
}
module.exports={cash,collection}
