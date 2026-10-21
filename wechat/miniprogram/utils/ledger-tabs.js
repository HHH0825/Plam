const api = require('./api')
const ledger = require('./ledger')
const calendar = require('./ledger-calendar')
const { navigate, resetNavigation } = require('./navigation')
const { syncTabBar } = require('./tab-bar')
const dashboard = require('./item-dashboard')
const analytics = require('./ledger-analytics')
const destination = require('./ledger-destination')

function empty() {
  return { loading: false, refreshing:false, error: '', supported: false, enabled: false, summary: null,
    groups: [], entries: [], nextOffset: null, query: '', searchOpen: false, searchFocus: false,
    filterOpen: false, kindIndex: 0, categoryIndex: 0, sourceIndex: 0,
    draftKindIndex: 0, draftCategoryIndex: 0, draftSourceIndex: 0, filterCount: 0,
    filteredSummary: null, filterActive: false, iconErrors: {}, daySummaries: {},
    categories: [], days: [], calendarCells: [], selectedDate: '', selectedLabel: '', selectedDay: null,
    dayEntries: [], dayNextOffset: null, dayLoading: false, dayError: '', daySupported: true,
    cashAnalysis:null,cashAnalysisError:'',categoriesExpanded:false,
    panelLayout: { mainSize: 44, smallSize: 24, stacked: false } }
}
function active(page, token, seq) {
  return ledger.current(page, token) && (seq === undefined || seq === page._sequence)
}
function monthPatch(month) {
  return { month, monthLabel: calendar.monthLabel(month), maxMonth: ledger.today().slice(0, 7),
    canNext: month < ledger.today().slice(0, 7) }
}
function filterCount(data) { return ['kindIndex', 'categoryIndex', 'sourceIndex'].filter(k => data[k] > 0).length }

