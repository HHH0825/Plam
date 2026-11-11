'use strict'
const R=require('../../../local-core/rules')
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)
const error=()=>R.fail('备份资料的字段或关联关系无效',400,'INVALID_BACKUP')
const natural=v=>Number.isSafeInteger(v)&&v>=0
const date=v=>{try{return R.date(v,'日期',false)===v}catch(_){return false}}
function validateFull(tables){
 const settings=tables.settings
 if(settings.length!==1||settings[0].id!=='current')error()
 const s=settings[0]
 if(!object(s.user)||!['number','string'].includes(typeof s.user.id)||typeof s.user.username!=='string'||!s.user.username.trim()||typeof s.ledger_enabled!=='boolean'||!object(s.appearance))error()
 for(const field of ['checkins','visits','greetings'])if(s[field]!==undefined&&(!Array.isArray(s[field])||s[field].some(d=>!date(d))||new Set(s[field]).size!==s[field].length))error()
 if(s.sequences!==undefined&&(!object(s.sequences)||Object.values(s.sequences).some(n=>!natural(n))))error()
 if(!['default','sage','pink','blue'].includes(s.appearance.theme)||!['default','simple','journal'].includes(s.appearance.template))error()
 const numeric=new Set(['items','maintenance_records','disposal_records','usage_records','wishlist','fixed_expenses','expense_payments','storage_locations'])
 const nested=new Set(['payment_info','changes','category_cents','user','appearance','checkins','visits','greetings','sequences'])
 for(const [name,rows]of Object.entries(tables))for(const row of rows){
  if(numeric.has(name)?!Number.isSafeInteger(row.id)||row.id<1:typeof row.id!=='string'||row.id.length>120)error()
  if(row.revision!==undefined&&!natural(row.revision))error()
  for(const [field,value]of Object.entries(row)){
   if(value===null)continue
   if(field.endsWith('_cents')&&!natural(value))error()
   if(field.endsWith('_on')&&typeof value==='string'&&!date(value))error()
   if((field==='deleted_at'||field==='created_at')&&(typeof value!=='string'||!Number.isFinite(Date.parse(value))))error()
   if(typeof value==='object'&&!nested.has(field))error()
   if(typeof value==='string'&&value.length>100000)error()
  }
 }
 const items=new Map(tables.items.map(i=>[i.id,i])),locations=new Set(tables.storage_locations.map(i=>i.id)),plans=new Map(tables.fixed_expenses.map(i=>[i.id,i])),books=new Set(['default',...tables.books.map(i=>i.id)]),entries=new Map(tables.ledger_entries.map(i=>[i.id,i]))
 const itemLink=r=>{if(r.item_id!=null&&!items.has(r.item_id)&&!r.item_removed&&r.source!=='purchase'&&r.source!=='maintenance'&&r.source!=='disposal')error()}
 for(const i of items.values()){
  if(!['active','idle','disposed'].includes(i.status)||!date(i.purchase_date)||!natural(i.purchase_cents)||typeof i.name!=='string'||!i.name.trim())error()
  if(i.storage_location_id!=null&&!locations.has(i.storage_location_id))error()
  if(i.warranty_expires_on&&(!date(i.warranty_expires_on)||i.warranty_expires_on<i.purchase_date))error()
  if(i.payment_info&&(!object(i.payment_info)||!['paid','installment','archive'].includes(i.payment_info.mode)))error()
 }
 const disposed=new Set()
 for(const [table,field]of [['maintenance_records','maintained_on'],['disposal_records','disposed_on'],['usage_records','used_on']])for(const row of tables[table]){
  const item=items.get(row.item_id);if(!item||!date(row[field])||row[field]<item.purchase_date)error()
  if(table==='disposal_records'){if(disposed.has(row.item_id)||item.status!=='disposed')error();disposed.add(row.item_id)}
 }
 for(const i of items.values())if(i.status==='disposed'&&!disposed.has(i.id))error()
 for(const p of plans.values()){
  if(!['subscription','installment'].includes(p.kind)||!['active','paused','ended'].includes(p.status)||!['month','quarter','year','days'].includes(p.cycle)||!date(p.anchor_on)||!natural(p.amount_cents)||!natural(p.schedule_version))error()
  if(p.cycle==='days'&&(!Number.isSafeInteger(p.cycle_days)||p.cycle_days<1||p.cycle_days>3650))error()
  if(p.kind==='installment'&&(!Number.isSafeInteger(p.periods)||p.periods<1||p.periods>600||!natural(p.principal_total_cents)||p.principal_total_cents<p.periods))error()
  if(p.book_id&&!books.has(p.book_id))error();itemLink(p)
 }
 const cycles=new Set()
 for(const p of tables.expense_payments){if(typeof p.voided!=='boolean'||!natural(p.cycle_index)||!natural(p.schedule_version)||!date(p.paid_on)||!natural(p.cost_cents)||!natural(p.principal_cents))error();if(p.kind!==plans.get(p.expense_id)?.kind)error();if(!p.voided){const key=[p.expense_id,p.schedule_version,p.cycle_index].join(':');if(cycles.has(key))error();cycles.add(key)}itemLink(p)}
 const sources=new Set()
 for(const e of entries.values()){
  if(!['expense','income','refund'].includes(e.kind)||!['active','void','zero','pending','linked'].includes(e.state)||!Object.hasOwnProperty.call(R.SOURCES,e.source)||!date(e.occurred_on)||!natural(e.amount_cents)||e.book_id&&!books.has(e.book_id))error()
  if(e.source==='refund'&&(e.kind!=='refund'||!e.parent_id))error()
  if(e.source!=='refund'&&e.parent_id)error()
  if(e.source_id!=null){const key=e.source+':'+e.source_id;if(sources.has(key))error();sources.add(key)}
 }
 for(const b of tables.budgets)if(!object(b.category_cents)||Object.values(b.category_cents).some(n=>!natural(n))||b.total_cents!==null&&!natural(b.total_cents))error()
 return true
}
module.exports={validateFull}
