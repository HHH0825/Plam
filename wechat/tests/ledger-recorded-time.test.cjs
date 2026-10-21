const test=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process')
const ledger=require('../miniprogram/utils/ledger')

test('server offsets and microseconds produce exact Beijing seconds without rounding',()=>{
 assert.deepEqual(ledger.recordedAt('2026-10-15T06:08:36.999999+00:00'),{date:'2026-10-15',time:'14:08:36',text:'2026-10-15 14:08:36'})
 for(const stamp of ['2026-10-15T14:08:36+08:00','2026-10-15T02:08:36-04:00','2026-10-15T06:08:36Z'])assert.equal(ledger.recordedAt(stamp).text,'2026-10-15 14:08:36')
 assert.equal(ledger.recordedAt('2026-12-31T16:00:00Z').text,'2027-01-01 00:00:00')
 assert.equal(ledger.recordedAt('2024-02-28T16:00:00Z').text,'2024-02-29 00:00:00')
 assert.equal(ledger.recordedAt('2026-01-01T00:30:00+14:00').text,'2025-12-31 18:30:00')
})

test('invalid dates, ambiguous timezones and missing timestamps never invent a time',()=>{
 for(const value of [undefined,null,0,{},'', '2026-10-15','2026-10-15T06:08:36','2026-02-29T06:00:00Z','2026-04-31T06:00:00Z','2026-00-15T06:00:00Z','2026-10-00T06:00:00Z','2026-10-15T24:00:00Z','2026-10-15T06:60:00Z','2026-10-15T06:08:60Z','2026-10-15T06:08:36+25:00','2026-10-15T06:08:36+08:60','0000-01-01T00:00:00Z'])assert.equal(ledger.recordedAt(value),null,String(value))
})

test('creation time is independent of cash-flow date, update time and entry source',()=>{
 const base={id:'entry',amount:'18.00',kind:'expense',category:'food',occurred_on:'2025-01-01',created_at:'2026-10-15T06:08:36Z',updated_at:'2026-10-16T09:00:00Z'}
 for(const source of ['manual','purchase','maintenance','subscription','installment','disposal','refund']){
  const raw={...base,source},before=structuredClone(raw),row=ledger.row(raw)
  assert.equal(row.occurred_on,'2025-01-01');assert.equal(row.recordedAt.text,'2026-10-15 14:08:36');assert.deepEqual(raw,before)
  assert.equal(ledger.row({...raw,state:'void',updated_at:'2027-01-01T00:00:00Z'}).recordedAt.text,row.recordedAt.text)
 }
 assert.equal(ledger.row({...base,created_at:undefined}).recordedAt,null)
 const groups=ledger.groups([base]);assert.equal(groups[0].date,'2025-01-01');assert.equal(groups[0].entries[0].recordedAt.date,'2026-10-15')
})

test('device timezone cannot alter Beijing display',()=>{
 const script="console.log(require('./wechat/miniprogram/utils/ledger').recordedAt('2026-10-15T16:00:01.123456+00:00').text)"
 for(const TZ of ['UTC','America/New_York','Pacific/Honolulu','Asia/Shanghai'])assert.equal(execFileSync(process.execPath,['-e',script],{cwd:require('node:path').resolve(__dirname,'../..'),env:{...process.env,TZ},encoding:'utf8'}).trim(),'2026-10-16 00:00:01')
})
