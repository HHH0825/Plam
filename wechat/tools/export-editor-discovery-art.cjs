// Original editable paper shapes and UI icons; watercolor mascots are separate PNGs.
const fs = require('node:fs'), path = require('node:path'), sharp = require(process.env.PALM_SHARP_PATH || 'sharp')
const directory = path.resolve(__dirname, '../miniprogram/assets/editor-discovery')
function paper(fill, dashed) {
  const width = 360, height = 148
  let border = 'M5 11'
  for (let x=5; x<353; x+=12) border += ` q3 -3 6 0 q3 3 6 0`
  border += ' L355 136'
  for (let x=355; x>7; x-=12) border += ' q-3 3 -6 0 q-3 -3 -6 0'
  border += ' Z'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs><pattern id="grain" width="22" height="19" patternUnits="userSpaceOnUse"><circle cx="3" cy="7" r=".4" fill="#B28E73" opacity=".18"/><circle cx="16" cy="13" r=".35" fill="#B28E73" opacity=".15"/></pattern></defs>
  <path d="${border}" fill="${fill}" stroke="#DECCB7" stroke-width=".7"/>
  <path d="${border}" fill="url(#grain)"/>
  <path d="M15 38H345 M15 63H345 M15 88H345 M15 113H345" stroke="#C5A38D" stroke-width=".65" opacity=".26"/>
  ${dashed ? '<path d="M12 18v108" stroke="#B87C69" stroke-width="2" stroke-dasharray="8 5" opacity=".65"/>' : ''}
  <path d="m31 6 53-3 2 12-53 4Z" fill="#CCD8C1" opacity=".9"/>
  </svg>`
}
function discoveryPaper() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="210" viewBox="0 0 420 210">
  <defs>
    <linearGradient id="rose" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#E8CBC1"/><stop offset=".65" stop-color="#F0DCD2"/><stop offset="1" stop-color="#F5EADF"/></linearGradient>
    <linearGradient id="soft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="white"/><stop offset=".76" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity=".35"/></linearGradient>
    <pattern id="grain" width="23" height="21" patternUnits="userSpaceOnUse"><circle cx="4" cy="6" r=".55" fill="#BDA185" opacity=".17"/><path d="m17 14 2 1" stroke="#BDA185" stroke-width=".5" opacity=".2"/></pattern>
    <mask id="blend"><rect width="420" height="210" fill="url(#soft)"/></mask>
  </defs>
  <rect width="420" height="210" fill="url(#grain)"/>
  <g mask="url(#blend)">
    <path d="M0 32 10 28 18 31 30 27 43 31 60 26 74 29 91 26 108 30 125 25 144 28 160 24 180 28 197 26 215 30 230 27 248 30 264 26 279 32 294 29 311 33 329 29 344 33 360 30 376 35 394 31 420 36V184L404 187 391 183 370 190 355 187 339 193 320 188 302 194 282 190 264 196 244 191 225 194 205 190 187 193 166 187 147 190 128 185 108 188 87 183 68 187 49 181 32 185 15 180 0 183Z" fill="url(#rose)"/>
    <path d="M24 56H407 M24 81H410 M24 106H410 M24 131H408 M24 156H407 M24 181H399" stroke="#BF9D8B" stroke-width=".6" opacity=".25"/>
    <path d="M14 35v144" stroke="#B97D6B" stroke-width="1.8" stroke-dasharray="8 5" opacity=".55"/>
  </g>
  <path d="m31 23 57-6 3 14-58 7Z" fill="#CED9C6" opacity=".95"/>
  </svg>`
}
const icons = {
  'header-editor':paper('#F9EDE0',false), 'header-discovery':paper('#EAD0C8',true),
  'header-discovery-v3':discoveryPaper(),
  'camera-add':`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g fill="none" stroke="#B4947F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M31 32H12a5 5 0 0 1-5-5V16a5 5 0 0 1 5-5h5l3-5h9l3 5h4a5 5 0 0 1 5 5v8"/><circle cx="24" cy="21" r="7"/><path d="M37 28v14m-7-7h14"/></g></svg>`,
  'number-tape':`<svg xmlns="http://www.w3.org/2000/svg" width="52" height="32" viewBox="0 0 52 32"><path d="m3 5 43-4 3 4-2 4 4 4-2 4 2 7-47 6 1-5-3-4 3-4-3-4 3-4Z" fill="#DDE4D7"/><path d="m9 6 29-3 6 22-32 3Z" fill="#F2F2E9" opacity=".28"/></svg>`,
  'form-paw':`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g fill="#CC9D8A"><ellipse cx="7" cy="12" rx="3" ry="4" transform="rotate(-20 7 12)"/><ellipse cx="13" cy="7" rx="3" ry="4" transform="rotate(-8 13 7)"/><ellipse cx="20" cy="7" rx="3" ry="4" transform="rotate(8 20 7)"/><ellipse cx="26" cy="13" rx="3" ry="4" transform="rotate(20 26 13)"/><path d="M7 25c-1-4 2-6 5-9 2-3 6-3 8 0 3 3 6 5 5 9-1 4-5 3-9 2-4 1-8 2-9-2Z"/></g></svg>`,
  'calendar':`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="#75675E" stroke-width="1.5" stroke-linecap="round"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4m8-4v4"/></g></svg>`,
  'down':`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" fill="none" stroke="#69564C" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}
async function main() {
  fs.mkdirSync(directory,{recursive:true})
  for (const [name,svg] of Object.entries(icons)) {
    fs.writeFileSync(path.join(directory,name+'.svg'),svg)
    const meta=await sharp(Buffer.from(svg)).metadata()
    await sharp(Buffer.from(svg)).resize(meta.width*3,meta.height*3).png().toFile(path.join(directory,name+'.png'))
  }
  console.log(JSON.stringify({exported:Object.keys(icons),directory}))
}
main().catch(error=>{console.error(error);process.exitCode=1})
