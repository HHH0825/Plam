const api = require('../../utils/api')
const view = require('../../utils/view')
const display = require('../../utils/display-cache')
const { readStats, readCards } = require('../../utils/discovery')
const { readMonthly, presentMonthly } = require('../../utils/monthly')
const { navigate, resetNavigation } = require('../../utils/navigation')
const { DEFAULT_MONTHLY, measureSummary } = require('../../utils/summary-layout')
const identity = () => require('../../utils/cloud-transport').serviceScope()+'|'+getApp().globalData.user?.id+'|'+getApp().globalData.token
const emptyState = () => ({ cards: [], stats: null, statsLoading: true, cardsLoading: true,
  statsError: '', cardsError: '', trend: [], monthly: null, monthlyLoading: true, monthlyError: '',
  detailsOpen:false, trendOpen:false, monthlyLayout: DEFAULT_MONTHLY, amountSizes:[26,24,22,20] })
Page(require('../../utils/member').wrap({
  data: emptyState(),
  onLoad(options = {}) { this._sequences = { stats: 0, cards: 0, monthly: 0 };this._owner=identity();this._targetKind=/^[a-z][a-z0-9_]{0,79}$/.test(options.kind||'')?options.kind:'';this._anchorPending=!!this._targetKind },
  onShow() {
    this._visible = true
    resetNavigation(this)
    this.syncOwner()
    if (getApp().requireSession()) { this.load(true); this.loadMonthly() }
  },
  syncOwner() {
    const owner=identity()
    if(this._owner!==owner){this._owner=owner;this._anchorPending=false;display.present(this,emptyState())}
  },
  onHide() { this.invalidate(); if(this._owner!==identity())this.syncOwner();else this.setData({statsLoading:false,cardsLoading:false,monthlyLoading:false}) },
  onUnload() { this.invalidate() },
  onResize() { measureSummary(this, 'monthly') },
  invalidate() {
    this._visible = false
    this._sequences.stats += 1
    this._sequences.cards += 1
    this._sequences.monthly += 1
  },
  current(section, sequence, owner) {
    return this._visible && this._sequences[section] === sequence && identity() === owner
  },
  async readSection(section, path, parse, reuse=false) {
    if (!this._visible || !getApp().requireSession()) return
    this.syncOwner()
    const sequence = ++this._sequences[section], owner = identity()
    display.present(this,{ [`${section}Loading`]: true, [`${section}Error`]: '' })
    try {
      const response = await (reuse===true ? display.read(path) : api.request(path))
      if (!this.current(section, sequence, owner)) return
      let value=parse(response), patch={}
      if(section==='cards'){
        const old=new Map(this.data.cards.map(card=>[card.key,card]))
        value=value.map(card=>{const prior=old.get(card.key),itemsOpen=!!prior?.itemsOpen;return {...card,basisOpen:!!prior?.basisOpen,itemsOpen,shownItems:itemsOpen?card.items:card.items.slice(0,3)}})
        patch.trend=(response.months||[]).filter(row=>/^\d{4}-\d{2}$/.test(row.month)&&/^\d+\.\d{2}$/.test(row.fixed)&&/^\d+\.\d{2}$/.test(row.principal)).slice(-6).reverse()
      }
      display.present(this,{...patch,[section]:value})
    } catch (error) {
      if (this.current(section, sequence, owner)) display.present(this,{ [`${section}Error`]: view.errorMessage(error) })
    } finally {
      if (this.current(section, sequence, owner)) display.present(this,{ [`${section}Loading`]: false },()=>{if(section==='monthly')measureSummary(this,'monthly');this.locateAnalysis()})
    }
  },
  loadStats(reuse=false) { return this.readSection('stats', '/stats', readStats,reuse) },
  loadCards(reuse=false) { return this.readSection('cards', '/insights', readCards,reuse) },
  loadMonthly() { return this.readSection('monthly', '/reports/monthly', data => {
    const report = readMonthly(data)
    return { ...report, page: presentMonthly(report) }
  }) },
  toggleCard(e){
    const index=Number(e.currentTarget.dataset.index),field=e.currentTarget.dataset.field
    if(!['basisOpen','itemsOpen'].includes(field)||!this.data.cards[index])return
    const card=this.data.cards[index],open=!card[field]
    this.setData({['cards['+index+'].'+field]:open,...(field==='itemsOpen'?{['cards['+index+'].shownItems']:open?card.items:card.items.slice(0,3)}:{})})
  },
  toggleDetails(){this.setData({detailsOpen:!this.data.detailsOpen})},
  toggleTrend(){this.setData({trendOpen:!this.data.trendOpen})},
  monthlyReport() { navigate(this, '/pages/monthly/index' + (this.data.monthly ? '?month=' + this.data.monthly.month : '')) },
  load(reuse=false) { return Promise.all([this.loadStats(reuse), this.loadCards(reuse)]) },
  locateAnalysis() {
    if(!this._anchorPending||!this._visible||this.data.cardsLoading||this.data.cardsError)return
    const index=this.data.cards.findIndex(card=>card.kind===this._targetKind)
    if(index<0){this._anchorPending=false;wx.showToast?.({title:'提醒已更新，已展示最新分析',icon:'none'});return}
    if(!wx.createSelectorQuery||!wx.pageScrollTo)return
    const attempt=this._anchorAttempt={},owner=identity(),seq=this._sequences.cards
    const ready=()=>{
      if(!this.current('cards',seq,owner)||this._anchorAttempt!==attempt)return
      wx.createSelectorQuery().in(this).select('#analysis-card-'+index).boundingClientRect().selectViewport().scrollOffset().exec(r=>{
        if(!this.current('cards',seq,owner)||this._anchorAttempt!==attempt||!r?.[0]||!r[1])return
        this._anchorPending=false;wx.pageScrollTo({scrollTop:Math.max(0,r[0].top+r[1].scrollTop-12),duration:0})
      })
    }
    wx.nextTick?wx.nextTick(ready):ready()
  },
  open(event) { navigate(this, `/pages/item/index?id=${event.currentTarget.dataset.id}`) },
  onPullDownRefresh() { display.clear();Promise.all([this.load(), this.loadMonthly()]).finally(() => wx.stopPullDownRefresh()) }
}))
