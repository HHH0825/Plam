const api = require('../../utils/api')
const view = require('../../utils/view')
const photo = require('../../utils/photo-edit')
const drafts = require('./lib/drafts')
const config = require('../../config')
const locations = require('./lib/location-picker')
const coverPicker = require('./lib/cover-picker')
const covers = require('../../utils/item-covers')
const ledgerPayment = require('./lib/ledger-payment')
const itemCategory = require('./lib/item-category')
const defaults = () => ({ name: '', category: '其他', icon_type: 'other', purchase_date: view.today(),
  purchase_price: '', warranty_expires_on: '', notes: '', status: 'active', cover_mode:'icon', cover_icon_key:null, payment_info:null })
Page(require('../../utils/member').wrap({
  data: { ...coverPicker.data, ...ledgerPayment.data, storageLocations: [], locationsReady: false, locationsError: '', locationNames: ['未设置位置','新增位置…'], locationIndex: 0, locationText: '未设置位置', itemId: 0, today: view.today(), form: defaults(), types: view.TYPE_OPTIONS.map(row => row[1]), typeIndex: 8,
    photosUnavailable: ['cloud_function', 'cloud_http_function'].includes(config.API_TRANSPORT) && config.CLOUD_PHOTOS_ENABLED !== true,
    statuses: ['使用中', '闲置'], statusIndex: 0, photoPath: '', previewPath: '', photoBusy: false,
    photoLoading: false, photoError: '', photoProgress: -1, hasPhoto: false, busy: false, loading: false, loadFailed: false, focusField: '', error: '',
    draftPrompt: false, draftName: '', draftTime: '', draftStatus: '', draftReady: true, draftWorking: false },
  ...coverPicker.methods,
  ...ledgerPayment.methods,
  onResize(event) { coverPicker.resize(this,event.size && event.size.windowHeight) },
  onLoad(options) {
    this._alive = true; this._visible = true; this._sequence = 0; this._photoSequence = 0
    this._token = getApp().globalData.token
    this._photoOwner = {}; this._photos = api.photoCache()
    this.wishId = Number(options.wishId || 0)
    this.itemId = Number(options.id || 0); this.setData({ itemId: this.itemId })
    if (typeof wx.setNavigationBarTitle === 'function') wx.setNavigationBarTitle({ title: this.itemId ? '编辑物品' : '添加物品' })
    if (getApp().requireSession()) {
      locations.load(this)
      coverPicker.capability(this)
      if (this.itemId) this.load()
      else if (this.wishId) this.initWish()
      else this.initDraft()
    }
  },
  onShow() {
    this._visible = true
    if (getApp().globalData.token !== this._token) {
      this.setData({...ledgerPayment.data,paymentReady:true,paymentCandidates:[],paymentChoices:[]})
      if (this._upload?.cancel) this._upload.cancel()
      this._photos.release(this._photoOwner)
      clearTimeout(this._draftTimer)
      photo.releasePage(this)
      this._sequence += 1; this._photoSequence += 1
      this.setData({ storageLocations: [], locationsReady: false, locationNames: [], locationText: '未设置位置', locationsError: '', form: defaults(), iconOpen:false, iconSelected:'', iconRows:[],iconSelectionSupported:false,coverCatalogueVersion:0,coverCatalogueNote:'',coverSupported:false, coverCapabilityLoading:false, coverArt:covers.fallback({}), photoPath: '', previewPath: '', hasPhoto: false, photoBusy: false,
        photoLoading: false, photoError: '', loading: false, loadFailed: true, draftPrompt: false,
        draftReady: false, draftStatus: '', error: '登录账户已切换，请重新打开物品表单。' })
    }
  },
  onHide() {
    this.flushDraft()
    this._visible = false
    // Native camera/crop screens may hide the page without navigating away.
    // current() also checks the page stack before accepting their callbacks.
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    if (pages[pages.length - 1] !== this) {
      if (this._upload?.cancel) this._upload.cancel()
      this._photos.release(this._photoOwner)
      this._sequence += 1; this._photoSequence += 1
      this.setData({ photoBusy: false, photoLoading: false })
    }
  },
  onUnload() { this.flushDraft(); if (this._upload?.cancel) this._upload.cancel(); this._alive = false; this._sequence += 1; this._photoSequence += 1; this._photos.release(this._photoOwner); photo.releasePage(this) },
  initDraft() {
    const identity = drafts.scope(require('../../utils/cloud-transport').serviceScope(), getApp().globalData.user)
    this._draft = drafts.createStore(identity && identity + (this.wishId ? '|wish:' + this.wishId : ''))
    this._draftDirty = false; this._draftRevision = 0
    try {
      const row = this._draft && this._draft.read()
      if (!row) return
      this._restoringDraft = row
      const date = new Date(row.savedAt)
      const pad = value => String(value).padStart(2, '0')
      const time = Number.isNaN(date.getTime()) ? '上次填写' : `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
      this.setData({ draftPrompt: true, draftReady: false, draftName: row.form.name || '未命名物品', draftTime: time })
    } catch (_) { this.setData({ draftStatus: '草稿未保存：本机存储不可用，仍可正式提交。' }) }
  },
  async initWish() {
    this.setData({loading:true,draftReady:false})
    const token=this._token
    try {
      const row=await api.request('/wishlist/'+this.wishId)
      if(!this.current(token))return
      if(row.status==='purchased') {
        if(!row.item_available)throw new Error('这个心愿已转换过，关联物品已删除，不能再次创建。')
        wx.redirectTo({url:'/pages/item/index?id='+row.item_id});return
      }
      this._wishRevision=row.revision
      this._wishForm=itemCategory.normalize({...defaults(),name:row.name,purchase_price:row.expected_price||'',notes:row.reason||''})
      this.setData({form:{...this._wishForm},loading:false,draftReady:true})
      this.initDraft()
    } catch(error) {if(this.current(token))this.setData({loading:false,loadFailed:true,error:view.errorMessage(error)})}
  },
  changed() {
    locations.sync(this)
    if (this.itemId || !this.data.draftReady) return
    this._draftDirty = true; this._draftRevision += 1
    this.setData({ draftStatus: '正在保存草稿…' })
    clearTimeout(this._draftTimer)
    this._draftTimer = setTimeout(() => this.flushDraft(), 500)
  },
  async flushDraft() {
    clearTimeout(this._draftTimer)
    if (this.itemId || !this._draftDirty || !this.data.draftReady || this._created) return
    const token = this._token, revision = this._draftRevision, source = this.data.photoPath
    if (this._draftPending && this._draftPending.revision === revision) return this._draftPending.task.catch(() => null)
    const active = () => token === getApp().globalData.token && !this._created && revision === this._draftRevision
    try {
      if (!this._draft) throw new Error('账户编号不可用')
      const task = this._draft.save(this.data.form, source, active)
      this._draftPending = { revision, task }
      const row = await task
      if (row && active()) {
        this._draftDirty = false
        if (this._alive) this.setData({ photoPath: row.photoPath, previewPath: row.photoPath || this.data.previewPath, draftStatus: '草稿已保存到本机' })
      }
    } catch (_) {
      if (active() && this._alive) this.setData({ draftStatus: '草稿未保存：请检查本机存储，仍可正式提交。' })
    } finally { if (this._draftPending && this._draftPending.revision === revision) this._draftPending = null }
  },
  async continueDraft() {
    if (this.data.draftWorking || !this.current()) return
    const token = this._token
    this.setData({ draftWorking: true })
    try {
      const row = await this._draft.restore(this._restoringDraft)
      if (!this.current(token)) return
      const form = itemCategory.normalize({ ...defaults(), ...row.form })
      const typeIndex = itemCategory.index(form)
      if (!['active', 'idle'].includes(form.status)) form.status = 'active'
      this.setData({ form, typeIndex: typeIndex < 0 ? 8 : typeIndex, statusIndex: form.status === 'idle' ? 1 : 0,
        photoPath: row.photoPath, previewPath: row.photoPath, draftPrompt: false, draftReady: true,
        draftStatus: '草稿已保存到本机', photoError: row.missingPhoto ? '草稿照片已丢失，请重新选图；其他填写内容已恢复。' : '' })
      if (!covers.byKey[form.cover_icon_key]) this.setData({'form.cover_icon_key':null})
      if (!['photo','icon'].includes(row.form.cover_mode)) this.setData({'form.cover_mode':row.photoPath?'photo':'icon'})
      coverPicker.sync(this)
      ledgerPayment.sync(this)
      locations.sync(this)
      if (row.missingPhoto || form.category !== row.form.category || form.icon_type !== row.form.icon_type) this.changed()
    } catch (_) { if (this.current(token)) this.setData({ draftStatus: '草稿读取失败，请重试。' }) }
    finally { if (this.current(token)) this.setData({ draftWorking: false }) }
  },
  closeDraft() {
    if (this.data.draftWorking) return
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/items/index' }) })
  },
  restartDraft() { return this.discardDraft(true) },
  async discardDraft(restart = false) {
    if (!this.current() || this.data.busy || this.data.photoBusy || this.data.draftWorking) return
    const token = this._token
    this.setData({ draftWorking: true })
    try {
      const confirm = await new Promise(resolve => wx.showModal({ title: restart === true ? '重新填写？' : '丢弃草稿？',
        content: '本机保存的填写内容和草稿照片将被清除。', success: result => resolve(result.confirm), fail: () => resolve(false) }))
      if (!confirm || !this.current(token)) return
      clearTimeout(this._draftTimer); this._draftRevision += 1
      await this._draft.discard(() => token === getApp().globalData.token)
      if (!this.current(token)) return
      this._draftDirty = false; this._restoringDraft = null
      this.setData({ form: this._wishForm ? {...this._wishForm} : defaults(), typeIndex: 8, statusIndex: 0, photoPath: '', previewPath: '', photoError: '',
        error: '', draftPrompt: false, draftReady: true, draftStatus: '' })
      coverPicker.sync(this)
    } catch (_) { if (this.current(token)) this.setData({ draftStatus: '草稿清理失败，请重试。' }) }
    finally { if (this.current(token)) this.setData({ draftWorking: false }) }
  },
  current(token = this._token) {
    if (!this._alive || token !== this._token || getApp().globalData.token !== token) return false
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    return this._visible !== false || pages[pages.length - 1] === this
  },
  async load() {
    if (this.data.busy || this.data.photoBusy || !this.current()) return
    const sequence = ++this._sequence, token = this._token
    this.setData({ loading: true, loadFailed: false, error: '' })
    try {
      const item = await api.request(`/items/${this.itemId}`)
      this._serverRevision = item.revision
      if (!this.current(token) || sequence !== this._sequence) return
      this._photoItem = item; this._photos.sync([item])
      const typeIndex = itemCategory.index(item)
      this.setData({ form: itemCategory.normalize({ name: item.name, category: item.category, icon_type: item.icon_type,
        purchase_date: item.purchase_date, purchase_price: item.purchase_price,
        warranty_expires_on: item.warranty_expires_on || '', notes: item.notes,
        status: item.status, payment_info:item.payment_info || null, cover_mode:item.cover_mode || (item.photo_url?'photo':'icon'), cover_icon_key:item.cover_icon_key || null, storage_location_id: item.storage_location_id || null, storage_location_name: item.storage_location_name || '' }), typeIndex, statusIndex: item.status === 'idle' ? 1 : 0,
        hasPhoto: Boolean(item.photo_url), photoPath: '', previewPath: '', photoError: '' })
      coverPicker.sync(this)
      locations.sync(this)
      ledgerPayment.sync(this)
      if (covers.photo(item)) this.loadPhoto()
    } catch (error) { if (this.current(token) && sequence === this._sequence) this.setData({ loadFailed: true, error: view.errorMessage(error) }) }
    finally { if (this.current(token) && sequence === this._sequence) this.setData({ loading: false }) }
  },
  locationChange(e) { return locations.change(this, e) },
  retryLocations() { return locations.load(this) },
  locationSync() { locations.sync(this) },
  input(event) { this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value }); this.changed() },
  focus(event) { this.setData({ focusField: event.currentTarget.dataset.key }) },
  blur() { this.setData({ focusField: '' }) },
  typeChange(event) { const index = Number(event.detail.value); if (!view.TYPE_OPTIONS[index] || this.data.busy) return; this.setData({ typeIndex: index, 'form.icon_type': view.TYPE_OPTIONS[index][0], 'form.category': view.TYPE_OPTIONS[index][1] }); coverPicker.sync(this); this.changed() },
  statusChange(event) { const index = Number(event.detail.value); this.setData({ statusIndex: index, 'form.status': index ? 'idle' : 'active' }); this.changed() },
  clearWarranty() { this.setData({ 'form.warranty_expires_on': '' }); this.changed() },
  async loadPhoto() {
    if (!this.current() || !this.data.hasPhoto || this.data.form.cover_mode === 'icon' || this.data.photoBusy || this.data.photoPath) return
    const sequence = ++this._photoSequence, token = this._token
    this.setData({ photoLoading: true, photoError: '' })
    try {
      const path = await api.downloadPhoto(this.itemId, { owner: this._photoOwner, version: this._photoItem && this._photoItem.photo_version })
      if (this.current(token) && sequence === this._photoSequence) this.setData({ previewPath: path })
    } catch (_) {
      if (this.current(token) && sequence === this._photoSequence) this.setData({ photoError: '原照片读取失败，可重试或重新选择；保存其他信息不会删除原照片。' })
    } finally {
      if (this.current(token) && sequence === this._photoSequence) this.setData({ photoLoading: false })
    }
  },
  previewFailed() {
    if (!this.data.photoPath) this._photos.invalidate(this.itemId)
    this.setData({ previewPath: '', photoError: this.data.photoPath ? '照片预览失败，请重新选择照片。'
      : '原照片读取失败，可重试或重新选择；保存其他信息不会删除原照片。' })
  },
  async photoOperation(action) {
    if (!coverPicker.allowed(this)) return
    const sequence = ++this._photoSequence, token = this._token
    this.setData({ photoBusy: true, photoLoading: false, photoError: '' })
    const active = () => this.current(token) && sequence === this._photoSequence
    try {
      const path = await action(active)
      if (path && active()) {
        this._photoRetry = null
        this.setData({ photoPath: path, previewPath: path, 'form.cover_mode':'photo' }); this.changed()
        await this.flushDraft()
      }
    } catch (error) {
      if (active() && !photo.cancelled(error)) this.setData({ photoError: photo.photoError(error) })
    } finally {
      if (active()) this.setData({ photoBusy: false })
    }
  },
  choosePhoto() {
    if (this.data.photosUnavailable) {
      this.setData({ photoError: '云端照片暂不可用，物品资料仍可正常保存' })
      return
    }
    return this.photoOperation(async active => {
      const choice = await photo.nativeCall('showActionSheet', { itemList: ['从相册选择', '拍一张照片'], itemColor: '#493B35' })
      if (!active() || ![0, 1].includes(choice.tapIndex)) return
      const result = await photo.nativeCall('chooseMedia', { count: 1, mediaType: ['image'],
        sourceType: [choice.tapIndex ? 'camera' : 'album'], camera: 'back', sizeType: ['compressed'] })
      const path = result.tempFiles && result.tempFiles[0] && result.tempFiles[0].tempFilePath
      if (!path) throw new Error('没有读取到照片')
      return photo.preparePhoto(this, path, active)
    })
  },
  cropPhoto() {
    if (!this.data.previewPath) return
    return this.photoOperation(async active => {
      const path = await photo.cropPhoto(this.data.previewPath)
      return photo.preparePhoto(this, path, active)
    })
  },
  rotatePhoto() {
    if (!this.data.previewPath) return
    return this.photoOperation(active => photo.rotatePhoto(this, this.data.previewPath, active))
  },
  async save() {
    if (!this.current() || this.data.busy || this.data.photoBusy || this.data.loading || this.data.loadFailed || !this.data.draftReady || this.data.draftWorking) return
    const token = this._token
    this.setData({ busy: true, error: '' })
    try {
      if (!this.data.paymentReady) throw new Error('正在检查记账功能，请稍后保存。')
      if (this.data.paymentEnabled && !this.data.form.payment_info) throw new Error('请确认已付款、分期或仅建档。')
      if (!this.data.paymentEnabled && this.data.form.payment_info && this.data.paymentError) throw new Error('付款确认尚未核验，请重新检查记账功能后保存。')
      const form = itemCategory.normalize(this.data.form), creating = !this.itemId
      this.setData({ form, typeIndex: itemCategory.index(form) })
      const iconIntent = form.cover_mode === 'icon' && (form.cover_icon_key || this.data.hasPhoto)
      if (iconIntent && !this.data.coverSupported) throw new Error('预设图标尚不可用，请同步新版后端或重新检查；当前填写已保留。')
      if (this.data.coverSupported && form.cover_icon_key && !coverPicker.canUse(this,form.cover_icon_key)) throw new Error('当前封面属于新增图标，请同步新版服务端后保存；当前填写已保留。')
      if (iconIntent && this.data.hasPhoto) {
        const confirmed = await new Promise(resolve=>wx.showModal({title:'改用图标封面？',content:'保存后将删除原照片，之后需重新上传。',confirmText:'确认替换',success:r=>resolve(r.confirm),fail:()=>resolve(false)}))
        if (!confirmed || !this.current(token)) return
      }
      let uploadPath = ''
      if (this.data.photoPath) {
        try {
          uploadPath = this._photoRetry ? this.data.photoPath
            : await photo.preparePhoto(this, this.data.photoPath, () => this.current(token))
          if (this.current(token)) this.setData({ photoError: '' })
        }
        catch (_) {
          if (this.current(token)) this.setData({ photoError: '照片压缩失败，填写内容和草稿仍保留。请重试保存或重新选择照片。' })
          return
        }
      }
      if (!this.current(token)) return
      let payload = { ...form, warranty_expires_on: form.warranty_expires_on || null }
      if (!this.data.paymentEnabled) delete payload.payment_info
      delete payload.storage_location_name
      if (this.data.coverSupported) {
        // A new photograph becomes the cover only after its upload commits.
        if (uploadPath) {
          payload.cover_mode = this._photoItem?.cover_mode || (this.data.hasPhoto ? 'photo' : 'icon')
          payload.cover_icon_key = this._photoItem?.cover_icon_key || form.cover_icon_key || null
        }
      } else { delete payload.cover_mode; delete payload.cover_icon_key }
      if (!this.data.locationsReady || payload.status === 'disposed') delete payload.storage_location_id
      const submissionPath = this.itemId ? `/items/${this.itemId}` : this.wishId ? `/wishlist/${this.wishId}/convert` : '/items'
      const recovered = itemCategory.submission(payload, { method: this.itemId ? 'PUT' : 'POST', path: submissionPath,
        revision: this.itemId ? this._serverRevision : this.wishId ? this._wishRevision : undefined,
        photoSnapshot: this._photoRetry && this._savedPayload })
      payload = recovered.payload
      const payloadKey = JSON.stringify(payload)
      if (this._photoRetry && this._savedPayload !== payloadKey) throw new Error('上次照片提交结果尚未确认，请先重试原内容的照片，再修改资料')
      const item = config.API_TRANSPORT === 'cloud_http_function' && this._savedPayload === payloadKey && this._savedItem ? this._savedItem : this.itemId
        ? await api.request(`/items/${this.itemId}`, { method: 'PUT', data: payload, revision: this._serverRevision })
        : this.wishId ? await api.request(`/wishlist/${this.wishId}/convert`, {method:'POST',data:payload,revision:this._wishRevision})
        : await api.request('/items', { method: 'POST', data: payload })
      this._serverRevision = item.revision
      this._photoItem = item
      if (this.current(token)) this.setData({hasPhoto:!!item.photo_url})
      this._photos.sync([item])
      this._savedPayload = payloadKey; this._savedItem = item
      if (creating) {
        this._created = true; clearTimeout(this._draftTimer)
        // Subsequent attempts on this page edit the created item, never POST again.
        this.itemId = item.id
        this.setData({itemId: item.id})
        try { if (this._draft) this._draft.complete() }
        catch (_) { if (this.current(token)) this.setData({ draftStatus: '物品已创建，但草稿清理失败，请丢弃残留草稿。' }) }
      }
      try {
        if (!this.current(token)) return
        // An icon cover owns no photograph. Legacy backends without cover support
        // keep the previous upload behaviour.
        if (uploadPath && (!this.data.coverSupported || form.cover_mode !== 'icon')) {
          try {
            this.setData({photoProgress: 0})
            this._upload = this._photoRetry?.retry ? this._photoRetry.retry() : api.uploadPhoto(item.id, uploadPath, {revision: this._serverRevision, onProgress: value => {
              if (this.current(token)) this.setData({photoProgress: value})
            }})
            const uploaded = await this._upload
            this._serverRevision = uploaded?.revision
            this._savedItem = uploaded || item
            this._photoRetry = null
          }
          catch (error) {
            if (!this.current(token)) return
            const keepPhoto = config.API_TRANSPORT === 'cloud_http_function'
            if (keepPhoto) this._photoRetry = error.code === 'ITEM_VERSION_CONFLICT' || error.status === 428 ? null : this._upload
            if (error.code === 'ITEM_VERSION_CONFLICT') this.setData({versionConflict: true})
            if (keepPhoto) this.setData({photoPath: uploadPath, previewPath: uploadPath,
              photoError: '物品资料已保存，照片未完成。填写内容和照片仍保留，可再次保存重试。'})
            await new Promise(resolve => wx.showModal({ title: '物品已保存',
              content: `照片上传失败：${view.errorMessage(error)}。${keepPhoto ? '照片仍保留，可再次保存重试。' : '可进入详情后重新编辑上传。'}`,
              showCancel: false, complete: resolve }))
            if (keepPhoto) return
          } finally { this._upload = null; if (this.current(token)) this.setData({photoProgress: -1}) }
        }
        if (this.current(token)) {
          if (recovered.legacyCategory) this.setData({ error: '上次提交已按原内容核对完成。请再次保存，将分类更新为所选预设分类。' })
          else wx.navigateBack()
        }
      } finally {
        if (creating && this._draft) await this._draft.cleanup().catch(() => {})
      }
    } catch (error) { if (this.current(token)) this.setData({ error: view.errorMessage(error), versionConflict: error.code === 'ITEM_VERSION_CONFLICT' }) }
    finally { if (this.current(token)) this.setData({ busy: false }) }
  },
  async reviewConflict() {
    if(this.wishId && !this.itemId && !this.data.busy && this.current()) {
      try {
        const row=await api.request('/wishlist/'+this.wishId)
        if(!this.current())return
        if(row.status==='purchased') {
          if(!row.item_available)throw new Error('心愿已转换，关联物品已删除。')
          wx.redirectTo({url:'/pages/item/index?id='+row.item_id});return
        }
        const agreed=await new Promise(resolve=>wx.showModal({title:'核对最新心愿',content:`${row.name}；预计 ${row.expected_price||'未填'}。当前填写保留，核对后再保存。`,success:r=>resolve(r.confirm),fail:()=>resolve(false)}))
        if(agreed && this.current()){this._wishRevision=row.revision;this.setData({versionConflict:false,error:'已核对最新心愿，请再次保存。'})}
      } catch(e){if(this.current())this.setData({error:view.errorMessage(e)})}
      return
    }
    if (this.data.busy || !this.current() || !this.itemId) return
    const token = this._token
    try {
      const latest = await api.request(`/items/${this.itemId}`)
      if (!this.current(token)) return
      const fields = ['name','category','purchase_date','purchase_price','warranty_expires_on','notes','status','cover_mode','cover_icon_key','payment_info']
      const describe = value => value && typeof value === 'object' ? `${{paid:'已付款',installment:'分期首付',archive:'仅建档'}[value.mode] || value.mode} ${value.amount || ''} ${value.paid_on || ''}` : String(value ?? '空')
      const changed = fields.filter(key => JSON.stringify(latest[key] ?? null) !== JSON.stringify(this.data.form[key] ?? null))
      if (latest.icon_type !== this.data.form.icon_type && !changed.includes('category')) changed.unshift('category')
      const labels = {name:'名称',category:'分类',purchase_date:'购买日期',purchase_price:'价格',warranty_expires_on:'保修日期',notes:'备注',status:'状态',cover_mode:'封面方式',cover_icon_key:'封面图标',payment_info:'实际付款'}
      const describeCategory = form => form.category === itemCategory.normalize(form).category ? form.category : `${form.category}（${itemCategory.normalize(form).category}）`
      const content = changed.map(key => `${labels[key]}：云端 ${key === 'category' ? describeCategory(latest) : describe(latest[key])}；当前填写 ${key === 'category' ? describeCategory(this.data.form) : describe(this.data.form[key])}`).join('\n')
      const agreed = await new Promise(resolve => wx.showModal({title:'核对其他设备的修改',content:content || '云端照片或关联记录已更新，当前填写内容保留。',confirmText:'已核对',success:r=>resolve(r.confirm),fail:()=>resolve(false)}))
      if (agreed && this.current(token)) {
        this._photoItem = latest; this.setData({hasPhoto:!!latest.photo_url})
        this._serverRevision = latest.revision; this._savedPayload = null; this._savedItem = null; this._photoRetry = null
        this.setData({versionConflict:false,error:'已读取最新版本，填写内容保留，请核对后再保存。'})
      }
    } catch(error) {if(this.current(token)) this.setData({error:view.errorMessage(error)})}
  }
}))
