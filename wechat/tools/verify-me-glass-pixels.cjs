// Compare the same static backdrop inside the card, away from text and borders.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp')
const out=path.resolve(__dirname,'../docs/images/me-glass-20261012')
async function main(){
 const rows=[]
 for(const mode of ['on','off','fallback']){
  const file=path.join(out,`glass-probe-${mode}-native.png`),meta=await sharp(file).metadata()
  const region={left:Math.round(meta.width*.15),top:Math.round(meta.width*.715),width:Math.round(meta.width*.68),height:10}
  const {data,info}=await sharp(file).extract(region).removeAlpha().raw().toBuffer({resolveWithObject:true})
  let variation=0,samples=0
  for(let y=0;y<info.height;y++)for(let x=1;x<info.width;x++)for(let c=0;c<3;c++){const i=(y*info.width+x)*info.channels+c;variation+=Math.abs(data[i]-data[i-info.channels]);samples++}
  rows.push({mode,region,adjacentVariation:variation/samples})
 }
 const passed=rows[0].adjacentVariation<rows[1].adjacentVariation*.3&&rows[1].adjacentVariation>1
 const result={passed,comparison:'same native screenshot position; horizontal variation in top interior of card',rows}
 fs.writeFileSync(path.join(out,'glass-pixels.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
 if(!passed)throw Error('Native blur failed to soften the backdrop sufficiently')
}
main().catch(e=>{console.error(e);process.exitCode=1})
