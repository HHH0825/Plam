// Prepare independent transparent hero art; never overwrite historical assets.
const fs = require('node:fs'), path = require('node:path')
const sharp = require(process.env.PALM_SHARP_PATH || 'sharp')
const inputs = process.argv.slice(2)
const root = path.resolve(__dirname, '../miniprogram/assets/collection-hero')
const originals = path.resolve(__dirname, '../branding/collection-hero')
const paper = path.resolve(__dirname, '../miniprogram/assets/paper')
async function main() {
  fs.mkdirSync(root, { recursive: true }); fs.mkdirSync(originals, { recursive: true })
  if (inputs.length !== 0 && inputs.length !== 2) throw new Error('Pass kitten and paper source PNGs, or no arguments to re-export saved sources.')
  for (const [index, name, width] of [[0, 'archive-kitten-v1', 512], [1, 'milk-tea-paper-v1', 704]]) {
    const source = path.join(originals, name + '-source.png')
    if (inputs.length) fs.copyFileSync(inputs[index], source)
    await sharp(source).resize({ width }).png({ palette: true, colours: 128, dither: .25, effort: 10 }).toFile(path.join(root, name + '.png'))
    const meta = await sharp(path.join(root, name + '.png')).metadata()
    if (!meta.hasAlpha) throw new Error(name + ' must retain transparency')
    console.log(JSON.stringify({ name, width: meta.width, height: meta.height, bytes: fs.statSync(path.join(root, name + '.png')).size }))
  }
  await sharp(path.join(paper, 'add-sage.svg')).resize(312, 132).ensureAlpha().png().toFile(path.join(paper, 'add-sage.png'))
  const bytes = fs.readdirSync(root).filter(name => name.endsWith('.png')).reduce((total, name) => total + fs.statSync(path.join(root, name)).size, fs.statSync(path.join(paper, 'add-sage.png')).size)
  if (bytes > 250 * 1024) throw new Error('Hero PNG budget exceeded: ' + bytes)
  console.log(JSON.stringify({ totalPngBytes: bytes, limit: 250 * 1024 }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
