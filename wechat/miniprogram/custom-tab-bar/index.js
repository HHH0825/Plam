const { navigate } = require('../utils/navigation')
const { TABS, ITEMS_ROUTE, LEDGER_ROUTE } = require('../utils/tab-routes')
const tabs = TABS.map(tab => tab.route)
Component({
  // Diagnostic switches allow same-scroll comparison without recompiling the app.
  data: { selected: 1, selectedRoute:ITEMS_ROUTE, tabMotionRoute:'',motionReduced:false,hidden:false, menuOpen:false, iconErrors:{}, glassFallback:false, glassNoBlur:false },
  lifetimes: { attached() { this.sync() }, detached() { this.cancelMenu() } },
  pageLifetimes: { show() { this.sync() }, hide() { this.cancelMenu();this.setData({tabMotionRoute:''}) } },
  methods: {
    owner() { const pages = getCurrentPages(); return pages[pages.length - 1] },
    sync(route) {
      if(!getApp().globalData.token||getApp().hasSession&&!getApp().hasSession()||getApp()._sessionPhase==='connecting'){this.setData({hidden:true,menuOpen:false});return}
      this._switching = false
      this.cancelMenu()
      const page = this.owner()
      const index = tabs.indexOf(route || (page && page.route))
      const motion=require('../utils/motion'),motionReduced=motion.reduced(),pulse=index>=0&&motion.tab(tabs[index])
      this.setData({ memberThemeStyle:require('../utils/member').style(),motionReduced,...(pulse?{tabMotionRoute:motionReduced?'':tabs[index]}:{}), hidden: !!(page && page.data && (page.data.sessionBlocked || page.data.filterOpen || page.data.amountDialog || page.data.announcementOpen)), ...(index >= 0 ? { selected:index, selectedRoute:tabs[index] } : {}) })
    },
    switchTab(event) {
      const route = event.currentTarget.dataset.route
      const index = tabs.indexOf(route)
      if (this.data.hidden || this.data.menuOpen || this._closing || index < 0 || this._switching || route === this.data.selectedRoute) return
      if (!getApp().requireSession()) return
      this._switching = true
      try { wx.switchTab({ url: '/' + route, fail: () => { this._switching = false } }) }
      catch (_) { this._switching = false }
    },
    add() {
      if (this.data.hidden || this.data.menuOpen || this._closing || this._switching) return
      const page = this.owner()
      if (!page || page._visible === false || page._navigation || !tabs.includes(page.route) || !getApp().requireSession()) return
      this._menuToken = getApp().globalData.token
      this._menuPage = page
      this.setData({menuOpen:true})
    },
    closeMenu() { if(this.data.menuOpen){this._closing=true;this.setData({menuOpen:false})} },
    beforeMenuLeave() { this._closing=true;this.setData({menuOpen:false}) },
    afterMenuLeave() {
      const action=this._pending, page=this._menuPage, token=this._menuToken
      this._pending=null;this._closing=false;this._menuPage=null;this._menuToken=null
      this.setData({menuOpen:false})
      if(!action || !page || this.owner()!==page || page._visible===false || token!==getApp().globalData.token || !getApp().requireSession())return
      if(action==='item'){
        // Use the held list's existing protected scroll-anchor handler.
        if(page.route===ITEMS_ROUTE && typeof page.add==='function')page.add()
        else navigate(page,'/pages/editor/index')
      }else navigate(page,'/pages/ledger-record/index'+(page.data?.freeToolsSupported&&page._memberBookId&&page._memberBookId!=='all'?'?book_id='+page._memberBookId:''))
    },
    chooseEntry(e) {
      const action=e.currentTarget.dataset.action
      if(!this.data.menuOpen || this._closing || !['ledger','item'].includes(action))return
      if(this._menuToken!==getApp().globalData.token || !getApp().requireSession()){this.cancelMenu();return}
      this._pending=action;this.closeMenu()
    },
    cancelMenu() { this._pending=null;this._menuPage=null;this._menuToken=null;this._closing=false;this.setData({menuOpen:false}) },
    iconFailed(e) { const key=e.currentTarget.dataset.key;if(['ledger','items','statistics','me','paw','box'].includes(key))this.setData({['iconErrors.'+key]:true}) }
  }
})
