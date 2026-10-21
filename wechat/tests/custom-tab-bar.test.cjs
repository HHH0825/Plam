const test=require('node:test'),assert=require('node:assert/strict')
function harness(route='pages/me/index'){
  let definition;global.Component=d=>definition=d
  const name='../miniprogram/custom-tab-bar/index.js';delete require.cache[require.resolve(name)];require(name)
  const app={globalData:{token:'alice'},requireSession(){return !!this.globalData.token}}
  const page={route,_visible:true},calls=[],switches=[]
  global.getApp=()=>app;global.getCurrentPages=()=>[page]
  global.wx={navigateTo:o=>calls.push(o),switchTab:o=>switches.push(o),showModal(){}}
  const bar={data:structuredClone(definition.data),setData(p){for(const[k,v]of Object.entries(p)){const parts=k.split('.');let row=this.data;while(parts.length>1)row=row[parts.shift()];row[parts[0]]=v}},...definition.methods}
  bar.sync(route)
  return{bar,page,app,calls,switches}
}
const choice=action=>({currentTarget:{dataset:{action}}})
const tab=route=>({currentTarget:{dataset:{route}}})
test('center menu waits for dismissal before navigating and protects duplicate choices',()=>{
  const {bar,page,calls}=harness()
  bar.add();bar.add();assert.equal(bar.data.menuOpen,true);assert.equal(calls.length,0)
  bar.chooseEntry(choice('item'));bar.chooseEntry(choice('item'));assert.equal(calls.length,0)
  bar.beforeMenuLeave();bar.afterMenuLeave();bar.afterMenuLeave();assert.equal(calls.length,1);assert.equal(calls[0].url,'/pages/editor/index')
  calls[0].fail({errMsg:'controlled failure'});bar.sync();bar.add();bar.chooseEntry(choice('item'));bar.afterMenuLeave();assert.equal(calls.length,2)
  require('../miniprogram/utils/navigation').resetNavigation(page);bar.sync();bar.add();bar.closeMenu();bar.afterMenuLeave();assert.equal(calls.length,2)
})
test('center add preserves items scroll handler and refuses hidden or signed-out My',()=>{
  const {bar,page,app,calls}=harness('pages/items/index');let remembered=0
  page.add=()=>remembered++;bar.add();bar.chooseEntry(choice('item'));bar.afterMenuLeave();assert.equal(remembered,1);assert.equal(calls.length,0)
  page.route='pages/me/index';page._visible=false;bar.add();assert.equal(calls.length,0)
  page._visible=true;app.globalData.token='';bar.add();assert.equal(calls.length,0)
})
test('real tabs block duplicate switches, sync on show and release failed switches',()=>{
  const {bar,page,switches}=harness()
  const event=tab('pages/items/index');bar.switchTab(event);bar.switchTab(event);assert.equal(switches.length,1)
  switches[0].fail();bar.switchTab(event);assert.equal(switches.length,2)
  page.route='pages/items/index';bar.sync();assert.equal(bar.data.selected,1);assert.equal(bar.data.selectedRoute,page.route)
  bar.switchTab(event);assert.equal(switches.length,2)
  bar.switchTab(tab('unknown'));assert.equal(switches.length,2)
  for(const route of ['pages/ledger/index','pages/statistics/index','pages/me/index']){bar.switchTab(tab(route));page.route=route;bar.sync();assert.equal(bar.data.selectedRoute,route)}
})

test('filter overlay suppresses custom navigation and sync restores it on return',()=>{
  const {bar,page,calls,switches}=harness()
  const {setTabBarHidden}=require('../miniprogram/utils/tab-bar')
  page.getTabBar=()=>bar
  setTabBarHidden(page,true)
  bar.add();bar.switchTab(tab('pages/items/index'))
  assert.equal(calls.length,0);assert.equal(switches.length,0)
  page.data={filterOpen:true};bar.sync();assert.equal(bar.data.hidden,true)
  page.data.filterOpen=false;bar.sync();assert.equal(bar.data.hidden,false)
  bar.add();assert.equal(bar.data.menuOpen,true);assert.equal(calls.length,0)
})

test('record choice opens the protected form once from every tab',()=>{
  for(const route of ['pages/items/index','pages/me/index','pages/statistics/index','pages/ledger/index']){
    const {bar,switches,calls}=harness(route);bar.add();bar.chooseEntry(choice('ledger'));bar.afterMenuLeave();bar.afterMenuLeave()
    assert.equal(switches.length,0);assert.equal(calls.length,1);assert.equal(calls[0].url,'/pages/ledger-record/index')
  }
})

test('back dismissal, hiding and account changes cancel pending menu actions',()=>{
  for(const mode of ['back','hide','account','hidden-filter']){
    const {bar,app,calls,switches}=harness();bar.add()
    if(mode==='back'){bar.beforeMenuLeave();bar.afterMenuLeave()}
    else{bar.chooseEntry(choice('item'));if(mode==='account')app.globalData.token='bob';else if(mode==='hidden-filter'){const {setTabBarHidden}=require('../miniprogram/utils/tab-bar');setTabBarHidden({getTabBar:()=>bar},true)}else bar.cancelMenu();bar.afterMenuLeave()}
    assert.equal(calls.length,0);assert.equal(switches.length,0);assert.equal(bar.data.menuOpen,false)
  }
})

test('icon errors preserve navigation and configured tabs match route metadata',()=>{
  const {bar}=harness();bar.iconFailed({currentTarget:{dataset:{key:'ledger'}}});assert.equal(bar.data.iconErrors.ledger,true)
  const config=require('../miniprogram/app.json'),{TABS}=require('../miniprogram/utils/tab-routes')
  assert.equal(config.pages[0],'pages/items/index')
  assert.deepEqual(config.tabBar.list.map(t=>t.pagePath),TABS.map(t=>t.route))
  assert.ok(config.tabBar.list.every(t=>config.pages.includes(t.pagePath)))
})

test('detached custom navigation never enables the native bar during child-page transitions',()=>{
  const {syncTabBar,setTabBarHidden}=require('../miniprogram/utils/tab-bar')
  for(const route of require('../miniprogram/utils/tab-routes').TABS.map(t=>t.route)){
    const h=harness(route),native=[]
    global.wx.showTabBar=()=>native.push('show');global.wx.hideTabBar=()=>native.push('hide')
    // Both an absent accessor and a temporarily detached instance occur while
    // old overlay-close callbacks finish and the tab page becomes visible.
    setTabBarHidden(h.page,false)
    h.page.getTabBar=()=>null
    setTabBarHidden(h.page,true);setTabBarHidden(h.page,false);syncTabBar(h.page)
    h.page.getTabBar=()=>h.bar;syncTabBar(h.page)
    assert.deepEqual(native,[],route);assert.equal(h.bar.data.hidden,false);assert.equal(h.bar.data.selectedRoute,route)
  }
})

test('late custom-bar attachment respects an open update notice and restores after closing',()=>{
  const {bar,page}=harness('pages/items/index')
  page.data={announcementOpen:true};bar.sync()
  assert.equal(bar.data.hidden,true)
  page.data.announcementOpen=false;bar.sync()
  assert.equal(bar.data.hidden,false)
})
