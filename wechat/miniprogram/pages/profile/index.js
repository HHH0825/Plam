const api = require('../../utils/api')
const view = require('../../utils/view')
const { AVATAR_KEYS, AVATAR_LABELS, avatarState, avatarError, isCurrent } = require('../../utils/profile')

Page(require('../../utils/member').wrap({
  data: { user: null, accountId: '', name: '', avatarSymbol: '芽', avatarLabels: AVATAR_LABELS,
    avatarIndex: 0, avatarPath: '', avatarFailed: false, loading: true, loaded: false, busy: false, reconnecting:false, focused: false, error: '' },
  onLoad() { this._sequence = 0;this.setData({localMode:!!getApp().globalData.localMode}) },
  onShow() {
    this._visible = true
    if (getApp().requireSession()) this.load()
  },
  onHide() {
    this.captureSessionDraft()
    this._visible = false
    this._loadedToken = ''
    this._sequence += 1
    this.setData({ user: null, accountId: '', name: '', avatarSymbol: '芽', avatarIndex: 0, avatarPath: '', avatarFailed: false, loading: true,
      loaded: false, busy: false, focused: false, error: '' })
  },
  onUnload() { this._visible = false; this._loadedToken = ''; this._sequence += 1 },
  async load() {
    if (this.data.busy) return
    const sequence = ++this._sequence
    const token = getApp().globalData.token
    this._loadedToken = ''
    this.setData({ user: null, accountId: '', loading: true, loaded: false, error: '' })
    try {
      const result = await api.request('/auth/me')
      if (!isCurrent(this, sequence, token)) return
      this._loadedToken = token
      this._savedName=result.user.username;this._savedAvatar=result.user.avatar_key
      const id = result.user.id
      this.setData({ user: result.user, accountId: Number.isSafeInteger(id) && id > 0 ? String(id) : '', name: result.user.username, ...avatarState(result.user),
        loaded: true, loading: false })
      const draft=getApp()._profileDrafts?.[this.draftKey(id)]
      if(draft)this.setData({name:draft.name,...avatarState({avatar_key:draft.avatar})})
    } catch (error) {
      if (isCurrent(this, sequence, token)) this.setData({ loading: false, error: view.errorMessage(error) })
    }
  },
  copyUserId() {
    const token = this._loadedToken, sequence = this._sequence
    if (!this.data.loaded || this.data.loading || this.data.busy || !this.data.accountId || !isCurrent(this, sequence, token)) return
    wx.setClipboardData({
      data: this.data.accountId,
      fail: () => {
        if (isCurrent(this, sequence, token)) wx.showToast({title:'复制未完成，请重试',icon:'none'})
      }
    })
  },
  avatarError,
  draftKey(id=this.data.user?.id){return require('../../utils/cloud-transport').serviceScope()+':'+id},
  dirty(){return this.data.loaded&&(this.data.name!==this._savedName||AVATAR_KEYS[this.data.avatarIndex]!==this._savedAvatar)},
  captureSessionDraft(){
    if(!this.dirty()||this._discardDraft||this._loadedToken!==getApp().globalData.token)return
    const app=getApp();(app._profileDrafts||(app._profileDrafts={}))[this.draftKey()]={name:this.data.name,avatar:AVATAR_KEYS[this.data.avatarIndex]}
  },
  async reconnect(){
    if(this.data.busy||this.data.reconnecting||this._connectingPrompt)return
    const token=getApp().globalData.token;this._connectingPrompt=true
    if(this.dirty()){
      const discard=await new Promise(resolve=>wx.showModal({title:'放弃未保存的资料？',content:'重新连接后将读取已保存的资料。',confirmText:'重新连接',cancelText:'返回编辑',success:r=>resolve(r.confirm),fail:()=>resolve(false)}))
      this._connectingPrompt=false
      if(!discard||!this._visible||token!==getApp().globalData.token)return
    }
    this._discardDraft=true
    if(getApp()._profileDrafts)delete getApp()._profileDrafts[this.draftKey()]
    this.setData({reconnecting:true})
    try{await getApp().reconnect()}catch(_){/* Shared connection UI provides retry. */}
    finally{this._connectingPrompt=false;if(this._visible)this.setData({reconnecting:false})}
  },
  nameInput(event) { this.setData({ name: event.detail.value }) },
  focus() { this.setData({ focused: true }) },
  blur() { this.setData({ focused: false }) },
  avatarChange(event) {
    const index = Number(event.detail.value)
    if (!AVATAR_KEYS[index]) return
    this.setData(avatarState({ avatar_key: AVATAR_KEYS[index] }))
  },
  async save() {
    if (!this._visible || !this.data.loaded || this.data.loading || this.data.busy) return
    const sequence = ++this._sequence
    const token = getApp().globalData.token
    this.setData({ busy: true, error: '' })
    let saved = false
    try {
      const result = await api.request('/profile', { method: 'PUT', data: {
        username: this.data.name, avatar_key: AVATAR_KEYS[this.data.avatarIndex] } })
      if (!isCurrent(this, sequence, token)) return
      saved = true
      if (!getApp().updateUser(result.user, token)) return
      this._savedName=result.user.username;this._savedAvatar=result.user.avatar_key
      if(getApp()._profileDrafts)delete getApp()._profileDrafts[this.draftKey()]
      wx.showToast({ title: '已保存', icon: 'success' })
      this.back()
    } catch (error) {
      if (isCurrent(this, sequence, token)) this.setData({ error: saved
        ? '资料已保存，但本地显示更新失败。返回“我的”可重新读取。' : view.errorMessage(error) })
    } finally {
      if (isCurrent(this, sequence, token)) this.setData({ busy: false })
    }
  },
  back() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/me/index' }) })
    } else wx.switchTab({ url: '/pages/me/index' })
  }
}))
