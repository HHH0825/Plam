// Original, seamless artwork. Keep sources outside the mini-program package.
const fs = require('node:fs'), path = require('node:path'), sharp = require('sharp')
const source = path.resolve(__dirname, '../branding/page-dots-20261011')
const runtime = path.resolve(__dirname, '../miniprogram/styles/page-dots.wxss')
const points = [
  [18, 23, 1.6], [77, 15, 1.1], [137, 30, 1.7], [204, 19, 1.3],
  [40, 84, 1.2], [103, 72, 1.8], [165, 92, 1.1], [228, 76, 1.5],
  [12, 146, 1.7], [72, 132, 1.3], [133, 153, 1.1], [198, 138, 1.9],
  [38, 207, 1.2], [102, 196, 1.6], [165, 216, 1.4], [226, 199, 1.1]
]
async function main() {
  fs.mkdirSync(source, { recursive: true })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">\n${points.map(([x,y,r],i) => `  <circle cx="${x}" cy="${y}" r="${Math.min(3,r * 1.5 + .5).toFixed(2)}" fill="${[3,6,9,14].includes(i) ? '#F4CCD9' : '#FFE59A'}"/>`).join('\n')}\n</svg>\n`
  fs.writeFileSync(path.join(source, 'dots.svg'), svg)
  const png = await sharp(Buffer.from(svg)).resize(480,480).png({ palette:true, effort:10 }).toBuffer()
  fs.writeFileSync(path.join(source, 'dots@2x.png'), png)
  // Local file URLs are not supported for WXSS backgrounds; embed this tiny tile once.
  const css = `/* Shared page-only dots; cards, native chrome and export canvases stay clean. */\npage {\n  background-image:url("data:image/png;base64,${png.toString('base64')}");\n  background-size:240px 240px;\n  background-position:0 0;\n  background-repeat:repeat;\n}\n`
  if (Buffer.byteLength(css) > 10 * 1024) throw Error('Embedded dot artwork exceeds 10 KiB')
  fs.writeFileSync(runtime, css)
  console.log(JSON.stringify({ pngBytes:png.length, runtimeBytes:Buffer.byteLength(css) }))
}
main().catch(error => { console.error(error); process.exitCode=1 })
