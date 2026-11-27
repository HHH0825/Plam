const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { check } = require('../tools/package-sizes.cjs')
const { verifyComponentGraph } = require('../tools/build-react-pilot.cjs')

const base = path.resolve(__dirname, '../../test-results/local-builds')
const route = 'pages/storage-locations'
const generated = route + '/react-build/'
const pilotSource = path.resolve(__dirname, '../react-pilot')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const read = name => fs.readFileSync(path.join(base, name))

test('candidate retains native routes, identical main files, verified hashes and package budgets', () => {
  const native = JSON.parse(read('local-manifest.json'))
  const pilot = JSON.parse(read('local-react-pilot-manifest.json'))
  assert.equal(pilot.pages, 26)
  assert.equal(pilot.uploaded, false)
  assert.equal(pilot.deployed, false)
  assert.equal(pilot.publicationMode, 'direct-local')
  assert.equal(pilot.builtPackages.mainBytes, native.builtPackages.mainBytes)
  assert.equal(pilot.sourcePackages.mainBytes, native.sourcePackages.mainBytes)
  assert.ok(pilot.pilotInputs.length > 10)
  for (const input of pilot.pilotInputs) {
    assert.equal(sha(fs.readFileSync(path.join(pilotSource, input.name))), input.sha256, input.name)
  }
  check(pilot.builtPackages)
  check(pilot.sourcePackages)
  const outside = rows => rows.filter(row => !row.name.startsWith(route + '/')).sort((a,b) => a.name.localeCompare(b.name))
  assert.deepEqual(outside(pilot.files), outside(native.files))
  for (const row of pilot.files) {
    assert.equal(sha(read('local-react-pilot/' + row.name)), row.sha256, row.name)
    assert.equal(sha(read('local-react-pilot-source/' + row.name)), row.sourceSha256, row.name)
    assert.doesNotMatch(row.name, /\.(?:map|sqlite3?|key|pem|zip)$|(?:^|\/)project\.private\./)
  }
  assert.deepEqual(read('local-react-pilot/app.json'), read('local/app.json'))
  assert.equal(JSON.parse(read('local-react-pilot/project.config.json')).appid, 'touristappid')
  const config = JSON.parse(read('local-react-pilot/' + route + '/index.json'))
  assert.equal(config.usingComponents['storage-react'], './react-build/components/storage-locations/index')
  assert.equal(sha(read('local-react-pilot/' + route + '/index.wxss')), sha(read('local/' + route + '/index.wxss')))
})

test('generated code is component-only and its runtime references remain in the subpackage', () => {
  const pilot = JSON.parse(read('local-react-pilot-manifest.json'))
  const generatedRows = new Map(pilot.files.filter(row => row.name.startsWith(generated))
    .map(row => [row.name, read('local-react-pilot/' + row.name)]))
  assert.ok(generatedRows.size > 1)
  assert.equal(generatedRows.has(generated + 'app.js'), false)
  assert.equal(generatedRows.has(generated + 'app.json'), false)
  verifyComponentGraph(generatedRows)
  const entry = generated + 'components/storage-locations/index.js'
  const tampered = new Map(generatedRows)
  tampered.set(entry, Buffer.from('require("../../../../outside")'))
  assert.throws(() => verifyComponentGraph(tampered), /left the subpackage/)
  for (const file of ['index.js', 'controller.js', 'dispatch-intent.js', 'project-view-model.js']) {
    assert.doesNotMatch(read('local-react-pilot-source/' + route + '/' + file).toString(),
      /wx\.(?:cloud|login|request|uploadFile|downloadFile|requestPayment|requestVirtualPayment)\b/)
  }
})
