const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { build, minifyScript, writeProject } = require('./build-local-variants.cjs')
const sizes = require('./package-sizes.cjs')

const workspace = path.resolve(__dirname, '../..')
const pilot = path.join(workspace, 'wechat/react-pilot')
const out = path.join(workspace, 'test-results/local-builds')
const variant = 'local-react-pilot'
const route = 'pages/storage-locations'
const generated = route + '/react-build/'
const component = generated + 'components/storage-locations/index'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const read = (root, name) => fs.readFileSync(path.join(root, name))
const localNetwork = /wx\s*\.\s*(?:cloud|login|request|uploadFile|downloadFile|requestPayment|requestVirtualPayment)\b|Bearer\s|session_token|CLOUDBASE_ENV_ID/

function readGenerated(dir, prefix = '') {
  const files = new Map()
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = prefix + entry.name
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      for (const [child, bytes] of readGenerated(file, name + '/')) files.set(child, bytes)
    } else if (entry.isFile() && /\.(?:js|json|wxml|wxss|wxs|LICENSE\.txt)$/.test(name)) {
      if (/^app\./.test(name)) throw Error('Unexpected Taro App file: ' + name)
      files.set(generated + name, fs.readFileSync(file))
    } else {
      throw Error('Unexpected Taro output: ' + name)
    }
  }
  return files
}

function dependency(entries, from, ref, suffix) {
  if (!ref.startsWith('.')) throw Error('Expected a relative component dependency in ' + from + ': ' + ref)
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), ref))
  if (!target.startsWith(generated)) throw Error('Component dependency left the subpackage bundle: ' + ref)
  const resolved = [target, target + suffix].find(name => entries.has(name))
  if (!resolved) throw Error('Missing dependency in ' + from + ': ' + ref)
  return resolved
}

function verifyComponentGraph(entries) {
  const seen = new Set()
  const queue = ['.js', '.json', '.wxss', '.wxml'].map(ext => component + ext)
  while (queue.length) {
    const name = queue.pop()
    if (seen.has(name)) continue
    seen.add(name)
    if (!entries.has(name)) throw Error('Missing component file: ' + name)
    const content = entries.get(name).toString()
    if (name.endsWith('.js')) {
      for (const [, ref] of content.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)) queue.push(dependency(entries, name, ref, '.js'))
    }
    if (name.endsWith('.json')) {
      for (const ref of Object.values(JSON.parse(content).usingComponents || {})) {
        const config = dependency(entries, name, ref.replace(/\.js$/, ''), '.json')
        queue.push(config, config.replace(/\.json$/, '.js'), config.replace(/\.json$/, '.wxml'))
      }
    }
    if (name.endsWith('.wxml')) {
      for (const [, ref] of content.matchAll(/\b(?:import|include|wxs)\b[^>]*?\bsrc=["']([^"']+)["']/g)) {
        queue.push(dependency(entries, name, ref, ''))
      }
    }
    if (name.endsWith('.wxss')) {
      for (const [, ref] of content.matchAll(/@import\s+["']([^"']+)["']/g)) queue.push(dependency(entries, name, ref, '.wxss'))
    }
  }
  for (const name of entries.keys()) {
    if (name.startsWith(generated) && !seen.has(name) && !name.endsWith('.LICENSE.txt') &&
        name !== generated + 'contracts/storage-locations.js') throw Error('Unverified component output: ' + name)
  }
}

function nativeEntries(manifest, source) {
  const root = path.join(out, source ? 'local-source' : 'local')
  return new Map(manifest.files.map(row => {
    const bytes = read(root, row.name)
    if (sha(bytes) !== (source ? row.sourceSha256 : row.sha256)) throw Error('Native build changed: ' + row.name)
    return [row.name, bytes]
  }))
}

function pilotInputs() {
  const names = []
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(pilot, dir), { withFileTypes: true })) {
      const name = dir + '/' + entry.name
      if (entry.isDirectory()) walk(name)
      else if (entry.isFile()) names.push(name)
    }
  }
  for (const dir of ['config', 'native', 'src']) walk(dir)
  names.push('.node-version', 'package.json', 'package-lock.json', 'babel.config.js', 'tsconfig.json', 'tsconfig.contracts.json')
  return names.sort().map(name => ({ name, sha256: sha(read(pilot, name)) }))
}

async function assemble() {
  const manifestPath = path.join(out, variant + '-manifest.json')
  if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath)
  await build('local')
  const native = JSON.parse(read(out, 'local-manifest.json'))
  const sourceEntries = nativeEntries(native, true)
  const builtEntries = nativeEntries(native, false)
  const app = JSON.parse(sourceEntries.get('app.json'))
  if (!sizes.packages(app).some(p => p.root === route && p.pages.includes('index'))) throw Error('Storage subpackage missing')
  if (JSON.parse(sourceEntries.get('project.config.json')).appid !== 'touristappid') throw Error('Expected public AppID in generated project')
  const compiled = readGenerated(path.join(pilot, 'dist/weapp'))
  compiled.set(generated + 'contracts/storage-locations.js', read(pilot, 'dist/contracts/storage-locations.js'))
  verifyComponentGraph(compiled)
  for (const [name, bytes] of compiled) {
    if (sourceEntries.has(name)) throw Error('Taro output would replace an existing file: ' + name)
    sourceEntries.set(name, bytes)
    builtEntries.set(name, bytes)
  }
  const overlay = ['index.js', 'index.json', 'index.wxml', 'project-view-model.js', 'dispatch-intent.js']
  for (const file of overlay) {
    const name = route + '/' + file
    const bytes = read(pilot, 'native/' + file)
    if (localNetwork.test(bytes.toString())) throw Error('Business network/auth/payment in overlay: ' + file)
    sourceEntries.set(name, bytes)
    builtEntries.set(name, file.endsWith('.js') ? await minifyScript(bytes) : bytes)
  }
  const files = [...sourceEntries].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([name, raw]) => {
    const compiled = builtEntries.get(name)
    return { name, sourceBytes: raw.length, sourceSha256: sha(raw), bytes: compiled.length, sha256: sha(compiled) }
  })
  const sourcePackages = sizes.measure(files, app, 'sourceBytes')
  const builtPackages = sizes.measure(files, app)
  sizes.check(sourcePackages)
  sizes.check(builtPackages)
  const sourceProject = 'test-results/local-builds/' + variant + '-source'
  const project = 'test-results/local-builds/' + variant
  writeProject(path.join(workspace, sourceProject), sourceEntries)
  writeProject(path.join(workspace, project), builtEntries)
  const evidence = {
    variant, sourceProject, project, pages: native.pages, publicationMode: native.publicationMode,
    uploaded: false, deployed: false, route: route + '/index', contractVersion: 1,
    tools: { node: process.version, taro: '4.3.3', lockSha256: sha(read(pilot, 'package-lock.json')) },
    nativeInputs: native.inputs, pilotInputs: pilotInputs(), sourcePackages, builtPackages, files,
  }
  fs.writeFileSync(manifestPath + '.tmp', JSON.stringify(evidence, null, 2) + '\n')
  fs.renameSync(manifestPath + '.tmp', manifestPath)
  console.log(JSON.stringify({ variant, pages: native.pages, main: builtPackages.mainBytes, storage: builtPackages.packages[route], files: files.length }))
}

if (require.main === module) assemble().catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { verifyComponentGraph }
