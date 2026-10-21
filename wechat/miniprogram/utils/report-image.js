const { nativeCall } = require('./photo-edit')
const { wrapLines, presentMonthly } = require('./monthly')
const { PALETTE, SPACE, ASSET } = require('./report-design')

// All coordinates are shared design units, not device pixels. Text bounds are
// allocated before drawing separators and backgrounds or sizing the PNG.
function painter(context) {
  const commands = [], left = SPACE.left, right = SPACE.right, inner = right - left
  function text(value, x, top, size = SPACE.body, color = PALETTE.ink, max = 6, available = inner, align = 'left', weight = 'normal') {
    context.font = weight + ' ' + size + 'px sans-serif'
    const lines = wrapLines(context, value, available, max)
    const metrics = lines.map(line => context.measureText(line))
    const ascent = Math.max(size, ...metrics.map(m => m.actualBoundingBoxAscent || 0))
    const descent = Math.max(size * .25, ...metrics.map(m => m.actualBoundingBoxDescent || 0))
    const lineHeight = Math.max(size + 10, Math.ceil(ascent + descent + 4))
    const height = Math.max(0, lines.length - 1) * lineHeight + ascent + descent
    commands.push({ kind:'text', lines, x, y:top, size, color, align, available, weight, ascent, lineHeight, height })
    return height
  }
  const image = (src, x, y, width, height, opacity = 1, fallback = '', fit = '') => commands.push({kind:'image',src,x,y,width,height,opacity,fallback,fit})
  const art = (name, x, y, w, h, opacity) => image(ASSET + name + '.png',x,y,w,h,opacity)
  const rect = (x,y,width,height,color) => commands.push({kind:'rect',x,y,width,height,color})
  const line = (y,color = PALETTE.line) => commands.push({kind:'line',x:left,y,width:inner,color})
  function masthead() {
    text('每月一页',left,66,28,PALETTE.ink,1,216,'left','600')
    image('/assets/brand/paw-ledger-mark.png',right-186,55,52,52)
    text('猫爪物帐',right,66,22,PALETTE.ink,1,125,'right','600')
    line(128)
  }
  function sheet(height) {
    commands.unshift({kind:"rect",x:24,y:24,width:672,height:height-48,color:PALETTE.paper})
  }
  return {commands,text,image,art,rect,line,masthead,sheet,left,right,inner}
}
function planReport(context, report, icons = {}, draft) {
  const appearance=draft||require('./member').effective()
  if(appearance.template==='simple'||appearance.template==='journal')return require('./member-report-templates').collection(context,report,icons,false,appearance)
  const edition = presentMonthly(report,icons)
  const p = painter(context), {commands,text,image,art,rect,line,left,right,inner} = p
  p.masthead()
  art('postmark',right-150,146,150,116,.65)
  text(edition.monthEdition,left,164,SPACE.caption,PALETTE.muted,1,260)
  image(edition.monthArt,left-6,196,252,198)
  text('把这个月，轻轻收好。',left,416,SPACE.caption,PALETTE.muted,1,276)
  art('cat-book',right-345,176,345,283)
  let y = 474
  y += text((report.is_current?'截至今天 · ':'记录截止 · ')+report.cutoff_date,left,y,SPACE.caption,PALETTE.muted,1) + 18
  line(y); y += 4
  function paragraph(value,size=SPACE.caption,color=PALETTE.muted,max=8,align='left') {
    y += text(value,align==='center'?360:left,y,size,color,max,inner,align) + 8
  }
  function heading(number,label,aside='') {
    y += SPACE.section
    art('number-tape',left,y,66,48)
    text(number,left+33,y+9,SPACE.small,PALETTE.green,1,54,'center','600')
    const h=text(label,left+78,y+4,SPACE.title,PALETTE.ink,1,inner-252,'left','600')
    art('leaf',left+78+label.length*SPACE.title+12,y+11,60,32)
    if(aside)text(aside,right,y+9,SPACE.caption,PALETTE.muted,1,190,'right')
    y += Math.max(48,h+4)+16
  }
  function row(label,amount,cashflow) {
    const start=y,weight=cashflow?'600':'normal'
    if(cashflow)y+=14
    const background=commands.length
    y+=16
    const lh=text(label,left,y,SPACE.body,cashflow?PALETTE.ink:PALETTE.muted,2,245,'left',weight)
    const mh=text('¥'+amount,right,y,SPACE.body,PALETTE.ink,3,350,'right',weight)
    y+=Math.max(lh,mh)+16
    if(cashflow)commands.splice(background,0,{kind:'rect',x:left-12,y:start+14,width:inner+24,height:y-start-14,color:PALETTE.ledger})
    else line(y)
  }
  if(!report.has_activity) {
    y+=48;paragraph('这一页，暂时留白。',34,PALETTE.ink,2)
    paragraph('这个月没有购入、维修、处置或订阅/分期记录。',SPACE.small,PALETTE.muted,3)
    y+=15
  } else {
    heading('01','本月账目','购入 '+report.totals.purchase_count+' 件')
    row('购置支出',edition.totalsText.purchase_total)
    row('维修支出',edition.totalsText.maintenance_total)
    row('订阅/分期支出',edition.totalsText.fixed_expense_total)
    row('分期本金（另列）',edition.totalsText.installment_principal_total)
    row('处置回收',edition.totalsText.disposal_total)
    row(edition.balance.label,edition.balance.amount,true)
    y+=14;paragraph(edition.cashflowNote)
    paragraph(edition.cashflowScope)
    heading('02','本月支出与回收')
    for(const bar of edition.bars) {
      const lh=text(bar.label,left,y,SPACE.small,PALETTE.ink,1,190)
      const mh=text('¥'+bar.amount,right,y,SPACE.small,PALETTE.ink,3,390,'right')
      y+=Math.max(lh,mh)+12
      commands.push({kind:'track',x:left,y,width:inner,height:7,color:'#F1F1F1'})
      if(bar.width>0)rect(left,y,inner*bar.width/100,7,bar.color)
      y+=31
    }
    paragraph('各类支出与处置回收按金额比例对照。')
    if(edition.finding) {
      y+=30;const start=y,index=commands.length
      const copyX=left+136,copyWidth=inner-154
      art('label-tape',copyX,y+22,160,45)
      text('这月的一笔',copyX+80,y+30,SPACE.small,PALETTE.green,1,150,'center','600')
      y+=77
      y+=text(edition.finding,copyX,y,SPACE.body,PALETTE.ink,Infinity,copyWidth)+12
      if(edition.findingBasis)y+=text(edition.findingBasis,copyX,y,SPACE.caption,PALETTE.muted,8,copyWidth)+8
      y+=22
      commands.splice(index,0,{kind:'rect',x:left,y:start,width:inner,height:y-start,color:'#FFFFFF'})
      image(edition.findingArt,left+18,start+(y-start-110)/2,100,110,1,edition.findingFallback,'contain')
    }
    if(edition.purchases.length) {
      heading('03','本月收藏',edition.purchases.length+' 件')
      for(const item of edition.purchases.slice(0,3)) {
        const top=y+22,nameX=left+110,priceWidth=210,nameWidth=inner-110-priceWidth-20
        rect(left,top,90,94,'#FFFFFF');image(item.art,left,top,90,94,1,item.fallbackArt,'contain')
        art('corner-tape',left-6,top-6,50,20)
        const nameHeight=text(item.name,nameX,top,SPACE.body,PALETTE.ink,Infinity,nameWidth,'left','600')
        const dateY=top+nameHeight+8
        const dateHeight=text(item.purchase_date,nameX,dateY,SPACE.caption,PALETTE.muted,1,230)
        const amountHeight=text('¥'+item.priceText,right,top+9,SPACE.small,PALETTE.ink,4,priceWidth,'right')
        y=Math.max(top+94,dateY+dateHeight,top+9+amountHeight)+22
        line(y)
      }
      if(edition.purchases.length>3) {y+=16;paragraph('另有 '+(edition.purchases.length-3)+' 件，见小程序完整记录。')}
    }
  }
  y+=32;line(y);y+=20
  art('paw-signature',320,y,80,62);y+=72
  paragraph('猫爪物帐 · 每月一页',SPACE.small,PALETTE.ink,1,'center');y+=12
  paragraph('每月一页，按当前保存的记录整理。',SPACE.caption,PALETTE.muted,2,'center')
  paragraph('费用按事件日期归月；更正或作废付款、修改记录、删除或恢复物品后，历史结果可能变化。',SPACE.caption,PALETTE.muted,4,'center')
  const height=Math.ceil(y+62);p.sheet(height)
  return require('./member').decorateLayout({width:720,height,commands},appearance)
}
function planShareCover(context,report,draft) {
  const appearance=draft||require('./member').effective()
  if(appearance.template==='simple'||appearance.template==='journal')return require('./member-report-templates').collection(context,report,{},true,appearance)
  const edition=presentMonthly(report),p=painter(context)
  const {text,art,rect,left,right,inner}=p
  p.masthead()
  text(edition.monthEdition,left,162,30,PALETTE.ink,1,350,'left','600')
  text('把这个月，轻轻收好。',left,218,22,PALETTE.muted,1,310)
  text('购入 '+report.totals.purchase_count+' 件 · 每月一页',left,267,22,PALETTE.muted,1,350)
  art('cat-book',right-210,145,210,172)
  let y=322
  const rows = [['购置支出',edition.totalsText.purchase_total],['维修支出',edition.totalsText.maintenance_total],['订阅/分期支出',edition.totalsText.fixed_expense_total],['处置回收',edition.totalsText.disposal_total],[edition.balance.label,edition.balance.empty ? null : edition.balance.amount]]
  for(const [index,[label,amount]] of rows.entries()) {
    const cash=index===rows.length-1,weight=cash?'600':'normal'
    if(cash)rect(left-8,y-4,inner+16,36,PALETTE.ledger)
    text(label,left,y,24,PALETTE.ink,1,205,'left',weight)
    if(amount!==null)text('¥'+amount,right,y,24,PALETTE.ink,1,390,'right',weight)
    y+=36
  }
  if(edition.cashflowNote)text(edition.cashflowNote,left,506,14,PALETTE.muted,1,inner)
  text(edition.cashflowScope,left,532,12,PALETTE.muted,1,inner)
  p.sheet(576);return require('./member').decorateLayout({width:720,height:576,commands:p.commands},appearance)
}
function discardImage(path) {
  if (!path) return
  try { wx.getFileSystemManager().unlink({ filePath: path, success() {}, fail() {} }) } catch (_) {}
}

