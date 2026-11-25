const fs=require('node:fs'),path=require('node:path')
const sharp=require('sharp')
const root=path.resolve(__dirname,'..'),out=path.join(root,'miniprogram/assets/report-editorial'),original=path.join(root,'branding/report-editorial')
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(original,{recursive:true})
const inputs=process.argv.slice(2)
const files=[['editor-kitten',512],['cover-wash',672]]
const paw='<ellipse cx="50" cy="54" rx="14" ry="12"/><ellipse cx="31" cy="36" rx="6" ry="8" transform="rotate(-25 31 36)"/><ellipse cx="44" cy="29" rx="6" ry="8"/><ellipse cx="58" cy="29" rx="6" ry="8"/><ellipse cx="70" cy="36" rx="6" ry="8" transform="rotate(25 70 36)"/>'
const svg=(w,h,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`
const arts={
 'paper-top':svg(672,32,'<path d="M2 32V11L12 7 24 11 39 5 58 9 75 6 93 10 113 4 131 8 151 6 171 10 190 5 211 8 230 4 251 9 273 6 292 10 313 5 336 8 357 3 377 9 398 5 419 10 441 6 462 8 483 4 504 10 525 6 546 9 567 4 588 8 609 5 631 9 650 4 670 9V32Z" fill="#FFFCF7" stroke="#E7DECE" stroke-width="1"/>'),
 'paper-middle':svg(672,80,'<path d="M2 0H670V80H2Z" fill="#FFFCF7"/><path d="M2 0V80M670 0V80" stroke="#E7DECE"/><g fill="#BCAA92" opacity=".12"><circle cx="16" cy="26" r=".7"/><circle cx="654" cy="59" r=".7"/><circle cx="96" cy="76" r=".4"/><circle cx="504" cy="20" r=".4"/></g>'),
 'paper-bottom':svg(672,32,'<path d="M2 0H670V21L655 26 637 22 617 28 597 24 576 29 556 23 537 27 517 24 496 29 475 25 455 28 434 22 413 27 393 23 373 28 353 24 332 29 311 24 291 28 270 22 249 27 228 24 207 29 186 23 165 27 143 24 122 28 100 22 80 27 59 24 39 29 21 23 2 27Z" fill="#FFFCF7" stroke="#E7DECE" stroke-width="1"/>'),
 'number-tape':svg(66,48,'<path d="M3 8L63 2 61 41 6 47 8 38 2 33 7 24 2 18Z" fill="#DDE5CF" opacity=".95"/><path d="M9 10L59 6" stroke="#F6F7EF" opacity=".6"/>'),
 'label-tape':svg(160,45,'<path d="M4 8L156 3 153 39 7 43 10 35 3 28 8 21Z" fill="#DDE5CF"/>'),
 'corner-tape':svg(70,28,'<path d="M4 2L67 8 63 26 1 20Z" fill="#DFE6D5" opacity=".85"/>'),
 'leaf':svg(76,40,'<g fill="none" stroke="#899579" stroke-width="1.7" stroke-linecap="round"><path d="M6 34Q29 32 65 8M21 30Q6 8 29 19Q35 24 21 30M36 23Q26 1 44 9Q51 14 36 23M49 17Q42 1 57 4Q66 7 49 17M29 27Q48 30 45 21Q39 18 29 27"/></g>'),
 'postmark':svg(150,116,'<g fill="none" stroke="#B68872" stroke-width="1.4" opacity=".62"><circle cx="60" cy="57" r="48"/><circle cx="60" cy="57" r="42"/><path d="M96 35q12 -8 24 0t26 0M100 47q12 -8 24 0t26 0M102 59q12 -8 24 0t26 0"/></g><g fill="#B68872" opacity=".64" transform="translate(10 5)">'+paw+'</g>'),
 'memory-stamp':svg(100,100,'<g fill="none" stroke="#A57D67" stroke-width="1.4"><circle cx="50" cy="50" r="45"/><circle cx="50" cy="50" r="39" stroke-dasharray="2 3"/></g><g fill="#A57D67">'+paw+'</g><path d="M30 76H70" stroke="#A57D67" stroke-width="1.2"/>'),
 'paw-signature':svg(100,78,'<g fill="#A57D67">'+paw+'</g>'),
 'memory-book':svg(100,100,'<path d="M23 18h53v64H23z" fill="#F5F0E4" stroke="#796455" stroke-width="2"/><path d="M28 22h8v56h-8M64 18v22l-8-6-8 6V18" fill="#E0E6D5" stroke="#796455" stroke-width="1.5"/><g fill="#A57D67" transform="translate(19 34) scale(.62)">'+paw+'</g>')
}
async function main(){
 if(inputs.length!==0&&inputs.length!==2)throw Error('Pass kitten and wash source PNGs, or no arguments to re-export saved originals.')
 for(const [index,[name,width]]of files.entries()){
  const source=path.join(original,name+'-source.png')
  if(inputs.length)fs.copyFileSync(inputs[index],source)
  await sharp(source).trim().resize({width}).png({palette:true,colours:128,dither:.25}).toFile(path.join(out,name+'.png'))
 }
 for(const [name,code]of Object.entries(arts)){fs.writeFileSync(path.join(out,name+'.svg'),code);await sharp(Buffer.from(code)).png().toFile(path.join(out,name+'.png'))}
 const tile=fs.readFileSync(path.join(out,'paper-middle.png')).toString('base64')
 fs.writeFileSync(path.join(root,'miniprogram/styles/report-texture.wxss'),`.paper-middle { background-image:url("data:image/png;base64,${tile}");background-repeat:repeat-y;background-size:100% auto; }\n`)
 const sizes=fs.readdirSync(out).filter(f=>f.endsWith('.png')).map(f=>({file:f,bytes:fs.statSync(path.join(out,f)).size}))
 const total=sizes.reduce((n,a)=>n+a.bytes,0);if(total>300*1024)throw Error('Runtime art exceeds 300 KiB: '+total)
 fs.writeFileSync(path.join(original,'asset-sizes.json'),JSON.stringify({total,sizes},null,2));console.log({total,limit:300*1024})
}
main().catch(e=>{console.error(e);process.exitCode=1})
