const api=require('../../utils/api'),rewards=require('../../utils/rewards')
const {resetNavigation,navigate}=require('../../utils/navigation')
Page(require('../../utils/member').wrap({
 data:{loading:true,error:'',busy:false,model:null,days:[],inviteCode:'',inviteError:'',exchangeOpen:false,exchange:null,capacityPercent:0,historyOpen:false,historyLoading:false,historyError:'',transactions:[],growthTab:'visits',growthRows:[],claiming:'',claimedFlash:'',growthOpen:false,growthLoading:false,growthError:'',growthReady:false,growthClaimed:0,growthPending:0},
 onLoad(){this._seq=0},
 onShow(){this._visible=true;this.setData({growthTab:'visits'});resetNavigation(this);if(getApp().requireSession())this.load()},
 onHide(){this._visible=false;this._seq++;this.closeGrowth();clearTimeout(this._flashTimer);this.setData({exchangeOpen:false,exchange:null,busy:false,historyOpen:false,transactions:[],claiming:'',claimedFlash:''})},
 onUnload(){this._visible=false;this._seq++;this._growthRead=(this._growthRead||0)+1;clearTimeout(this._flashTimer)},
 current(token,seq){return this._visible&&token===getApp().globalData.token&&(seq===undefined||seq===this._seq)},
 present(model){this.setData({model,days:model.checkin.days.map((d,i)=>({...d,label:'第'+(i+1)+'天'})),capacityPercent:Math.min(100,Math.max(0,100*model.capacity.used/model.capacity.free_limit)),inviteCode:model.invitation.code||this.data.inviteCode});this.showGrowth()},
 showGrowth(){const category=this.data.growthTab,all=this.data.model?.achievements;this.setData({growthReady:Array.isArray(all),growthClaimed:(all||[]).filter(r=>r.claimed).length,growthPending:(all||[]).filter(r=>r.achieved&&!r.claimed).length,growthRows:(all||[]).filter(r=>r.category===category).map(r=>({...r,unit:category==='visits'?'天':category==='items'?'件':'笔',percent:Math.min(100,100*r.progress/r.target)}))})},
 changeGrowth(e){const tab=e.currentTarget.dataset.tab;if(['visits','items','ledger'].includes(tab)&&tab!==this.data.growthTab){require('../../utils/motion').change(this,{growthTab:tab});this.showGrowth()}},
 async openGrowth(){
  const feedback=this.selectComponent?.('#cat-feedback')?.data
  if(this.data.growthOpen||this.data.exchangeOpen||this.data.historyOpen||feedback?.greetingOpen||feedback?.capacityOpen||(this.data.busy&&!this.data.claiming))return
  this.setData({growthOpen:true,growthError:''});if(!this.data.claiming)await this.refreshGrowth()
 },
 closeGrowth(){require('../../utils/motion').leave(this,'growthOpen',()=>{this._growthRead=(this._growthRead||0)+1;clearTimeout(this._flashTimer);this.setData({growthOpen:false,growthLoading:false,growthError:'',claimedFlash:''})})},
 async refreshGrowth(){
  if(!this.data.growthOpen||this.data.busy||this.data.loading)return
  const token=getApp().globalData.token,seq=this._seq,read=this._growthRead=(this._growthRead||0)+1
  const valid=()=>this.current(token,seq)&&this.data.growthOpen&&this._growthRead===read
  this.setData({growthLoading:true,growthError:''})
  try{const r=await rewards.load();if(!valid())return;if(!Array.isArray(r.achievements))throw Error('收藏册暂未准备好，请更新服务后重试');this.present(r)}
  catch(e){if(valid())this.setData({growthError:e.message})}
  finally{if(valid())this.setData({growthLoading:false})}
 },
 async claimGrowth(e){
  const id=e.currentTarget.dataset.id,row=this.data.growthRows.find(r=>r.id===id);if(!this.data.growthOpen||this.data.growthLoading||this.data.busy||!row||row.claimed||!row.achieved)return
  const token=getApp().globalData.token,seq=this._seq;this._growthRead=(this._growthRead||0)+1;this.setData({busy:true,claiming:id,growthError:'',error:''})
  try{const r=await rewards.mutate('achievements/'+id+'/claim',{});if(!this.current(token,seq))return;this.present(r);if(this.data.growthOpen){this.setData({claimedFlash:id});clearTimeout(this._flashTimer);this._flashTimer=setTimeout(()=>{if(this.current(token,seq))this.setData({claimedFlash:''})},650)}wx.showToast({title:r.already_claimed?'这份小收获已经领过啦':'收到'+r.awarded+'喵粒',icon:'none'})}
  catch(e){if(this.current(token,seq))this.setData(this.data.growthOpen?{growthError:e.message}:{error:'领取结果未确认，请重新打开收藏册核对：'+e.message})}
  finally{if(this.current(token,seq))this.setData({busy:false,claiming:''})}
 },
 async load(){
  const token=getApp().globalData.token;if(this.data.busy&&this._owner===token)return
  const seq=++this._seq
  if(this._owner!==token){this._owner=token;this.closeGrowth();this.setData({model:null,days:[],inviteCode:'',inviteError:'',growthTab:'visits',growthRows:[],growthReady:false,growthClaimed:0,growthPending:0,claiming:'',busy:false})}
  this.setData({loading:true,error:''})
  try{let value=await rewards.load();if(rewards.visitIfNeeded)value=await rewards.visitIfNeeded(value);if(!this.current(token,seq))return;this.present(value);this.prepareInvite(token,seq)}
  catch(e){if(this.current(token,seq))this.setData({error:e.message})}
  finally{if(this.current(token,seq))this.setData({loading:false})}
 },
 async prepareInvite(token=getApp().globalData.token,seq=this._seq){
  if(this.data.inviteCode)return
  try{const r=await api.request('/rewards/invitation',{method:'POST',data:{}});if(this.current(token,seq))this.setData({inviteCode:r.code,inviteError:''})}
  catch(_){if(this.current(token,seq))this.setData({inviteError:'邀请入口暂未准备好，点击重试'})}
 },
 retryInvite(){return this.prepareInvite()},
 async checkin(){
  const m=this.data.model;if(this.data.busy||!m||m.checkin.today_claimed)return
  const token=getApp().globalData.token;this.setData({busy:true,error:''})
  try{const r=await rewards.mutate('checkin',{date:m.date});if(!this.current(token))return;this.present(r);wx.showToast({title:r.already_claimed?'今天已经签到啦':`领到${r.awarded ?? m.checkin.today_reward}喵粒`,icon:'none'})}
  catch(e){if(this.current(token))this.setData({error:e.message})}
  finally{if(this.current(token))this.setData({busy:false})}
 },
 async openExchange(){
  if(this.data.busy||this.data.growthOpen||this.data.historyOpen)return
  const token=getApp().globalData.token;this.setData({busy:true,error:''})
  try{const m=await rewards.load();if(!this.current(token))return;this.present(m);if(m.shop.next_price===null)return;this.setData({exchangeOpen:true,exchange:{extra:m.capacity.extra,price:m.shop.next_price,balance:m.balance,before:m.capacity.free_limit,after:m.capacity.free_limit+1,remaining:m.balance-m.shop.next_price}})}
  catch(e){if(this.current(token))this.setData({error:e.message})}
  finally{if(this.current(token))this.setData({busy:false})}
 },
 closeExchange(){if(!this.data.busy)require('../../utils/motion').leave(this,'exchangeOpen',()=>this.setData({exchangeOpen:false,exchange:null}))},
 keepOpen(){},
 async redeem(){
  const x=this.data.exchange;if(this.data.busy||!x||x.balance<x.price)return
  const token=getApp().globalData.token;this.setData({busy:true,error:''})
  try{const m=await rewards.mutate('redeem',{expected_extra:x.extra,expected_price:x.price});if(!this.current(token))return;this.present(m);this.setData({exchangeOpen:false,exchange:null});wx.showToast({title:'小窝多了一格空间',icon:'none'})}
  catch(e){if(this.current(token))this.setData({error:e.message,exchangeOpen:false,exchange:null})}
  finally{if(this.current(token))this.setData({busy:false})}
 },
 advertisement(){wx.showToast({title:'广告暂未接通，现在还不能观看哦',icon:'none'})},
 async history(){
  if(this.data.busy||this.data.exchangeOpen||this.data.growthOpen)return
  const token=getApp().globalData.token;this.setData({historyOpen:true,historyLoading:true,historyError:'',transactions:[]})
  try{const r=await api.request('/rewards/transactions');if(this.current(token)&&this.data.historyOpen)this.setData({transactions:r.transactions.map(t=>({...t,date:new Date(t.at*1000+8*3600000).toISOString().slice(0,10),amountText:(t.amount>0?'+':'')+t.amount}))})}
  catch(e){if(this.current(token)&&this.data.historyOpen)this.setData({historyError:e.message})}
  finally{if(this.current(token))this.setData({historyLoading:false})}
 },
 closeHistory(){require('../../utils/motion').leave(this,'historyOpen',()=>this.setData({historyOpen:false,transactions:[],historyError:''}))},
 openMembership(){navigate(this,'/pages/membership/index')},
 onShareAppMessage(){return require('./lib/share').invitation(this._owner===getApp().globalData.token?this.data.inviteCode:'')},
 onPullDownRefresh(){(this.data.growthOpen?this.refreshGrowth():this.load()).finally(()=>wx.stopPullDownRefresh())}
}))
