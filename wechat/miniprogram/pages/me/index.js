const { syncTabBar, setTabBarHidden } = require('../../utils/tab-bar')
const api = require('../../utils/api')
const view = require('../../utils/view')
const { navigate, resetNavigation } = require('../../utils/navigation')
const { avatarState, avatarError, isCurrent } = require('../../utils/profile')
const { readOverview, readAccountAge } = require('../../utils/me-overview')
const { compactMoney } = require('../../utils/compact-money')
const { DEFAULT_OVERVIEW, measureSummary } = require('../../utils/summary-layout')
const cash = require('../../utils/me-cash')
const memberCard = require('../../utils/member-card')

const amountReset = {heldAmount:'—',heldAmountDisplay:'—',heldAmountCompact:false,amountLayout:DEFAULT_OVERVIEW,amountDialog:false}
const overviewReset = { heldItems: '—', ...amountReset, accountDays: '—', statsLoading: true, statsRefreshing:false, statsError: '', statsCompatible: true, ageCompatible: true }

Page(require('../../utils/member').wrap({
  data: { meSeeds:null, user: null, avatarSymbol: '芽', avatarPath: '', avatarFailed: false, loading: true, error: '', memberCard:memberCard.card(),memberTools:memberCard.tools,backupStatusText:'读取备份状态…',backupStatusTone:'loading',amountSizes:[20,18,16], ...overviewReset,...cash.empty() },
  ...cash.methods,
  localData(){navigate(this,'/pages/local-data/index')},
  async loadBackupStatus(){
    if(!getApp().globalData.localMode)return
    const seq=this._backupSequence=(this._backupSequence||0)+1,owner=getApp().globalData.token,current=()=>this._visible&&seq===this._backupSequence&&owner===getApp().globalData.token
    try{const r=await require('../../local-core/runtime').open(),saved=(await r.control.table('backups')).filter(b=>b.external&&b.folder===r.folder).sort((a,b)=>b.savedAt-a.savedAt)[0];if(!current()||r.store.retired)return;const changed=saved&&saved.generation<r.store.head.generation;this.setData({backupStatusText:!saved?'尚未外部备份':changed?'有新资料，待备份':'已备份 '+new Date(saved.savedAt+288e5).toISOString().slice(0,10).replace(/-/g,'/'),backupStatusTone:!saved||changed?'warning':'ready'})}catch(_){if(current())this.setData({backupStatusText:'状态未读取，点此管理',backupStatusTone:'error'})}
  },
  onLoad() { this._sequence = 0; this._statsSequence = 0 },
  onShow() {
    this.setData({localMode:!!getApp().globalData.localMode})
    syncTabBar(this)
    this._visible = true
    this.loadBackupStatus()
    const changed=this._displayOwner!==getApp().globalData.token
    if(changed){this._displayOwner=getApp().globalData.token;this.setData({user:null,memberCard:memberCard.card(),meSeeds:null,...overviewReset,...cash.empty()})}
    this._cashNavigation=false
    cash.invalidate(this)
    resetNavigation(this)
    if (getApp().requireSession()) { this.load(true); this.loadStats(true) }
    cash.startClock(this)
  },
  onHide() {
    if(this.data.amountDialog)setTabBarHidden(this,false)
    this._visible = false
    cash.invalidate(this);cash.stopClock(this)
    this._backupSequence=(this._backupSequence||0)+1
    this._sequence += 1
    this._statsSequence += 1
    this.closeAmount()
    if(this._displayOwner!==getApp().globalData.token)this.setData({ user: null, avatarSymbol: '芽', avatarPath: '', avatarFailed: false, loading: true, error: '', ...overviewReset,...cash.empty() })
  },
  onUnload() { this._visible = false;this._backupSequence=(this._backupSequence||0)+1; this._sequence += 1; this._statsSequence += 1;cash.invalidate(this);cash.stopClock(this) },
  onResize() { measureSummary(this,'overview');cash.measure(this) },
  async load(reuse = false) {
    const sequence = ++this._sequence
    const token = getApp().globalData.token
    this.setData({ loading: !this.data.user, error: '' })
    try {
      const result = await (reuse===true?require('../../utils/display-cache').read('/auth/me'):api.request('/auth/me'))
      if (!isCurrent(this, sequence, token)) return
      require('../../utils/display-cache').present(this,{ user: result.user, ...avatarState(result.user), accountDays: readAccountAge(result), ageCompatible: Object.prototype.hasOwnProperty.call(result, 'account_age_days'), loading: false },()=>measureSummary(this,'overview'))
      cash.load(this,result,reuse===true)
    } catch (error) {
      if (isCurrent(this, sequence, token)) this.setData({ loading: false, error: view.errorMessage(error) })
      if(isCurrent(this,sequence,token))this.setData({cashLoading:false,cashError:'账户能力读取失败，请重试本月收支。'})
    }
  },
  async loadStats(reuse = false) {
    const sequence = ++this._statsSequence
    const token = getApp().globalData.token
    this._amountToken=token
    const current = () => this._visible && sequence === this._statsSequence && token === getApp().globalData.token
    if(this.data.amountDialog)setTabBarHidden(this,false)
    const retained=this.data.heldItems!=='—'
    this.setData({ ...(retained?{}:amountReset), statsLoading: !retained, statsRefreshing:retained, statsError: '' })
    try {
      const result = await (reuse===true?require('../../utils/display-cache').read('/stats'):api.request('/stats'))
      if (current()) {
        const overview=readOverview(result),amount=compactMoney(result.held_purchase_total)
        require('../../utils/display-cache').present(this,{ ...overview,heldAmountDisplay:amount.display,heldAmountCompact:amount.compact, statsLoading: false,statsRefreshing:false },()=>measureSummary(this,'overview'))
      }
    } catch (error) {
      if (current()) this.setData({ ...(retained?{}:{heldItems:'—',...amountReset}), statsLoading: false,statsRefreshing:false, statsError: view.errorMessage(error) })
    }
  },
  avatarError,
  onMembershipRefreshStart() { if(this._memberCardOwner!==getApp().globalData.token||this.data.memberCard.kind==='loading')this.setData({memberCard:memberCard.card()}) },
  onMembershipRefreshSuccess(status) { this._memberCardOwner=getApp().globalData.token;this.setData({memberCard:memberCard.card(status)}) },
  onMembershipStateChange(status) { if(status.status==='expired')this.onMembershipRefreshSuccess(status) },
  onMembershipRefreshError() { this.setData({memberCard:memberCard.card(null,true)}) },
  retryMembership() { return this.memberRefresh(true) },
  onPullDownRefresh(){require('../../utils/display-cache').clear();return Promise.allSettled([this.load(),this.loadStats(),this.loadBackupStatus(),this.memberRefresh(true)]).finally(()=>wx.stopPullDownRefresh?.())},
  openMemberTool(event) {
    if(!getApp().requireSession())return
    const mode=event.currentTarget.dataset.mode
    if(!memberCard.tools.some(tool=>tool.mode===mode))return
    if(this.data.memberCard.kind==='unsupported'){wx.showToast({title:'整理工具暂未开放',icon:'none'});return}
    // The destination verifies the free-tools capability of the current server.
    navigate(this,'/pages/member-tools/index?mode='+mode)
  },
  amountInfo() {
    if(this._amountToken!==getApp().globalData.token){this.closeAmount();this.setData(amountReset);return}
    if(!this._visible||this.data.statsLoading||this.data.statsRefreshing||this.data.statsError||!this.data.statsCompatible||this.data.heldAmount==='—')return
    this.setData({amountDialog:true});setTabBarHidden(this,true)
  },
  closeAmount() { require('../../utils/motion').leave(this,'amountDialog',()=>{this.setData({amountDialog:false});setTabBarHidden(this,false)}) },
  keepAmountOpen() {},
  appearance() { if(getApp().requireSession())navigate(this, '/pages/member-tools/index?mode=appearance') },
  profile() { navigate(this, '/pages/profile/index') },
  disposedArchive() { navigate(this, '/pages/disposed/index') },
  trash() { navigate(this, '/pages/trash/index') },
  about(){navigate(this,'/pages/login/about')}
}))
