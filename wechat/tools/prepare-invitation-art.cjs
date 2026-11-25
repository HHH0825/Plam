// Compose existing vector character artwork; keep editable text and illustration.
const fs=require('node:fs'),path=require('node:path'),sharp=require(process.env.PALM_SHARP_PATH || 'sharp')
const root=path.resolve(__dirname,'..'),source=path.join(root,'branding/startup-share-20261020'),out=path.join(root,'miniprogram/pages/rewards/assets')
async function main(){
 fs.mkdirSync(source,{recursive:true});fs.mkdirSync(out,{recursive:true})
 const cat=fs.readFileSync(path.join(root,'branding/member-notice-icon-20261017/announcement.svg'),'utf8')
 const inner=cat.replace(/<svg[^>]*>/,'').replace('</svg>','')
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="640" viewBox="0 0 800 640">
 <rect width="800" height="640" fill="#fffcf3"/><rect x="24" y="24" width="752" height="592" rx="36" fill="none" stroke="#eadfbf" stroke-width="2"/>
 <g fill="#f1d36f"><circle cx="88" cy="94" r="5"/><circle cx="699" cy="259" r="4"/><circle cx="105" cy="473" r="4"/></g><g fill="#edc4cc"><circle cx="693" cy="104" r="5"/><circle cx="171" cy="267" r="4"/><circle cx="695" cy="491" r="4"/></g>
 <rect x="294" y="48" width="212" height="42" rx="21" fill="#fff1af"/>
 <g text-anchor="middle" font-family="Microsoft YaHei,微软雅黑,sans-serif" fill="#453e34">
 <text x="400" y="77" font-size="23" font-weight="bold">猫爪物账</text>
 <text x="400" y="152" font-size="39" font-weight="bold">和小猫一起</text>
 <path d="M223 211 Q400 221 577 210" fill="none" stroke="#f6dc81" stroke-width="17" stroke-linecap="round"/>
 <text x="400" y="209" font-size="35" font-weight="bold">收好生活的小喜欢</text>
 </g>
 <ellipse cx="401" cy="390" rx="154" ry="134" fill="#fff2c9"/>
 <g transform="translate(233 347) rotate(-12)"><rect width="96" height="126" rx="13" fill="#fffef9" stroke="#645440" stroke-width="4"/><path d="M12 9V115" stroke="#efd174" stroke-width="12"/>
 <g fill="#edacbd"><ellipse cx="57" cy="77" rx="16" ry="13"/><ellipse cx="36" cy="56" rx="6" ry="9"/><ellipse cx="51" cy="47" rx="6" ry="9"/><ellipse cx="67" cy="47" rx="6" ry="9"/><ellipse cx="80" cy="58" rx="6" ry="9"/></g>
 <path d="M-3 19h13m-13 24h13m-13 24h13m-13 24h13" stroke="#645440" stroke-width="5" stroke-linecap="round"/></g>
 <svg x="275" y="257" width="260" height="260" viewBox="0 0 40 40">${inner}</svg>
 <path d="m568 317 4 12 12 4-12 4-4 12-4-12-12-4 12-4Z" fill="#e2bc54"/>
 <rect x="103" y="550" width="594" height="42" rx="21" fill="#f5efdd"/>
 <text x="400" y="578" text-anchor="middle" font-family="Microsoft YaHei,微软雅黑,sans-serif" font-size="22" fill="#756951">物品管理 · 日均成本 · 日常记账</text>
 </svg>`
 fs.writeFileSync(path.join(source,'invitation.svg'),svg)
 const target=path.join(out,'invitation.png');await sharp(Buffer.from(svg)).png({palette:true,colours:128,dither:0,compressionLevel:9,effort:10}).toFile(target)
 const bytes=fs.statSync(target).size;if(bytes>45*1024)throw Error('Invitation image exceeds budget')
 await sharp(target).resize(300,240).png().toFile(path.join(source,'invitation-chat-preview.png'))
 fs.writeFileSync(path.join(source,'manifest.json'),JSON.stringify({width:800,height:640,bytes,runtime:'pages/rewards/assets/invitation.png',source:'invitation.svg',characterSource:'member-notice-icon-20261017/announcement.svg'},null,2))
 console.log(JSON.stringify({bytes,source,target}))
}
main().catch(e=>{console.error(e);process.exitCode=1})

