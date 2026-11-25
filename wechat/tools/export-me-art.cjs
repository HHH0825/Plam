// Original menu icons matching the app's brown line-art system.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp')
const root=path.resolve(__dirname,'../miniprogram/assets/me')
const paw='<g fill="#845645" stroke="none"><ellipse cx="12" cy="14" rx="1.5" ry="2"/><ellipse cx="17" cy="12" rx="1.5" ry="2"/><ellipse cx="22" cy="14" rx="1.5" ry="2"/><path d="M11 21c-1-2 2-5 5-5s6 3 5 5c-1 2-3 1-5 1s-4 1-5-1Z"/></g>'
const drawings={
  trash:'<path d="M6 9h20M12 9V6h8v3M8 13l1 15h14l1-15"/><path d="m14 16 2-3 2 3m-4 1h4m2 2 2 3-3 1m-2 1h-4l1-3"/>',
  keepsakes:'<rect x="5" y="4" width="23" height="26" rx="3"/><path d="M10 4v26"/>'+paw,
  feedback:'<path d="M5 25 3 30l8-3a13 13 0 1 0-6-2Z"/><circle cx="10" cy="16" r=".7"/><circle cx="16" cy="16" r=".7"/><circle cx="22" cy="16" r=".7"/>',
  support:'<path d="M16 29S3 21 3 12a7 7 0 0 1 13-4 7 7 0 0 1 13 4c0 9-13 17-13 17Z"/>'+paw
}
async function main(){fs.mkdirSync(root,{recursive:true});for(const [name,body]of Object.entries(drawings)){const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="34" viewBox="0 0 32 34"><g fill="none" stroke="#845645" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;fs.writeFileSync(path.join(root,name+'.svg'),svg);await sharp(Buffer.from(svg)).resize(96,102).png().toFile(path.join(root,name+'.png'))}console.log(JSON.stringify({exported:Object.keys(drawings)}))}
main().catch(e=>{console.error(e);process.exitCode=1})
