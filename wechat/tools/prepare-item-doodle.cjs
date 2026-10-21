// Editable, original artwork matching the approved item-list mockup.
const fs = require('node:fs'), path = require('node:path'), sharp = require('sharp')
const out = path.resolve(__dirname, '../miniprogram/assets/item-doodle')
const svg = (w,h,body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`
const line = body => `<g fill="none" stroke="#393939" stroke-width="1.2" stroke-linecap="round">${body}</g>`
const corner = '<path d="M1.4 24C1.1 17 .9 8.7 6.8 4.5C11.5 1.1 17.6 1.6 24 1.4"/>'
const horizontal = '<path d="M0 1.4C18 1.4 20 .95 36 1.4S54 1.4 72 1.4"/>'
const paw = '<ellipse cx="8" cy="8" rx="2.5" ry="3.6" transform="rotate(-20 8 8)"/><ellipse cx="15" cy="5.7" rx="2.5" ry="3.6"/><ellipse cx="22" cy="8" rx="2.5" ry="3.6" transform="rotate(20 22 8)"/><ellipse cx="4" cy="15" rx="2.3" ry="3" transform="rotate(-28 4 15)"/><path d="M8 21C7 17 11 13 15 13S24 18 22 22C20 26 17 23 15 24C12 26 8 25 8 21Z"/>'
const art = {
  'corner-tl':svg(24,24,line(corner)),
  'corner-tr':svg(24,24,`<g transform="translate(24 0) scale(-1 1)">${line(corner)}</g>`),
  'corner-bl':svg(24,24,`<g transform="translate(0 24) scale(1 -1)">${line(corner)}</g>`),
  'corner-br':svg(24,24,`<g transform="translate(24 24) scale(-1 -1)">${line(corner)}</g>`),
  'edge-top':svg(72,4,line(horizontal)),
  'edge-bottom':svg(72,4,`<g transform="translate(0 4) scale(1 -1)">${line(horizontal)}</g>`),
  'edge-left':svg(4,72,`<g transform="matrix(0 1 1 0 0 0)">${line(horizontal)}</g>`),
  'edge-right':svg(4,72,`<g transform="matrix(0 1 -1 0 4 0)">${line(horizontal)}</g>`),
  paw:svg(28,28,`<g fill="#FFE15A">${paw}</g>`),
  star:svg(28,28,'<path d="M14 3C15 11 17 12 25 14C17 15 16 18 14 25C12 17 10 16 3 14C11 12 12 10 14 3Z" fill="#FFE15A"/>'),
  arc:svg(28,28,'<path d="M4 19Q8 7 18 11Q22 5 25 11" fill="none" stroke="#FFE15A" stroke-width="2.4" stroke-linecap="round"/>'),
  mark:svg(100,40,'<path d="M2 22C0 10 18 3 35 4C58 0 89 3 97 15C107 31 82 37 58 36C34 42 3 36 2 22Z" fill="#FFF0A5"/>'),
  underline:svg(110,12,'<path d="M3 9Q27 0 48 5Q67 0 83 4Q98 1 107 3" fill="none" stroke="#FFE15A" stroke-width="2.6" stroke-linecap="round"/>'),
  dot:svg(12,12,'<circle cx="6" cy="6" r="5" fill="#FFE15A"/>'),
  smile:svg(32,22,'<path d="M4 10Q21 28 28 4" fill="none" stroke="#FFE15A" stroke-width="3" stroke-linecap="round"/>')
}
async function main(){
  fs.mkdirSync(out,{recursive:true})
  for(const [name,source] of Object.entries(art)){
    fs.writeFileSync(path.join(out,name+'.svg'),source)
    const meta=await sharp(Buffer.from(source)).metadata()
    await sharp(Buffer.from(source)).resize(meta.width*3,meta.height*3).png({palette:true,quality:100,effort:10}).toFile(path.join(out,name+'.png'))
  }
  const bytes=Object.keys(art).reduce((sum,name)=>sum+fs.statSync(path.join(out,name+'.png')).size,0)
  // WXSS cannot fetch local background URLs. Embed only the tiny tiling pieces;
  // the standalone PNGs and SVGs remain available for editing and load fallback.
  const css=Object.keys(art).filter(name=>/^(corner|edge)-/.test(name)).map(name=>
    `.sketch-frame .${name}{background-image:url('data:image/png;base64,${fs.readFileSync(path.join(out,name+'.png')).toString('base64')}');}`).join('\n')+'\n'
  fs.writeFileSync(path.join(out,'frame.wxss'),css)
  const runtimeBytes=bytes+Buffer.byteLength(css)
  if(runtimeBytes>50*1024)throw Error('Artwork exceeds 50 KiB including embedded tiles')
  console.log(JSON.stringify({pngCount:Object.keys(art).length,bytes,runtimeBytes,limit:50*1024}))
}
main().catch(error=>{console.error(error);process.exitCode=1})
