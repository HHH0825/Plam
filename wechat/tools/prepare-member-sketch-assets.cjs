// Production packaging: isolate the approved reference's small raster drawings.
// Keep enclosed white areas (cat faces / book pages); remove only connected paper.
const fs=require('node:fs'),path=require('node:path')
const sharp=require(process.env.PALM_SHARP_PATH || 'sharp')
const reference=process.argv[2]
if(!reference)throw Error('Pass the original approved sketch PNG')
const out=path.resolve(__dirname,'../miniprogram/assets/membership'),evidence=path.resolve(__dirname,'../docs/images/membership-sketch-20261015')
const regions={ticket:[77,579,84,78],books:[622,680,104,67],analysis:[627,786,99,67],budget:[624,890,92,72],palette:[621,991,94,80],cat:[616,1105,51,49]}
async function main(){
 fs.mkdirSync(out,{recursive:true});fs.mkdirSync(evidence,{recursive:true});fs.copyFileSync(reference,path.join(evidence,'reference.png'))
 const records=[]
 for(const[name,[left,top,width,height]]of Object.entries(regions)){
  const {data,info}=await sharp(reference).extract({left,top,width,height}).ensureAlpha().raw().toBuffer({resolveWithObject:true})
  const visited=new Uint8Array(width*height),queue=[]
  function add(x,y){if(x<0||y<0||x>=width||y>=height)return;const i=y*width+x;if(visited[i])return;const p=i*4,r=data[p],g=data[p+1],b=data[p+2];if(Math.min(r,g,b)<224||Math.max(r,g,b)-Math.min(r,g,b)>35)return;visited[i]=1;queue.push(i)}
  for(let x=0;x<width;x++){add(x,0);add(x,height-1)}for(let y=0;y<height;y++){add(0,y);add(width-1,y)}
  for(let k=0;k<queue.length;k++){const i=queue[k],x=i%width,y=Math.floor(i/width);data[i*4+3]=0;add(x-1,y);add(x+1,y);add(x,y-1);add(x,y+1)}
  await sharp(data,{raw:{width,height,channels:info.channels}}).png({palette:true,colours:128,compressionLevel:9}).toFile(path.join(out,name+'.png'))
  records.push({name,referenceRegion:{left,top,width,height},bytes:fs.statSync(path.join(out,name+'.png')).size})
 }
 fs.writeFileSync(path.join(evidence,'asset-provenance.json'),JSON.stringify({reference:'reference.png',smallDrawings:'Original approved sketch, connected paper removed; enclosed white fills preserved',hero:{method:'Built-in imagegen, transparent reference extraction',source:'exec-c5bfa904-b5c2-46f8-a9b9-d3e51d2c00d1.png',prompt:'Extract only the white cat holding the yellow paw ticket from the reference top right; preserve dark hand-drawn outlines, pink cheeks, hearts, white body and yellow ticket. Transparent background; no UI or text.'},assets:records},null,2))
 console.log('Prepared '+records.length+' reference drawings')
}
main().catch(e=>{console.error(e);process.exitCode=1})