function create(statistics) {
  return {
    data: { ...empty(), ...(statistics?dashboard.empty():{}), ...monthPatch(ledger.today().slice(0, 7)), view: 'cash',
      kindOptions: ledger.kindOptions, sourceOptions: ledger.sourceOptions,
      categoryOptions: [{ key: '', name: '全部分类' }, ...[...ledger.expense,
        ...ledger.income.filter(x => x[0] !== 'other'), ...ledger.automatic].map(([key, name]) => ({ key, name }))],
      weekLabels: ['一', '二', '三', '四', '五', '六', '日'], mainSizes: [44, 40, 36, 32, 30, 28], smallSizes: [24, 22, 20, 18, 16] },

    ...(statistics?dashboard.methods:{}),
    onLoad() { this._alive = true; this._token = getApp().globalData.token; this._sequence = 0; this._daySequence = 0; this._paneEpoch=0;this._viewScroll={cash:0,items:0} },
    onShow() {
      this._visible = true; resetNavigation(this)
      if (this._token !== getApp().globalData.token) {
        this._dayDataKey='';this._itemInsightsReady=false
        if(statistics)dashboard.invalidate(this)
        this._token = getApp().globalData.token; this._sequence++; this._daySequence++
        this._scroll = 0; this._returnScroll = null; this._calendarMetrics = null;this._viewScroll={cash:0,items:0};this._paneEpoch++
        this.setData({ ...empty(), ...(statistics?dashboard.empty():{}), ...monthPatch(ledger.today().slice(0, 7)), view: 'cash' })
      }
      if (!getApp().requireSession()) return
      const intent=statistics?destination.take():null
      if(intent&&analytics.validMonth(intent.month)){
        this._sequence++;this._daySequence++;this._paneEpoch++;dashboard.invalidate(this)
        this._scroll=0;this._returnScroll=0;this._viewScroll.cash=0
        this.setData({view:'cash',...monthPatch(intent.month),summary:null,calendarCells:[],days:[],selectedDate:'',selectedDay:null,dayEntries:[],cashAnalysis:null,cashAnalysisError:'',categoriesExpanded:false})
      }
      syncTabBar(this); this.tickDay(); this.load(true)
      clearInterval(this._clock)
      this._clock = setInterval(() => { if (this.tickDay()) this.load() }, 30000)
    },
    tickDay() {
      const day = ledger.today(), previous = this._day
      this._day = day
      this.setData({ maxMonth: day.slice(0, 7), canNext: this.data.month < day.slice(0, 7), ...(statistics?{itemMonth:day.slice(0,7)}:{}) })
      if (!previous || previous === day) return false
      if (statistics && this.data.selectedDate === previous) {
        if (this.data.month === previous.slice(0, 7)) this.setData({ ...monthPatch(day.slice(0, 7)), selectedDate: day })
      }
      return true
    },
    onPageScroll(e) { this._scroll = e.scrollTop },
    onHide() {
      if(statistics){this._viewScroll[this.data.view]=this._scroll||0;dashboard.invalidate(this)}
      this._returnScroll = this._scroll || 0; this._visible = false; this._sequence++; this._daySequence++
      this._measure = null; clearInterval(this._clock); clearTimeout(this._searchTimer)
      this.setData({ filterOpen: false, searchFocus: false, dayLoading: false,...(statistics?{itemStatsLoading:false,itemInsightsLoading:false}:{}) })
      this.getTabBar?.()?.cancelMenu?.()
    },
    onUnload() { this._alive = false; this._measure = null; if(statistics)dashboard.invalidate(this);clearInterval(this._clock); clearTimeout(this._searchTimer) },
    onReady() { this.measure() },
    onPullDownRefresh(){require('./display-cache').clear();return Promise.allSettled([this.load(),this.memberRefresh?.(true)]).finally(()=>wx.stopPullDownRefresh?.())},
    onResize() { this.measure() },

    async load(reuse = false) {
      if(statistics&&this.data.view==='items')return dashboard.load(this,reuse===true)
      const token = this._token, seq = this._sequence = (this._sequence || 0) + 1
      this._daySequence = (this._daySequence || 0) + 1
      const key=JSON.stringify([this.data.month,this._memberBookId||'all',this.data.query,this.data.kindIndex,this.data.categoryIndex,this.data.sourceIndex])
      const retained=!!this.data.summary&&this._cashDataKey===key
      const read=path=>reuse===true?require('./display-cache').read(path):api.request(path)
      this.setData({ loading: !retained, refreshing:retained, error: '', dayLoading: false,...(retained?{}:{summary:null,groups:[],entries:[],days:[],calendarCells:[],dayEntries:[],cashAnalysis:null}) })
      try {
        const supported = await ledger.capability(reuse===true)
        if (!active(this, token, seq)) return
        if (!supported) {
          this.setData({ ...empty(), error: '记账功能正在准备中，请同步新版服务端后使用。' }); return
        }
        const settings = await read('/ledger/settings')
        if (!active(this, token, seq)) return
        this.setData({ supported: true, enabled: settings.enabled })
        if (!settings.enabled) { this.setData({ summary: null, groups: [], entries: [], days: [], calendarCells: [], selectedDay: null, dayEntries: [], categories: [] }); return }
        await this.fetch(statistics, false, seq, reuse===true)
        if (active(this, token, seq))this._cashDataKey=key
        if (active(this, token, seq) && statistics) await this.loadDay(false, seq, reuse===true)
      } catch (e) {
        if (active(this, token, seq)) this.setData({ error: e.message, ...(retained?{}:{summary: null, groups: [], entries: [],
          daySummaries: {}, filteredSummary: null, days: [], calendarCells: [], selectedDay: null, dayEntries: [], categories: []}) })
      } finally {
        if (active(this, token, seq)) {
          this.setData({ loading: false,refreshing:false }, () => this.measure())
          this.restoreScroll()
        }
      }
    },
    async fetch(stats = statistics, more = false, seq = this._sequence, reuse = false) {
      const token = this._token, d = this.data
      let path = (stats ? '/ledger/statistics' : '/ledger/entries') + '?month=' + d.month
      if (this._memberBookId && this._memberBookId !== 'all') path += '&book_id=' + encodeURIComponent(this._memberBookId)
      if (!stats) path += '&q=' + encodeURIComponent(d.query) + '&kind=' + ledger.kindOptions[d.kindIndex].key +
        '&category=' + d.categoryOptions[d.categoryIndex].key + '&source=' + ledger.sourceOptions[d.sourceIndex].key +
        '&offset=' + (more ? d.nextOffset : 0)
      const r = await (reuse?require('./display-cache').read(path):api.request(path))
      if (!active(this, token, seq)) return
      if (!r || !r.summary || !Array.isArray(stats ? r.days : r.entries) || stats && !Array.isArray(r.categories)) {
        throw Error('账本数据返回不完整，请重新读取或更新服务端。')
      }
      const updates = { summary: ledger.summary(r.summary) }
      if (stats) {
        const selectedDate = calendar.chooseDate(d.month, r.days, this.data.selectedDate)
        let cashAnalysis=null,cashAnalysisError=''
        try{cashAnalysis=analytics.present(analytics.snapshot(r,d.month))}catch(e){cashAnalysisError=e.message}
        Object.assign(updates, { days: r.days, selectedDate, selectedLabel: calendar.dayLabel(selectedDate),
          selectedDay: calendar.exactDay(r.days, selectedDate),
          calendarCells: calendar.cells(d.month, r.days, selectedDate, ledger.today(), this._calendarMetrics),
          cashAnalysis,cashAnalysisError,cashReportMonth:Number(d.month.slice(5)),categories:r.categories })
      } else {
        const entries = more ? [...d.entries, ...r.entries.filter(x => !d.entries.some(v => v.id === x.id))] : r.entries
        Object.assign(updates, { entries, daySummaries: r.day_summaries || {}, groups: ledger.groups(entries, r.day_summaries || {}),
          nextOffset: r.next_offset, filteredSummary: ledger.summary(r.filtered_summary),
          filterActive: !!(d.query || filterCount(d)), filterCount: filterCount(d) })
      }
      require('./display-cache').present(this,updates, () => {
        if (active(this, token, seq) && stats) this.selectComponent?.('.cash-analysis-ring')?.draw()
      })
    },

    async loadDay(more = false, monthSequence = this._sequence, reuse = false) {
      if (!ledger.current(this) || !this.data.selectedDate || !this.data.enabled) return
      const token = this._token, date = this.data.selectedDate, month = this.data.month
      const key=month+'|'+date+'|'+(this._memberBookId||'all'),retained=this._dayDataKey===key
      const seq = this._daySequence = (this._daySequence || 0) + 1
      const current = () => active(this, token, monthSequence) && seq === this._daySequence && date === this.data.selectedDate
      this.setData({ dayLoading: true, dayError: '', ...(more === true || retained ? {} : { dayEntries: [], dayNextOffset: null }) })
      try {
        const path='/ledger/entries?month=' + month + '&date=' + date + (this._memberBookId && this._memberBookId !== 'all' ? '&book_id='+encodeURIComponent(this._memberBookId) : '') + '&offset=' + (more === true ? this.data.dayNextOffset : 0)
        const r = await (reuse?require('./display-cache').read(path):api.request(path))
        if (!current()) return
        if (r.date !== date) {
          this.setData({ daySupported: false, dayEntries: [], dayNextOffset: null,
            dayError: '日历汇总可查看；每日流水需同步新版服务端后使用。' }); return
        }
        if (!Array.isArray(r.entries)) throw Error('当天流水返回不完整，请重新读取')
        if (r.entries.some(x => x.occurred_on !== date)) throw Error('当天流水返回异常，请重新读取')
        const entries = r.entries.map(ledger.row)
        this._dayDataKey=key
        this.setData({ daySupported: true, dayEntries: more === true ? [...this.data.dayEntries,
          ...entries.filter(x => !this.data.dayEntries.some(v => v.id === x.id))] : entries, dayNextOffset: r.next_offset })
      } catch (e) {
        if (current()) this.setData({ dayError: e.message, ...(more === true || retained ? {} : { dayEntries: [], dayNextOffset: null }) })
      } finally { if (current()) this.setData({ dayLoading: false }) }
    },
    selectDay(e) {
      const date = e.currentTarget.dataset.date
      if (!this.data.days.some(x => x.date === date) || date > ledger.today() || date === this.data.selectedDate) return
      this.setData({ selectedDate: date, selectedLabel: calendar.dayLabel(date), selectedDay: calendar.exactDay(this.data.days, date),
        calendarCells: calendar.cells(this.data.month, this.data.days, date, ledger.today(), this._calendarMetrics) })
      this.loadDay()
    },
    dayMore() { if (!this.data.dayLoading && this.data.dayNextOffset !== null) this.loadDay(true) },

    setMonth(month) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > ledger.today().slice(0, 7) || month === this.data.month || month < '0001-01') return
      clearTimeout(this._searchTimer); this._returnScroll = null
      require('./motion').change(this,{ ...monthPatch(month), summary: null, groups: [], entries: [], filteredSummary: null,
        calendarCells: [], days: [], selectedDate: '', selectedDay: null, dayEntries: [], dayNextOffset: null,cashAnalysis:null,cashAnalysisError:'',categoriesExpanded:false })
      this.load()
      if(this.route&&this.data.memberSupported)this.memberRefresh?.()
    },
    previous() { this.setMonth(ledger.moveMonth(this.data.month, -1)) },
    next() { this.setMonth(ledger.moveMonth(this.data.month, 1)) },
    monthChange(e) { this.setMonth(e.detail.value.slice(0, 7)) },
    toggleSearch() {
      const open = !this.data.searchOpen
      this.setData({ searchOpen: open, searchFocus: open })
      if (!open) wx.hideKeyboard?.()
    },
    search(e) {
      this.setData({ query: e.detail.value, loading: true }); clearTimeout(this._searchTimer)
      // Invalidate the old response immediately, before the debounce fires.
      this._sequence++; this._measure = null
      this._searchTimer = setTimeout(() => this.load(), 300)
    },
    clearSearch() { clearTimeout(this._searchTimer); this.setData({ query: '' }); this.load() },
    openFilter() {
      wx.hideKeyboard?.()
      this.setData({ filterOpen: true, searchFocus: false, draftKindIndex: this.data.kindIndex,
        draftCategoryIndex: this.data.categoryIndex, draftSourceIndex: this.data.sourceIndex })
      syncTabBar(this)
    },
    closeFilter() { require('./motion').leave(this,'filterOpen',()=>{this.setData({ filterOpen: false });syncTabBar(this)}) },
    filter(e) {
      const fields = { kindIndex: 'draftKindIndex', categoryIndex: 'draftCategoryIndex', sourceIndex: 'draftSourceIndex' }
      const key = fields[e.currentTarget.dataset.key]
      if (key) this.setData({ [key]: Number(e.detail.value) })
    },
    applyFilter() {
      clearTimeout(this._searchTimer)
      this.setData({ kindIndex: this.data.draftKindIndex, categoryIndex: this.data.draftCategoryIndex,
        sourceIndex: this.data.draftSourceIndex }); this.closeFilter(); this.load()
    },
    clearFilter() {
      this.setData({ draftKindIndex: 0, draftCategoryIndex: 0, draftSourceIndex: 0 })
    },
    summaryInfo() {
      wx.showModal({ title: '本月收支说明', content: '本月支出已扣除当月实际退款；退款更多时显示退款结余。净额按收入＋退款－原支出判断方向。仅比较实际收付，与物品成本口径不同。', showCancel: false })
    },

    measure() {
      if(statistics&&this.data.view==='items'){dashboard.measure(this);return}
      if (!ledger.current(this) || !wx.createSelectorQuery || !this.data.enabled) return
      const attempt = this._measure = {}, token = this._token, seq = this._sequence
      const current = () => active(this, token, seq) && this._measure === attempt
      try {
        const q = wx.createSelectorQuery().in(this)
        if (statistics && this.data.calendarCells.length) {
          q.select('.calendar-amount').boundingClientRect().select('.calendar-digit-probe').boundingClientRect()
            .select('.calendar-prefix-probe').boundingClientRect().select('.calendar-unit-probe').boundingClientRect().exec(r => {
              if (!current() || !r?.[0] || !r[1] || !r[2] || !r[3]) return
              const metrics = { width: Math.max(8, r[0].width - 2 - r[2].width), digitWidth: r[1].width / 10, unitWidth: r[3].width }
              this._calendarMetrics = metrics
              this.setData({ calendarCells: calendar.cells(this.data.month, this.data.days, this.data.selectedDate, ledger.today(), metrics) })
            })
        } else if (!statistics && this.data.summary) {
          q.select('.ledger-main-region').boundingClientRect().select('.ledger-summary-bottom').boundingClientRect()
            .selectAll('.ledger-panel-probe').boundingClientRect().exec(r => {
              if (!current() || !r?.[0] || !r[1] || !r[2]?.length) return
              const probes = Object.fromEntries(r[2].map(x => [x.dataset.field + '-' + x.dataset.size, x]))
              const layout = calendar.panelLayout(r[0].width, probes, r[1].width - 44, this.data)
              this.setData({ panelLayout: layout })
            })
        }
      } catch (_) { /* Single-line scroll and responsive CSS remain available. */ }
    },
    restoreScroll() {
      if (this._returnScroll === null || this._returnScroll === undefined || !wx.pageScrollTo) return
      const top = this._returnScroll, token = this._token, seq = this._sequence; this._returnScroll = null
      wx.nextTick ? wx.nextTick(() => { if (active(this, token, seq)) wx.pageScrollTo({ scrollTop: top, duration: 0 }) }) :
        wx.pageScrollTo({ scrollTop: top, duration: 0 })
    },
    async more() {
      if (this.data.loading || this.data.nextOffset === null) return
      const token = this._token, seq = this._sequence
      this.setData({ loading: true })
      try { await this.fetch(false, true, seq) }
      catch (e) { if (active(this, token, seq)) this.setData({ error: e.message }) }
      finally { if (active(this, token, seq)) this.setData({ loading: false }) }
    },
    async enable() {
      if (this.data.loading || !this.data.supported) return
      const token = this._token; this.setData({ loading: true, error: '' })
      try {
        await api.request('/ledger/settings', { method: 'POST', data: {} })
        if (!active(this, token)) return
        await this.load()
        if (active(this, token) && this.data.enabled) navigate(this, '/pages/ledger-history/index')
      } catch (e) { if (active(this, token)) this.setData({ error: e.message }) }
      finally { if (active(this, token)) this.setData({ loading: false }) }
    },
    open(e) { navigate(this, '/pages/ledger-detail/index?id=' + e.currentTarget.dataset.id) },
    record() { navigate(this, '/pages/ledger-record/index' + (this.data.memberActive && this._memberBookId && this._memberBookId !== 'all' ? '?book_id='+this._memberBookId : '')) },
    history() { navigate(this, '/pages/ledger-history/index') },
    insights() { navigate(this, '/pages/insights/index') },
    toggleCategories(){this.setData({categoriesExpanded:!this.data.categoriesExpanded})},
    cashReport(){if(this.data.cashAnalysis&&!this.data.cashAnalysisError)navigate(this,'/pages/ledger-report/index?month='+this.data.month)},
    switchView(e) {
      const view=e.currentTarget.dataset.key
      if(!statistics||!['cash','items'].includes(view)||view===this.data.view)return
      this._viewScroll[this.data.view]=this._scroll||0
      this._sequence++;this._daySequence++;this._paneEpoch++;this._measure=null;dashboard.invalidate(this)
      this._scroll=this._viewScroll[view]||0;this._returnScroll=this._scroll
      require('./motion').change(this,{view,loading:false,dayLoading:false,itemStatsLoading:false,itemInsightsLoading:false},()=>this.load(true))
    },
    stop() {},
    iconFailed(e) { this.setData({ ['iconErrors.' + e.currentTarget.dataset.key]: true }) }
  }
}
module.exports = { create }
