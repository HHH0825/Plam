const catalogue = require('./item-cover-catalogue')
const groups = [['digital','数码'],['home','家居'],['daily','日用'],['clothing','衣物'],['books','书籍文具'],['mobility','出行'],['sports','运动'],['tools','工具'],['other','其他']].map(([key,name])=>({key,name}))
const byKey = Object.assign(Object.create(null), Object.fromEntries(catalogue.map(row=>[row.key,row])))
function fallback(item) { const type=groups.some(g=>g.key===item.icon_type)?item.icon_type:'other'; return '/assets/white-doodle/type-'+type+'.png' }
function art(item) { return item && item.cover_mode !== 'photo' && byKey[item.cover_icon_key] ? byKey[item.cover_icon_key].art : fallback(item || {}) }
function photo(item) { return item.cover_mode !== 'icon' && !!item.photo_url }
function search(query='',group='',version=3) { const term=query.trim().toLowerCase(); return catalogue.filter(row=>(row.version||1)<=version&&(!group||row.group===group)&&(!term||(row.name+' '+(row.aliases||'')+' '+groups.find(g=>g.key===row.group).name).toLowerCase().includes(term))) }
module.exports={catalogue,groups,byKey,fallback,art,photo,search}
