// Check exclusions against local runtime references without opening user data.
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../miniprogram')
const output = process.env.PALM_PACKAGE_AUDIT_OUTPUT || path.resolve(__dirname, '../branding/package-optimization-20261009')
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).filter(entry => !['.git','node_modules','__pycache__'].includes(entry.name) && !entry.name.startsWith('project.private')).flatMap(entry =>
  entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)])
const files = walk(root).map(file => ({ file: path.relative(root, file).replace(/\\/g, '/'), bytes: fs.statSync(file).size }))
const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))
function matches(file, rule) {
  if (rule.type === 'suffix') return file.endsWith(rule.value)
  if (rule.type === 'file') return file === rule.value.replace(/^\//, '')
  throw new Error('Review new package rule: ' + rule.type)
}
const excluded = files.filter(row => config.packOptions.ignore.some(rule => matches(row.file, rule)) &&
  !config.packOptions.include.some(rule => matches(row.file, rule)))
const excludedSet = new Set(excluded.map(row => row.file))
const sources = files.filter(row => /\.(?:js|json|wxml|wxss)$/.test(row.file) && !row.file.startsWith('project.')).map(row =>
  ({ file: row.file, text: fs.readFileSync(path.join(root, row.file), 'utf8') }))
const references = []
for (const source of sources) {
  for (const match of source.text.matchAll(/(?:\/)?(?:pages\/[\w-]+\/)?assets\/[\w./-]+\.(?:png|webp|svg)/g)) {
    const asset = match[0].replace(/^\//, '')
    if (!fs.existsSync(path.join(root, asset)) || excludedSet.has(asset)) throw new Error('Unavailable asset: ' + source.file + ' -> ' + asset)
    references.push({ source: source.file, asset })
  }
  // Also catch relative/dynamic concatenation of one of the excluded legacy names.
  for (const row of excluded.filter(row => row.file.endsWith('.png'))) {
    const basename = path.basename(row.file)
    const replacement = files.some(candidate => !excludedSet.has(candidate.file) && path.basename(candidate.file) === basename)
    const literal = basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (!replacement && new RegExp('(?<![\\w-])' + literal + '(?![\\w-])').test(source.text)) throw new Error('Excluded basename in runtime: ' + source.file + ' -> ' + row.file)
  }
}
const sum = rows => rows.reduce((total, row) => total + row.bytes, 0)
const audit = { date: process.env.PALM_PACKAGE_AUDIT_DATE || '2026-10-09', rawBytes: sum(files), excludedBytes: sum(excluded), includedRawBytes: sum(files) - sum(excluded),
  excluded, checkedStaticReferences: references.length, references,
  dynamicAssets: 'Preserved all remaining PNGs, including all paper-label variants, header-{sage,rose,small}, classification icons, month numbers and preset avatars.' }
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(path.join(output, 'package-audit.json'), JSON.stringify(audit, null, 2))
console.log(JSON.stringify({ rawBytes: audit.rawBytes, excludedBytes: audit.excludedBytes, includedRawBytes: audit.includedRawBytes, excludedFiles: excluded.length, checkedStaticReferences: references.length }))