async function renderImage(page, report, current, planner, icons = {}) {
  const check = () => { if (!current()) throw new Error('本次图片生成已取消') }
  const canvas = await new Promise((resolve, reject) => {
    wx.createSelectorQuery().in(page).select('#report-canvas').fields({ node: true, size: true }, result => {
      if (result && result.node) resolve(result.node); else reject(new Error('图片画布暂不可用，请重试'))
    }).exec()
  })
  check()
  const c = canvas.getContext('2d'), layout = planner(c, report, icons)
  canvas.width = layout.width; canvas.height = layout.height
  const sources = [...new Set(layout.commands.filter(command => command.src).map(command => command.src))]
  const images = new Map()
  await Promise.all(sources.map(async src => {
    const image = canvas.createImage()
    let loaded = await new Promise(resolve => { image.onload = () => resolve(true); image.onerror = () => resolve(false); image.src = src })
    const fallback=layout.commands.find(command=>command.src===src&&command.fallback)?.fallback
    if(!loaded&&fallback&&fallback!==src)loaded=await new Promise(resolve=>{image.onload=()=>resolve(true);image.onerror=()=>resolve(false);image.src=fallback})
    check(); if (loaded) images.set(src, image)
  }))
  check()
  drawLayout(c, layout, images)
  check()
  const result = await nativeCall('canvasToTempFilePath', { canvas, width: layout.width, height: layout.height,
    destWidth: layout.width, destHeight: layout.height, fileType: 'png' }, page)
  if (!current()) { discardImage(result.tempFilePath); check() }
  if (!result.tempFilePath) throw new Error('没有生成图片，请重试')
  return result.tempFilePath
}


