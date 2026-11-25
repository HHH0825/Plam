const fs = require('node:fs'), path = require('node:path')
const sharp = require('sharp')
const inputs = process.argv.slice(2)
if (inputs.length !== 2) throw new Error('Pass camera and journal generated PNG paths.')
const assets = path.resolve(__dirname, '../miniprogram/assets/editor-discovery')
const originals = path.resolve(__dirname, '../branding/editor-discovery-v2')
fs.mkdirSync(assets, {recursive:true}); fs.mkdirSync(originals, {recursive:true})
async function main() {
  for (const [index, name] of ['camera-kitten-v2','journal-kitten-v2'].entries()) {
    fs.copyFileSync(inputs[index], path.join(originals, name + '-source.png'))
    const output = path.join(assets, name + '.png')
    await sharp(inputs[index]).resize({width:384,height:384,fit:'inside'}).png({palette:true,colours:256,effort:10,dither:0.5}).toFile(output)
    const meta = await sharp(output).metadata()
    if (!meta.hasAlpha) throw new Error(name + ' must have transparency')
    console.log(JSON.stringify({name,width:meta.width,height:meta.height,hasAlpha:meta.hasAlpha,bytes:fs.statSync(output).size}))
  }
}
main().catch(error => {console.error(error);process.exitCode=1})
