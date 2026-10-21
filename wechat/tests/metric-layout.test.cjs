const test=require('node:test'),assert=require('node:assert/strict')
const {choose,measure}=require('../miniprogram/utils/metric-layout')
const picker=require('../miniprogram/pages/editor/lib/cover-picker')
function probes(amounts=[140,130,120],days=30){return {24:{width:amounts[0],height:33},22:{width:amounts[1],height:30},20:{width:amounts[2],height:27},days:{width:days,height:33}}}
test('measured available width chooses 24,22,20 before stacking, without modifying money',()=>{
 assert.deepEqual([305,260,240].map(w=>choose(w,340,probes()).size),[24,22,20])
 assert.ok([305,260,240].every(w=>choose(w,340,probes()).kind==='columns'))
 assert.equal(choose(150,300,probes([170,150,130],60)).kind,'stacked')
 assert.equal(choose(150,300,probes([170,150,130],60)).size,22)
 assert.equal(choose(100,250,probes([220,210,200],140)).kind,'wide')
 assert.deepEqual(choose(100,200,probes([500,450,400],140)),{kind:'wide',size:20,height:39})
})
test('detail uses its own font hierarchy and gives larger text enough line height',()=>{
 const p={28:{width:230,height:50},26:{width:210,height:47},24:{width:190,height:43},days:{width:90,height:32},total:{width:350,height:35}}
 assert.equal(choose(435,435,p,true).size,28)
 assert.equal(choose(280,280,p,true).kind,'stacked')
 assert.equal(choose(280,280,p,true).height,56)
 assert.equal(choose(280,280,p,true).totalHeight,41)
})
test('late measurements cannot restore layouts after account switch or list refresh',()=>{
 let callback;global.wx={createSelectorQuery:()=>{const q={in(){return q},selectAll(){return q},boundingClientRect(){return q},exec(fn){callback=fn}};return q}}
 const app={globalData:{token:'one'}};global.getApp=()=>app
 const page={_visible:true,_sequence:1,data:{metricLayouts:{}},setData(){throw Error('stale layout applied')}}
 measure(page);app.globalData.token='two';callback([[],[],[]])
 app.globalData.token='one';measure(page);page._sequence++;callback([[],[],[]])
})
test('keyboard resizing keeps picker footer above the keyboard and preserves selection',()=>{
 global.wx={getWindowInfo:()=>({windowHeight:742})}
 const page={data:{iconOpen:true,iconQuery:'杯',iconGroup:'daily',iconSelected:'cup'},setData(p){Object.assign(this.data,p)}}
 picker.resize(page);const original=page.data.coverSheetHeight
 picker.methods.coverKeyboardChange.call(page,{detail:{height:300}})
 assert.ok(page.data.coverSheetHeight<=434)
 assert.equal(page.data.coverSheetBottom,300)
 assert.deepEqual([page.data.iconQuery,page.data.iconGroup,page.data.iconSelected],['杯','daily','cup'])
 picker.methods.coverKeyboardChange.call(page,{detail:{height:0}})
 assert.equal(page.data.coverSheetHeight,original)
})