function drawLayout(c,layout,images) {
  c.fillStyle=PALETTE.border;c.fillRect(0,0,layout.width,layout.height)
  c.fillStyle=PALETTE.paper;c.fillRect(26,32,layout.width-52,layout.height-64)
  for(const command of layout.commands) {
    c.fillStyle=command.color||PALETTE.ink;c.strokeStyle=command.color||PALETTE.line
    if(command.src) {
      const image=images.get(command.src)
      if(!image)continue // Decoration failure cannot hide the real account's text.
      c.globalAlpha=command.opacity==null?1:command.opacity
      if(command.kind==='tile') {
        for(let offset=0;offset<command.height;offset+=command.tileHeight) {
          const h=Math.min(command.tileHeight,command.height-offset)
          c.drawImage(image,0,0,image.width,image.height*h/command.tileHeight,command.x,command.y+offset,command.width,h)
        }
      } else if(command.fit==='contain') {const scale=Math.min(command.width/image.width,command.height/image.height),w=image.width*scale,h=image.height*scale;c.drawImage(image,command.x+(command.width-w)/2,command.y+(command.height-h)/2,w,h)}
      else c.drawImage(image,command.x,command.y,command.width,command.height)
      c.globalAlpha=1
    } else if(command.kind==='rect'||command.kind==='track')c.fillRect(command.x,command.y,command.width,command.height)
    else if(command.kind==='line') {c.lineWidth=1;c.beginPath();c.moveTo(command.x,command.y);c.lineTo(command.x+command.width,command.y);c.stroke()}
    else if(command.kind==='text') {
      c.font=(command.weight||'normal')+' '+command.size+'px sans-serif';c.textAlign=command.align;c.textBaseline='alphabetic'
      command.lines.forEach((line,i)=>c.fillText(line,command.x,command.y+command.ascent+i*command.lineHeight))
    }
  }
  c.textAlign='left'
}
const reportImage=(page,report,current,icons={},draft)=>renderImage(page,report,current,(ctx,r,i)=>planReport(ctx,r,i,draft),icons)
const shareCoverImage=(page,report,current)=>renderImage(page,report,current,planShareCover)
module.exports={reportImage,shareCoverImage,planReport,planShareCover,drawLayout,discardImage}
