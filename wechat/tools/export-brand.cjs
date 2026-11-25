// Export the editable brand artwork without changing historical assets.
const fs = require('node:fs'), path = require('node:path')
const sharp = require('sharp')
const directory = path.resolve(__dirname, '../miniprogram/assets/brand')
async function main() {
  const icon = fs.readFileSync(path.join(directory, 'paw-ledger-icon.svg'))
  for (const size of [1024, 512]) await sharp(icon).resize(size, size).png().toFile(path.join(directory, 'paw-ledger-icon-' + size + '.png'))
  await sharp({ create: { width: 720, height: 576, channels: 4, background: '#F2EADF' } }).composite([{ input: await sharp(icon).resize(480, 480).png().toBuffer(), left: 120, top: 48 }]).png().toFile(path.join(directory, 'paw-ledger-card.png'))
  await sharp(fs.readFileSync(path.join(directory, 'paw-ledger-mark.svg'))).resize(384, 384).png().toFile(path.join(directory, 'paw-ledger-mark.png'))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
