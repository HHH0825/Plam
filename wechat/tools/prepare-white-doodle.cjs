// Original editable line artwork for the white theme. No remote assets.
const fs = require('node:fs'), path = require('node:path'), sharp = require('sharp')
const out = path.resolve(__dirname, '../miniprogram/assets/white-doodle')
const ink = '#292929', yellow = '#FFE15A', pink = '#FFDCE6', blue = '#DDF0FF'
const svg = (body, w = 240, h = 220) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g stroke="${ink}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`
const paw = `<ellipse cx="92" cy="78" rx="10" ry="15" fill="${ink}" transform="rotate(-22 92 78)"/><ellipse cx="116" cy="67" rx="10" ry="15" fill="${ink}"/><ellipse cx="141" cy="76" rx="10" ry="15" fill="${ink}" transform="rotate(22 141 76)"/><path d="M90 116Q87 103 101 94Q116 81 132 97Q150 110 141 121Q133 132 116 124Q96 133 90 116Z" fill="${ink}"/>`
const icons = {
  'nav-items': '<path d="M62 83l58-31 58 31v86l-58 29-58-29Z" fill="white"/><path d="M62 83l58 31 58-31m-58 31v84M91 68l58 31"/><path d="M88 143l14 7m35 0 14-7"/>',
  'discover': '<circle cx="108" cy="100" r="43" fill="white"/><path d="M139 133l38 39" stroke-width="10"/><path d="M83 100q23-27 49 0m-49 0q23 27 49 0" fill="none"/><circle cx="108" cy="100" r="8" fill="'+yellow+'"/>',
  'trash': '<path d="M71 79h98l-7 100H78Z" fill="white"/><path d="M61 77h118M96 77V60h48v17M104 102v50m32-50v50"/>',
  'keepsakes': '<rect x="65" y="52" width="109" height="139" rx="9" fill="white"/><path d="M84 55v133m60-134v34l-12-8-12 8V54"/><path d="M113 123q-15-24-25-3 0 15 25 31 25-16 25-31-10-21-25 3Z" fill="'+pink+'"/>',
  'feedback': '<path d="M59 67h122v95h-65l-33 23v-23H59Z" fill="white"/><path d="M83 95h72m-72 25h49"/>',
  'support': '<path d="M120 179Q55 133 63 99q10-43 57-10 47-33 57 10 8 34-57 80Z" fill="'+pink+'"/>',
  'type-digital': '<rect x="52" y="83" width="137" height="100" rx="15" fill="white"/><path d="M80 82V66h45v16"/><circle cx="122" cy="132" r="30" fill="'+blue+'"/><circle cx="122" cy="132" r="19" fill="white"/><path d="M163 103h8"/>',
  'type-home': '<path d="M45 113l75-65 75 65M65 98v91h110V98" fill="white"/><path d="M103 189v-53h35v53" fill="'+yellow+'"/>',
  'type-daily': '<path d="M70 62h81v123H70Z" fill="white"/><path d="M151 83h13q36 36-13 53M76 81h69"/><path d="M91 120q18 16 35 0" fill="none"/>',
  'type-clothing': '<path d="M90 62l-39 30 24 34 17-12v73h57v-73l17 12 24-34-39-30q-30 30-61 0Z" fill="white"/><path d="M107 139q13-18 26 0-2 16-13 21-11-5-13-21Z" fill="'+pink+'"/>',
  'type-books': '<path d="M52 65q36-13 68 7 32-20 68-7v119q-36-13-68 7-32-20-68-7Z" fill="white"/><path d="M120 72v119M70 94h28m-28 22h28m44-22h27m-27 22h27"/>',
  'type-mobility': '<path d="M66 119l18-43h72l18 43v60H66Z" fill="white"/><path d="M66 119h108M82 179v12m76-12v12"/><circle cx="86" cy="143" r="8" fill="'+yellow+'"/><circle cx="154" cy="143" r="8" fill="'+yellow+'"/>',
  'type-sports': '<circle cx="120" cy="122" r="65" fill="white"/><path d="M55 122h130M120 57v130M75 75q76 47 0 94m90-94q-76 47 0 94" fill="none"/>',
  'type-tools': '<path d="M140 63q-38-5-42 33l-41 62q-7 14 7 22 10 6 20-8l42-60q38 0 45-36l-27 20-19-17Z" fill="white"/>',
  'type-other': '<path d="M120 53l19 45 49 5-37 32 12 48-43-25-43 25 12-48-37-32 49-5Z" fill="'+yellow+'"/>',
  'camera-add': '<rect x="54" y="81" width="132" height="105" rx="15" fill="white"/><circle cx="120" cy="131" r="27" fill="'+blue+'"/><path d="M80 81V64h43v17m37-41v36m-18-18h36"/>',
  'postmark': '<circle cx="96" cy="104" r="58" fill="none" stroke="#B6B6B6" stroke-width="2"/><path d="M145 80q22-12 42 0t42 0m-84 17q22-12 42 0t42 0m-84 17q22-12 42 0t42 0" fill="none" stroke="#B6B6B6" stroke-width="2"/>',
  'memory-stamp': '<circle cx="118" cy="107" r="83" fill="white"/><circle cx="118" cy="107" r="72" fill="none" stroke-dasharray="3 9"/>'+paw,
  'paw': paw,
  'leaf': '<path d="M48 169q47-79 135-103M97 110q-38 7-41-23 36-15 41 23Zm23-15q-5-35 28-45 18 27-28 45Zm22-15q30 13 44-10-18-29-44 10Z" fill="'+blue+'"/>',
  'number-tape': '<path d="M19 53l198 6-6 108-198-6Z" fill="'+yellow+'" stroke="none"/>',
  'label-tape': '<path d="M18 65h205v96H18Z" fill="'+yellow+'" stroke="none"/>',
  'corner-tape': '<path d="M29 78l170-23 9 50-172 21Z" fill="'+blue+'" stroke="none"/>',
  'paw-signature': paw+'<path d="M75 151q40 19 84 0" fill="none"/>',
  'memory-book': '<rect x="62" y="49" width="116" height="148" rx="8" fill="white"/><path d="M80 52v142"/>'+paw,
}
async function write(name, content, width) {
  fs.writeFileSync(path.join(out, name+'.svg'), content)
  const square = name.startsWith('nav-') || name.startsWith('type-')
  await sharp(Buffer.from(content)).resize(square ? {width,height:width,fit:'contain',background:'#FFFFFF00'} : {width}).png({palette:true,quality:90,compressionLevel:9}).toFile(path.join(out,name+'.png'))
}
async function main() {
  fs.mkdirSync(out,{recursive:true})
  const meFiles=await require('./prepare-navigation-me.cjs').prepare()
  if(process.argv.includes('--nav-me-only')){console.log(JSON.stringify({files:meFiles}));return}
  await require('./prepare-theme-refresh.cjs').prepareCats()
  for(const [name,body]of Object.entries(icons))await write(name,svg(body),name.startsWith('nav-')?81:name.startsWith('type-')?128:160)
  // Tight original icon viewBoxes avoid shrinking the drawing inside 24px menu icons.
  const compactBoxes={'discover':[52,48,138,138],'trash':[52,50,136,138],'keepsakes':[57,44,125,155],'feedback':[50,58,140,135],'support':[53,68,134,119],'nav-items':[52,42,136,162]}
  for(const [name,box] of Object.entries(compactBoxes))await write('compact-'+name,svg(icons[name],72,72).replace('viewBox="0 0 72 72"','viewBox="'+box.join(' ')+'"'),96)
  // A dedicated tight viewBox keeps the visible paw large without changing other artwork.
  await write('paw-button',svg(paw,82,88).replace('viewBox="0 0 82 88"','viewBox="76 46 82 88"'),128)
  const label=(kind)=>svg(`<path d="M4 6h324l27 13-3 32H8Z" fill="white" stroke="#292929" stroke-width="1.5"/><path d="M328 6v13h27" fill="${yellow}" stroke-width="1.5"/><path d="M22 26h36l-4 18H26ZM27 26V16h11v10m1 0V19h13v7" fill="white" stroke-width="1.5"/><path d="M303 23h24v23h-24Z" fill="white" stroke-dasharray="2 3" stroke-width="1.2"/><path d="M307 33l6 6 10-12" stroke-width="1.8" fill="none"/><path d="M278 6h35v6h-35Z" fill="${pink}" stroke="none"/>`,360,56)
  for(const name of ['save','login','identity','purchase','memories','collection','add','add-sage'])await write('label-'+name,label(name),720)
  for(let month=1;month<=12;month++)await write('month-'+String(month).padStart(2,'0'),svg(`<path d="M22 159q88 18 189-2" stroke="${yellow}" stroke-width="22"/><text x="116" y="148" text-anchor="middle" font-family="sans-serif" font-size="118" font-weight="700" fill="${ink}" stroke="none">${String(month).padStart(2,'0')}</text>`),300)
  console.log(JSON.stringify({files:fs.readdirSync(out).length,pngBytes:fs.readdirSync(out).filter(n=>n.endsWith('.png')).reduce((n,f)=>n+fs.statSync(path.join(out,f)).size,0)}))
}
main().catch(e=>{console.error(e);process.exitCode=1})
