const api = require('./api')
const {navigate} = require('./navigation')
const {platform} = require('./payment-platform')
const palettes = {default:['#FFE15A','#FFF9DE'],sage:['#DDEADD','#F1F7EF'],pink:['#F7CDDD','#FFF2F6'],blue:['#CDE7F6','#F0F8FD']}
let cache=null,scope='',pending=null,stamp=0,epoch=0,offset=0,clockAnchor=null,appearanceSnapshot=null,appearanceOwner=''
function monotonic(){try{const p=typeof wx!=='undefined'&&wx.getPerformance?.();if(p&&typeof p.now==='function')return p.now();if(typeof performance!=='undefined'&&typeof performance.now==='function')return performance.now()}catch(_){}return Date.now()}
function now(){return clockAnchor?clockAnchor.server+Math.max(0,monotonic()-clockAnchor.tick):Date.now()+offset}
function reset(keepAppearance=false){cache=null;scope='';pending=null;stamp=0;offset=0;clockAnchor=null;epoch++;if(!keepAppearance){appearanceSnapshot=null;appearanceOwner=''}}
function current(){return typeof getApp==='function'&&getApp().globalData.token||''}
function owner(){return current()+'|'+platform()}
function rememberAppearance(value,fromMembership=false){if(!value?.effective||!palettes[value.effective.theme])throw Error('外观资料暂不可用');if(!fromMembership){epoch++;pending=null;stamp=0}appearanceSnapshot={theme:value.effective.theme,template:value.effective.template};appearanceOwner=owner();if(cache&&scope===appearanceOwner)cache={...cache,appearance:value}}
function effective(){return appearanceSnapshot&&appearanceOwner===owner()?appearanceSnapshot:{theme:'default',template:'default'}}
function style(){const p=palettes[effective().theme]||palettes.default;return `--primary:${p[0]};--yellow:${p[0]};--tape:${p[0]};--member-accent:${p[0]};--member-soft:${p[1]};--glass-pressed:${p[1]};`+require('./motion').style()}
function load(force=false){
 const token=current();if(!token)return Promise.resolve(null)
 const identity=owner(),terminal=platform()
 if(scope!==identity)reset(appearanceOwner===identity);scope=identity
 if(!force&&cache&&Date.now()-stamp<30000&&(!cache.active||cache.expires_at*1000>now()))return Promise.resolve(cache)
 if(pending)return pending
 const version=epoch
 const task=api.request('/membership'+(terminal?'?platform='+terminal:'')).then(r=>{
  if(identity!==owner()||version!==epoch)throw Error('账户或终端已切换')
  if(!r||typeof r.active!=='boolean'||!Array.isArray(r.entitlements)||!Array.isArray(r.plans)||!r.appearance?.effective)throw Error('会员资料暂不可用，请重试')
  rememberAppearance(r.appearance,true);offset=typeof r.server_time==='number'?r.server_time*1000-Date.now():0;clockAnchor=typeof r.server_time==='number'?{server:r.server_time*1000,tick:monotonic()}:null;cache={...r,supported:true};stamp=Date.now();return cache
 }).catch(e=>{
  if(identity!==owner()||version!==epoch)throw e
  if(e.status===404){cache={supported:false,active:false,appearance:{effective:{theme:'default'}}};stamp=Date.now();return cache}throw e
 }).finally(()=>{if(pending===task)pending=null})
 pending=task;return task
}
async function ensure(page){
 const token=current();try{const r=await load(true);if(token!==current()||!page._memberVisible||!r)return false;if(!r.supported){wx.showToast({title:'会员功能暂未开放',icon:'none'});return false}if(r.active)return true;navigate(page,'/pages/membership/index');return false}
 catch(e){if(page._memberVisible)wx.showToast({title:e.message||'会员状态读取失败，请重试',icon:'none'});return false}
}
function wrap(definition){
 const original={...definition}
 return require('./share').wrap(require('./motion').wrap({...definition,data:{memberSupported:false,memberActive:false,memberError:'',memberThemeStyle:'',memberThemeClass:'',memberAccent:palettes.default[0],memberBooks:[],memberBookIndex:0,memberBookId:'all',budgetCard:require('./budget-card').loading(),accountToolsExpanded:false,accountToolsHint:'正在读取账本…',memberBooksState:'loading',accountToolsFiltered:false,...definition.data},
  onShow(...args){this._memberVisible=true;require('./tool-fold').restore(this,getApp(),wx);if(this._memberAccount&&this._memberAccount!==current()){this._memberSignature='';this._memberBookId='all';this.setData({memberThemeStyle:'',memberThemeClass:'',memberAccent:palettes.default[0],memberBooks:[],memberBookId:'all',memberBookIndex:0,memberActive:false,memberSupported:false,memberError:'',memberBudget:null,budgetCard:require('./budget-card').loading(),accountToolsHint:'正在读取账本…',memberBooksState:'loading',accountToolsFiltered:false})}const result=original.onShow?.apply(this,args);if(this.route)this.memberRefresh(this.route==='pages/me/index');return result},
  onHide(...args){this._memberVisible=false;clearTimeout(this._memberTimer);return original.onHide?.apply(this,args)},
  onUnload(...args){this._memberVisible=false;this._memberEpoch=(this._memberEpoch||0)+1;clearTimeout(this._memberTimer);return original.onUnload?.apply(this,args)},
  async memberRefresh(force=false){
   require('./tool-fold').restore(this,getApp(),wx);const token=current(),seq=this._memberEpoch=(this._memberEpoch||0)+1;if(!token)return
   if(this._memberAccount&&this._memberAccount!==token){this._memberSignature='';this._memberBookId='all';this.setData({memberThemeStyle:'',memberThemeClass:'',memberAccent:palettes.default[0],memberBooks:[],memberBookId:'all',memberBookIndex:0,memberActive:false,memberSupported:false,memberError:'',memberBudget:null,budgetCard:require('./budget-card').loading(),accountToolsHint:'正在读取账本…',memberBooksState:'loading',accountToolsFiltered:false})}this._memberAccount=token
   if(!this.data.memberBooks.length)require('./tool-fold').hint(this,'loading');this.onMembershipRefreshStart?.()
   if(cache&&scope===owner()&&cache.active&&cache.expires_at*1000<=now()){this.setData({memberActive:false,memberThemeStyle:style(),memberAccent:(palettes[effective().theme]||palettes.default)[0],memberThemeClass:effective().theme==='default'?'':'member-custom-theme'});this.getTabBar?.()?.setData?.({memberThemeStyle:style(),memberAccent:(palettes[effective().theme]||palettes.default)[0],memberThemeClass:effective().theme==='default'?'':'member-custom-theme'});this.onMembershipStateChange?.({...cache,active:false,status:'expired'});this.onMemberAppearanceChange?.()}
   const valid=()=>this._memberVisible&&token===current()&&seq===this._memberEpoch
   try{const r=await load(force);if(!valid()||!r)return;this.setData({memberSupported:r.supported,memberActive:r.active,memberThemeStyle:style(),memberAccent:(palettes[effective().theme]||palettes.default)[0],memberThemeClass:effective().theme==='default'?'':'member-custom-theme',memberError:''});this.onMembershipRefreshSuccess?.(r);this.getTabBar?.()?.setData?.({memberThemeStyle:style(),memberAccent:(palettes[effective().theme]||palettes.default)[0],memberThemeClass:effective().theme==='default'?'':'member-custom-theme'});const signature=JSON.stringify([r.status,r.expires_at,effective()]);if(this._memberSignature!==signature){this._memberSignature=signature;this.onMembershipStateChange?.(r);this.onMemberAppearanceChange?.()}
    clearTimeout(this._memberTimer);const deadlines=[r.active?r.expires_at*1000:null].filter(Number.isFinite);if(deadlines.length){this._memberTimer=setTimeout(()=>{if(valid())this.memberRefresh(true)},Math.max(1000,Math.min(2147483647,Math.min(...deadlines)-now()+100)));this._memberTimer?.unref?.()}
    if(!r.supported)require('./tool-fold').hint(this,'unsupported');
    if(r.supported&&['pages/ledger/index','pages/statistics/index','pages/ledger-record/index'].includes(this.route)&&!(this.route==='pages/statistics/index'&&this.data.view==='items')){
     const b=await (force?api.request('/member/books'):require('./display-cache').read('/member/books'));if(!valid())return;const list=[{id:'all',name:'全部账本'},...b.books],index=list.findIndex(x=>x.id===this.data.memberBookId);if(index<0){this._memberBookId='all';this.setData({memberBookId:'all'})}this.setData({memberBooks:list,memberBookIndex:Math.max(0,index)});require('./tool-fold').hint(this,'ready');if(index<0&&this.data.view!=='items')this.load?.()
     if(this.route==='pages/ledger/index'){const month=this.data.month,book=this.data.memberBookId;if(!this.data.memberBudget)this.setData({budgetCard:require('./budget-card').loading()});try{const path='/member/budget?month='+month+'&book_id='+book;const budget=await (force?api.request(path):require('./display-cache').read(path));if(valid()&&month===this.data.month&&book===this.data.memberBookId)this.setData({memberBudget:budget,budgetCard:require('./budget-card').present(budget)})}catch(e){if(valid()&&month===this.data.month&&book===this.data.memberBookId){this.setData({memberBudget:null,budgetCard:require('./budget-card').failed()});if(this.route==='pages/ledger/index')this.setData({accountToolsHint:(this.data.memberBooks.find(b=>b.id===book)?.name||'当前账本')+' · 预算读取失败'})}}}
    }
   }catch(e){if(valid()){require('./tool-fold').hint(this,'error');this.setData({memberError:'会员工具暂不可用，基础功能可继续使用。',memberBudget:null,budgetCard:require('./budget-card').failed()});this.onMembershipRefreshError?.()}}
  },
  toggleAccountTools(){require('./tool-fold').toggle(this,getApp(),wx)},
  memberOpen(){navigate(this,'/pages/membership/index')},
  async memberTool(e){const mode=e.currentTarget.dataset.mode||'books';if(!['books','budgets','appearance'].includes(mode))return;if(mode==='appearance'){if(getApp().requireSession())navigate(this,'/pages/member-tools/index?mode=appearance');return}if(this.data.memberSupported)navigate(this,'/pages/member-tools/index?mode='+mode+(mode==='budgets'?'&month='+this.data.month+'&book_id='+this.data.memberBookId:''))},
  openBudgetCard(){if(this.data.budgetCard.kind==='error')return this.memberRefresh(true);if(this.data.budgetCard.kind==='loading')return;return this.memberTool({currentTarget:{dataset:{mode:'budgets'}}})},
  memberBookChange(e){const index=Number(e.detail.value),b=this.data.memberBooks[index];if(!b)return;this._memberBookId=b.id;this.setData({memberBookIndex:index,memberBookId:b.id,memberBudget:null,budgetCard:require('./budget-card').loading()});require('./tool-fold').hint(this,'loading');this.load?.();this.memberRefresh()},
  memberEntryTools(){navigate(this,'/pages/member-tools/index?mode=books&entry='+this.data.row.id)},
 },{token:current}))
}
function decorateLayout(layout,draft){
 const appearance=draft||effective();if(!appearance||appearance.template==='default'&&appearance.theme==='default')return layout
 const p=palettes[appearance.theme]||palettes.default
 const primary=new Set(['#FFE15A','#F2D778','#EBD391']),soft=new Set(['#FFF3CB','#FFF3CF','#FFF9DA','#FFF9DE'])
 const commands=layout.commands.map(c=>({...c,color:['rect','ellipse','panel','line'].includes(c.kind)?primary.has(c.color)?p[0]:soft.has(c.color)?p[1]:c.color:c.color}))
 if(appearance.theme!=='default'&&appearance.template==='default')commands.push({kind:'rect',x:24,y:26,width:(layout.width||720)-48,height:8,color:p[0]})
 return {...layout,commands}
}
module.exports={load,reset,rememberAppearance,effective,style,ensure,wrap,decorateLayout,palettes,now}
