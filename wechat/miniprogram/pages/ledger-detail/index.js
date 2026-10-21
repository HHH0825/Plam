const api=require('../../utils/api'),ledger=require('../../utils/ledger')
const {navigate,resetNavigation}=require('../../utils/navigation')
Page(require('../../utils/member').wrap({
 data:{row:null,loading:true,busy:false,error:'',iconFailed:false},
 onLoad(options){this._id=options.id||'';this._token=getApp().globalData.token;this._alive=true},
 onShow(){this._visible=true;resetNavigation(this);if(this._token!==getApp().globalData.token){this.setData({row:null,error:'账户已切换，请重新打开账目。',loading:false});this._alive=false;return}if(getApp().requireSession())this.load()},onHide(){this._visible=false;this._seq=(this._seq||0)+1},onUnload(){this._alive=false},
 async load(){const token=this._token,seq=this._seq=(this._seq||0)+1;this.setData({loading:true,error:''});try{const row=await api.request('/ledger/entries/'+this._id);if(ledger.current(this,token)&&seq===this._seq)this.setData({row:{...ledger.row(row),refunds:row.refunds.map(ledger.row)},iconFailed:false})}catch(e){if(ledger.current(this,token)&&seq===this._seq)this.setData({error:e.message})}finally{if(ledger.current(this,token)&&seq===this._seq)this.setData({loading:false})}},
 edit(){if(this.data.row?.editable&&this.data.row.state==='active')navigate(this,'/pages/ledger-record/index?id='+this._id)},refund(){if(this.data.row?.kind==='expense'&&this.data.row.state==='active')navigate(this,'/pages/ledger-record/index?refund='+this._id)},
 parent(){const id=this.data.row?.parent_id||this.data.row?.linked_entry_id;if(id)navigate(this,'/pages/ledger-detail/index?id='+id)},openRefund(e){navigate(this,'/pages/ledger-detail/index?id='+e.currentTarget.dataset.id)},
 source(){const r=this.data.row;if(!r)return;if(r.source==='purchase'){if(r.item_available)navigate(this,'/pages/editor/index?id='+r.item_id);else wx.showModal({title:'原物品暂不可编辑',content:'请先从回收站恢复物品。真实账目仍然保留。',showCancel:false})}else if(['maintenance','disposal'].includes(r.source)){if(r.item_available)navigate(this,'/pages/record/index?itemId='+r.item_id+'&kind='+r.source+'&id='+r.source_id);else wx.showModal({title:'原物品暂不可编辑',content:'请先恢复物品档案后再修改原记录。',showCancel:false})}else navigate(this,'/pages/fixed-expenses/index?id='+r.expense_id)},
 item(){if(this.data.row?.item_available)navigate(this,'/pages/item/index?id='+this.data.row.item_id)},
 async void(){
  const row=this.data.row,linked=['subscription','installment'].includes(row?.source)&&row?.deletable===true
  if(this.data.busy||this._confirming||row?.state!=='active'||(!row.editable&&!linked)||!ledger.current(this))return
  const token=this._token,revision=row.revision
  if(linked&&row.refunds?.some(r=>r.state==='active')){this.setData({error:'这笔支出还有有效退款，请先处理退款，再删除原支出。'});return}
  this._confirming=true
  const c=await new Promise(resolve=>wx.showModal({title:linked?'删除这笔账目？':'作废这笔账目？',content:linked?'对应的这次付款会一并撤销，费用与还款进度重新计算。订阅／分期计划和其他付款保留，不会取消真实订阅。':'作废后不再计入收支统计，变更记录仍保留。',confirmText:linked?'确认删除':'确认作废',success:r=>resolve(r.confirm),fail:()=>resolve(false)}))
  this._confirming=false
  if(!c||!ledger.current(this,token))return
  this.setData({busy:true,error:''})
  try{await api.request('/ledger/entries/'+this._id,{method:'DELETE',revision});if(ledger.current(this,token))await this.load()}
  catch(e){if(ledger.current(this,token))this.setData({error:e.message})}
  finally{if(ledger.current(this,token))this.setData({busy:false})}
 },artFailed(){this.setData({iconFailed:true})}
}))
