const api = require('../../utils/api')
const view = require('../../utils/view')
const { base } = require('../../utils/purchase-ui')
const time = require('./lib/expense-progress')
const { present } = time
const formUI=require('./lib/form')
const lifecycle = base()
const blank = () => ({ name:'',kind:'subscription',status:'active',amount:'',cycle:'month',cycle_days:30,anchor_on:time.today(),service_from:'',service_until:'',item_id:null,principal_total:'',periods:12,notes:'' })
const cycles = ['month','quarter','year','days'], states = ['active','paused','ended']
Page(require('../../utils/member').wrap({
  ...lifecycle, kind:'expense',
  onShow() { this.stopMidnight();if(this._token===getApp().globalData.token&&this.data.form?._submission?.savedId){this.options.id=this.data.form._submission.savedId;this.clearForm('new');this.setData({editing:false,recordInitial:false,createPending:false})}lifecycle.onShow.call(this); if(this.current()) {this.refreshTime();this.scheduleMidnight()} },
  onHide() { this.stopMidnight();lifecycle.onHide.call(this) },
  onUnload() { this.stopMidnight();lifecycle.onUnload.call(this) },
  stopMidnight() { if(this._midnightTimer != null) clearTimeout(this._midnightTimer);this._midnightTimer=null },
  scheduleMidnight() {
    this.stopMidnight()
    if(typeof setTimeout !== 'function' || !this.current())return
    const token=this._token
    this._midnightTimer=setTimeout(()=>{this._midnightTimer=null;if(this.current() && this._token===token){this.refreshTime();this.scheduleMidnight()}},time.untilMidnight())
  },
  refreshTime() {
    if(!this.current())return
    this.setData({today:time.today(),rows:this.data.rows.map(row=>present(row)),...(this.data.selected ? {selected:present(this.data.selected)} : {})})
    this.apply()
  },
  data:{rows:[],shown:[],items:[],itemNames:['不关联物品'],itemIndex:0,selected:null,editing:false,paying:false,form:blank(),payment:{},filterIndex:0,filters:['管理中','已暂停','已结束','全部'],filter:'active',cycles:['每月','每季','每年','自定义天数'],cycleIndex:0,kinds:['订阅续费','分期还款'],kindIndex:0,statuses:['管理中','已暂停','已结束'],statusIndex:0,totals:null,busy:false,loading:true,error:'',conflict:false,today:time.today(),listReady:false,featureUnavailable:false,detailMissing:false,itemsReady:false,itemsLoading:false,itemsError:'',formLinkText:'不关联物品',moreOpen:false,hasFees:false,recordInitial:false,initialConsent:false,initialForm:{},formSummary:{},createPending:false,quickState:'loading',quickError:'',ledgerEnabled:false,nextDateEdited:false},
  canManage() { return this.current() && this.data.listReady && !this.data.featureUnavailable && !this.data.detailMissing },
  formEditable(){return this.canManage()&&!this.data.busy&&!this.data.createPending},
  field(e){if(!this.formEditable())return;const k=e.currentTarget.dataset.field;this.setData({['form.'+k]:e.detail.value,...(k==='anchor_on'?{nextDateEdited:true,'form._nextDateEdited':true}:{})});this.refreshForm();this.storeForm()},
  refreshForm(){
    const f=this.data.form,initial={...this.data.initialForm}
    if(!initial.amountEdited)initial.amount=f.amount
    if(!initial.principalEdited)initial.principal=formUI.money(formUI.principal(f))
    initial.paid_on=initial.paid_on||time.today();initial.notes=initial.notes||''
    this.setData({initialForm:initial,formSummary:formUI.summary(f,this.data.recordInitial?initial:null,this.data.selected),createPending:!!f._submission&&!f._submission.savedId})
  },
  toggleMore(){if(!this.data.busy)this.setData({moreOpen:!this.data.moreOpen})},
  toggleFees(e){if(!this.formEditable())return;const enabled=!!e.detail.value,f=this.data.form;this.setData({hasFees:enabled,'form._fees':enabled,'form._feeDraft':enabled?(f._feeDraft??''):f.amount,'form.amount':enabled?(f._feeDraft||''):'0.00'});this.refreshForm();this.storeForm()},
  async loadQuickSupport(){
    if(!this.current()||this.data.selected)return
    const seq=this._quickSeq=(this._quickSeq||0)+1,token=this._token;this.setData({quickState:'loading',quickError:''})
    try{const [me,settings]=await Promise.all([api.request('/auth/me'),api.request('/ledger/settings')]);if(!this.current()||token!==this._token||seq!==this._quickSeq)return;if(typeof settings.enabled!=='boolean')throw Error('记账状态暂时无法读取');this.setData({quickState:me.capabilities?.fixed_expense_quick_add===1?'ready':'unavailable',ledgerEnabled:settings.enabled})}
    catch(e){if(this.current()&&token===this._token&&seq===this._quickSeq)this.setData({quickState:'error',quickError:'记账状态读取失败，可重试或仅保存计划。'})}
  },
  async toggleInitial(e){
    if(!this.formEditable()||this.data.quickState!=='ready'||this._initialConfirming)return
    const enabled=!!e.detail.value;let consent=false
    if(enabled&&!this.data.ledgerEnabled){this._initialConfirming=true;try{consent=await this.confirm('启用记账并记录本次付款？','保存时将一起启用记账，并按你确认的实际日期和金额记录这笔支出。取消后仍可仅保存计划。')}finally{this._initialConfirming=false}if(!consent){if(this.current())this.setData({recordInitial:false});return}}
    if(!this.current())return;this.setData({recordInitial:enabled,initialConsent:consent});this.refreshForm()
  },
  initialField(e){if(!this.formEditable())return;const k=e.currentTarget.dataset.field;this.setData({['initialForm.'+k]:e.detail.value,...(['amount','principal'].includes(k)?{['initialForm.'+k+'Edited']:true}:{})});this.refreshForm();this.setData({'form._initialDraft':this.data.initialForm});this.storeForm()},
  persistCreation(form,token){if(token!==getApp().globalData.token)return;wx.setStorageSync(require('../../utils/purchase-ui').formKey('expense','new'),form)},
  actionError(e) {
    return e.status === 404 ? {detailMissing:true,editing:false,paying:false,conflict:false,error:'这条订阅/分期记录已删除或无法访问，请返回列表。'} : {}
  },
  async load() {
    if (!this.current()) return
    const sequence = ++this._sequence
    this.setData({loading:true,error:this.data.detailMissing?this.data.error:'',conflict:false,listReady:false,shown:[],totals:null})
    const list = this.loadList(sequence), items = this.loadItems(sequence)
    await Promise.allSettled([list,items])
  },
  async loadList(sequence) {
    try {
      const data = await api.request('/fixed-expenses')
      if (!data || !Array.isArray(data.plans)) throw new Error('订阅/分期数据暂时无法读取，请重新检查。')
      if (!this.current(sequence)) return
      this.setData({rows:data.plans.map(row=>present(row)),totals:data.totals,loading:false,error:this.data.detailMissing?this.data.error:'',listReady:true,featureUnavailable:false})
      this.apply()
      if (this.options.id || this.data.selected?.id) {
        const target = Number(this.options.id || this.data.selected.id)
        const detail = await api.request('/fixed-expenses/' + target)
        if (this.current(sequence)) { this.setData({selected:present(detail),editing:false,paying:false}); this.options.id='' }
      }
    } catch(e) {if(this.current(sequence)) this.setData({loading:false,rows:[],shown:[],totals:null,listReady:false,featureUnavailable:e.status===404,error:e.status===404?'订阅/分期功能暂不可用，云端接口尚未开放或版本未同步。请稍后重新检查。':view.errorMessage(e)})}
  },
  async loadItems(sequence=this._sequence) {
    if (!this.current(sequence)) return
    const request = this._itemsSequence = (this._itemsSequence || 0) + 1
    this.setData({itemsReady:false,itemsLoading:true,itemsError:''})
    try {
      const items = await api.request('/items')
      if (!Array.isArray(items)) throw new Error('物品列表暂时无法读取')
      if (!this.current(sequence) || request!==this._itemsSequence) return
      this.setData({items,itemNames:['不关联物品',...items.map(i=>i.name+(i.status==='disposed'?'（已处置）':''))],itemsReady:true,itemsLoading:false,itemsError:''})
      this.updateLinks()
    } catch(e) {
      if(this.current(sequence) && request===this._itemsSequence) this.setData({itemsReady:false,itemsLoading:false,itemsError:'关联物品读取失败，已有订阅/分期仍可查看；原关联保留，暂不能更换。'})
    }
  },
  retryItems() { return this.loadItems() },
  linkText(id,name) {
    const index=this.data.items.findIndex(i=>i.id===id)+1
    if (!id) return '不关联物品'
    if (!this.data.itemsReady) return '保留原关联'+(name?'：'+name:'')+'（暂不能更换）'
    return index ? this.data.itemNames[index] : '保留原关联'+(name?'：'+name:'')+'（已删除）'
  },
  updateLinks() {
    const form=this.data.form || {}, payment=this.data.payment || {}, row=this.data.selected || {}
    const paymentId=Object.prototype.hasOwnProperty.call(payment,'item_id') ? payment.item_id : row.item_id
    this.setData({itemIndex:this.data.items.findIndex(i=>i.id===form.item_id)+1,formLinkText:this.linkText(form.item_id,form.item_id===row.item_id?row.item_name:''),paymentItemIndex:this.data.items.findIndex(i=>i.id===paymentId)+1,paymentLinkText:this.linkText(paymentId,payment.item_name || row.item_name)})
  },
  apply() {
    const itemId = Number(this.options.itemId || 0)
    this.setData({shown:this.data.rows.filter(r=>(!this.data.filter || r.status===this.data.filter) && (!itemId || r.item_id===itemId)),itemFilter:itemId})
  },
  clearItemFilter() {this.options.itemId='';this.apply()},
  filter(e) {const n=Number(e.detail.value);this.setData({filterIndex:n,filter:[...states,''][n]});this.apply()},
  showForm(form) {
    const itemIndex = this.data.items.findIndex(i=>i.id===form.item_id)+1
    const row=this.data.selected,submission=form._submission
    const nextForm={...form},dateEdited=!!form._nextDateEdited||!!(row&&form.anchor_on!==row.anchor_on&&!form._originalAnchor);if(row?.kind==='subscription'){nextForm._originalAnchor=row.anchor_on;if(!dateEdited)nextForm.anchor_on=row.next_due_on||row.anchor_on}
    const initial=submission?.body?.initial_payment
    this.setData({form:nextForm,editing:true,paying:false,kindIndex:form.kind==='installment'?1:0,cycleIndex:Math.max(0,cycles.indexOf(form.cycle)),statusIndex:Math.max(0,states.indexOf(form.status)),itemIndex,error:'',moreOpen:false,nextDateEdited:dateEdited,hasFees:form.kind==='installment'&&(form._fees??(formUI.cents(form.amount)>0)),recordInitial:!!initial,initialConsent:!!initial?.enable_ledger,initialForm:initial?{...initial,amountEdited:true,principalEdited:true}:{...form._initialDraft,paid_on:form._initialDraft?.paid_on||time.today()}})
    this.refreshForm()
    this.updateLinks()
  },
  add() {if(!this.canManage() || this.data.busy)return;this.setData({selected:null});const form=this.restoreForm({...blank(),item_id:Number(this.options.itemId)||null});if(form._submission?.savedId){this.options.id=form._submission.savedId;this.clearForm('new');return this.load()}this.showForm(form);this.loadQuickSupport()},
  open(e) {
    if(!this.canManage())return
    const id=Number(e.currentTarget.dataset.id)
    return this.act(()=>api.request('/fixed-expenses/'+id),row=>this.setData({selected:present(row),editing:false,paying:false,error:''}))
  },
  edit() {const row=this.data.selected;if(row && this.canManage())this.showForm(this.restoreForm({...blank(),...row},row.id))},
  kindChange(e) {if(!this.formEditable()||this.data.selected)return;const n=Number(e.currentTarget?.dataset?.index??e.detail.value);if(![0,1].includes(n)||n===this.data.kindIndex)return;const old=this.data.form,kind=n?'installment':'subscription',drafts={...old._typeDrafts,[old.kind]:formUI.clean(old)};this.showForm({...drafts[kind]||{...blank(),name:old.name,item_id:old.item_id,notes:old.notes,kind,amount:n?'0.00':'',cycle:'month'},_typeDrafts:drafts});this.storeForm()},
  cycleChange(e) {if(!this.formEditable())return;const n=Number(e.currentTarget?.dataset?.index??e.detail.value);if(!cycles[n])return;this.setData({cycleIndex:n,'form.cycle':cycles[n]});this.refreshForm();this.storeForm()},
  statusChange(e) {if(!this.formEditable())return;const n=Number(e.detail.value);this.setData({statusIndex:n,'form.status':states[n]});this.refreshForm();this.storeForm()},
  itemChange(e) {if(!this.formEditable() || !this.data.itemsReady)return;const n=Number(e.detail.value);if(n && !this.data.items[n-1])return;this.setData({itemIndex:n,'form.item_id':n?this.data.items[n-1].id:null});this.updateLinks();this.storeForm()},
  clearDate(e) {if(!this.formEditable())return;this.setData({['form.'+e.currentTarget.dataset.field]:''});this.refreshForm();this.storeForm()},
  save() {
    if(!this.canManage()||this.data.busy||this._initialConfirming)return
    const row=this.data.selected,id=row?.id
    const form={...this.data.form,periods:Number(this.data.form.periods),cycle_days:Number(this.data.form.cycle_days)}
    const fields=['name','kind','status','amount','cycle','cycle_days','anchor_on','service_from','service_until','item_id','principal_total','periods','notes']
    let data=Object.fromEntries(fields.map(k=>[k,form[k]]))
    if(id&&form.kind==='subscription'&&!this.data.nextDateEdited)data.anchor_on=form._originalAnchor||row.anchor_on
    if(!id&&this.data.recordInitial){if(this.data.quickState!=='ready'&&!form._submission)return;const p=this.data.initialForm;data.initial_payment={paid_on:p.paid_on,amount:p.amount,principal:form.kind==='installment'?p.principal:'0.00',notes:p.notes||'',enable_ledger:!!this.data.initialConsent}}
    let submission=form._submission
    if(!id&&submission?.body){if(Date.now()-submission.at>23*3600000){this.setData({error:'上次结果仍未确认，请先返回列表核对，不会再次创建计划。'});return}data=submission.body}
    const issue=formUI.validate(data,data.initial_payment)
    if(issue){this.setData({error:issue});return}
    if(!id&&!submission){submission={id:'expense-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),at:Date.now(),body:data};const updated={...this.data.form,_submission:submission};try{this.persistCreation(updated,this._token)}catch(_){this.setData({error:'保存标识无法写入本机，请检查存储空间后重试。'});return}this.setData({form:updated,createPending:true})}
    const token=this._token,creationForm={...this.data.form}
    return this.act(async()=>{
      let saved
      try{saved=await api.request('/fixed-expenses'+(id?'/'+id:''),{method:id?'PUT':'POST',data,revision:row?.revision,...(!id?{requestId:submission.id}:{})})}
      catch(e){if(!id&&token===getApp().globalData.token&&e.status>=400&&e.status<500&&!e.retrySameRequest){const f={...creationForm};delete f._submission;if(this.data.form._submission?.id===submission.id)this.setData({form:f,createPending:false});try{this.persistCreation(f,token)}catch(_){}}throw e}
      if(!id&&token===getApp().globalData.token&&Number.isSafeInteger(saved.id)){const f={...creationForm,_submission:{...submission,savedId:saved.id}};if(this.data.form._submission?.id===submission.id)this.setData({form:f});try{this.persistCreation(f,token)}catch(_){}}
      return saved
    },async saved=>{
      this.clearForm(id||'new');this.setData({selected:present(saved),editing:false,recordInitial:false,createPending:false});await this.refreshDetail(saved.id)
      if(data.initial_payment&&saved.initial_payment_created!==true)this.setData({error:'计划已保存，首笔记账结果尚未确认，请核对付款历史；不会自动补记。'})
      else wx.showToast({title:data.initial_payment?'计划和付款已保存':'计划已保存'})
    })
  },
  async refreshDetail(id=this.data.selected?.id) {
    const sequence=this._sequence
    const row=await api.request('/fixed-expenses/'+id)
    if(this.current(sequence))this.setData({selected:present(row)})
  },
  beginPay(e) {
    const row=this.data.selected
    if(!row || this.data.busy || !this.canManage())return
    const id=Number(e?.currentTarget?.dataset?.id || 0)
    const old=id?row.payments.find(p=>p.id===id):null
    const source=old || row, linkedId=source.item_id
    const index=this.data.items.findIndex(i=>i.id===linkedId)+1
    this._paymentId=id
    this.setData({paying:true,editing:false,error:'',payment:old?{...old}:{paid_on:time.today(),amount:row.amount,principal:row.suggested_principal,notes:'',service_until:row.service_until||''},paymentItemIndex:index,paymentLinkText:index ? this.data.itemNames[index] : linkedId ? '保留原关联：'+source.item_name+'（已删除）' : '不关联物品'})
    this.updateLinks()
  },
  paymentField(e) {this.setData({['payment.'+e.currentTarget.dataset.field]:e.detail.value})},
  paymentItem(e) {if(!this.canManage() || !this.data.itemsReady || this.data.busy)return;const n=Number(e.detail.value);if(n && !this.data.items[n-1])return;this.setData({paymentItemIndex:n,paymentLinkText:this.data.itemNames[n],'payment.item_id':n?this.data.items[n-1].id:null})},
  cancelPay() {this.setData({paying:false,error:''})},
  async savePayment() {
    const row=this.data.selected,payment=this.data.payment
    if(!row || !this.canManage())return
    const linkedId=Object.prototype.hasOwnProperty.call(payment,'item_id') ? payment.item_id : row.item_id
    const disposed=this.data.items.some(item=>item.id===linkedId && item.status==='disposed')
    if((row.check_renewal || disposed) && !await this.confirm('检查关联费用', '关联物品已处置或删除。请确认这笔付款仍然发生，订阅需自行向服务商取消。'))return
    const data={paid_on:payment.paid_on,amount:payment.amount,principal:payment.principal,notes:payment.notes||''}
    if(Object.prototype.hasOwnProperty.call(payment,'item_id'))data.item_id=payment.item_id
    if(!this._paymentId){data.cycle_index=row.next_cycle_index;if(row.kind==='subscription' && payment.service_until)data.service_until=payment.service_until}
    return this.act(()=>api.request(`/fixed-expenses/${row.id}/payments`+(this._paymentId?'/'+this._paymentId:''),{method:this._paymentId?'PUT':'POST',data,revision:row.revision}),async()=>{
      this.setData({paying:false});await this.refreshDetail(row.id);wx.showToast({title:'付款已记录'})
    })
  },
  async voidPayment(e) {
    const row=this.data.selected,id=Number(e.currentTarget.dataset.id)
    if(!row||!this.canManage()||!await this.confirm('作废这笔付款？','费用和还款进度会重新计算，历史作废记录仍保留。'))return
    return this.act(()=>api.request(`/fixed-expenses/${row.id}/payments/${id}`,{method:'DELETE',revision:row.revision}),()=>this.refreshDetail(row.id))
  },
  async remove() {
    const row=this.data.selected
    if(!row||!this.canManage()||!await this.confirm('删除订阅/分期档案？','有付款历史的订阅/分期不能删除，请编辑后设为“已结束”。'))return
    return this.act(()=>api.request('/fixed-expenses/'+row.id,{method:'DELETE',revision:row.revision}),()=>{this.clearForm(row.id);this.back()})
  },
  reviewConflict() {
    const row=this.data.selected
    if(!row)return
    return this.act(()=>api.request('/fixed-expenses/'+row.id),async latest=>{
      if(await this.confirm('核对最新费用',`${latest.name} · 计划 ¥${latest.amount}\n下次付款 ${latest.next_due_on||'已还清'}；已付费用 ¥${latest.paid_cost}\n当前填写保留，请核对后重新提交。`))this.setData({selected:present(latest),conflict:false,error:'已核对最新版本，请检查周期与金额后重新提交。'})
    })
  }
}))
