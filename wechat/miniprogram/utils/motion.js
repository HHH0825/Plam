// Finite visual feedback only: no animation frame loops and no delayed actions.
let lastTab='',tabOwner=''
function reduced(){try{return !!wx.getSystemSetting?.().reducedMotion}catch(_){return false}}
function style(){return reduced()?'--motion-enter:80ms;--motion-select:80ms;--motion-shift:0px;--motion-pop:motion-still;--motion-press:1;':''}
function tab(route){const token=getApp().globalData.token;if(token!==tabOwner){tabOwner=token;lastTab=''}const changed=!!lastTab&&lastTab!==route;lastTab=route;return changed}
function change(page,patch,done){page._motionPhase=!page._motionPhase;page.setData({...patch,motionPanelClass:page._motionPhase?'motion-panel-a':'motion-panel-b'},done)}
function clean(page,accountChange=false){
 const patch={}
 if(accountChange)for(const flag of ['filterOpen','amountDialog','bookSheetOpen','budgetSheetOpen','growthOpen','exchangeOpen','historyOpen'])if(page.data[flag])patch[flag]=false
 for(const row of Object.values(page._motionJobs||{})){clearTimeout(row.timer);if(row.flag)patch[row.flag]=row.target===true}
 page._motionJobs={}
 if(page.data.motionPanelClass)patch.motionPanelClass=''
 if(page.data.motionClosing)patch.motionClosing=''
 if(Object.keys(page.data.motionFolds||{}).length)patch.motionFolds={}
 if(Object.keys(patch).length)page.setData(patch)
}
function leave(page,flag,done){
 if(!page.data[flag]||page._motionInactive||typeof wx==='undefined'||!wx.createSelectorQuery){done();return}
 const jobs=page._motionJobs||(page._motionJobs={});if(jobs[flag])return
 const row={flag,token:getApp().globalData.token};jobs[flag]=row
 page.setData({motionClosing:flag})
 row.timer=setTimeout(()=>{if(jobs[flag]!==row)return;delete jobs[flag];page.setData({motionClosing:''});if(!page._motionInactive&&row.token===getApp().globalData.token)done()},reduced()?80:160)
}
function fold(page,flag,selector){
 const jobs=page._motionJobs||(page._motionJobs={}),old=jobs[flag],target=old?!old.target:!page.data[flag]
 if(old)clearTimeout(old.timer)
 if(page._motionInactive||typeof wx==='undefined'||!wx.createSelectorQuery){delete jobs[flag];page.setData({[flag]:target});return target}
 const row={flag,target,token:getApp().globalData.token};jobs[flag]=row
 const valid=()=>jobs[flag]===row&&!page._motionInactive&&row.token===getApp().globalData.token
 const done=()=>{if(!valid())return;delete jobs[flag];page.setData({[flag]:target,motionFolds:{...page.data.motionFolds,[flag]:''}})}
 const set=value=>page.setData({motionFolds:{...page.data.motionFolds,[flag]:value}})
 // Measure one inner region, then let the native style transition its height.
 const measure=()=>{if(!valid())return;try{wx.createSelectorQuery().in(page).select(selector).boundingClientRect().select('.motion-fold').boundingClientRect().exec(r=>{
  if(!valid())return;const height=r?.[0]?.height
  if(!height){done();return}
  set('height:'+(old?(r[1]?.height||0):target?0:height)+'px;overflow:hidden;')
  const next=()=>{if(valid())set('height:'+(target?height:0)+'px;overflow:hidden;')}
  wx.nextTick?wx.nextTick(next):next()
  clearTimeout(row.timer);row.timer=setTimeout(done,reduced()?90:210)
 })}catch(_){done()}}
 row.timer=setTimeout(done,350)
 if(target)page.setData({[flag]:true,...(!old?{motionFolds:{...page.data.motionFolds,[flag]:'height:0;overflow:hidden;'}}:{})},measure);else measure()
 return target
}
function wrap(definition,context={}){
 const original={...definition}
 return {...definition,data:{motionPanelClass:'',motionClosing:'',motionFolds:{},...definition.data},
  onShow(...args){this._motionInactive=false;const token=context.token?context.token():getApp().globalData.token;if(this._motionOwner!==token){clean(this,true);this._motionOwner=token}return original.onShow?.apply(this,args)},
  onHide(...args){this._motionInactive=true;const r=original.onHide?.apply(this,args);clean(this);return r},
  onUnload(...args){this._motionInactive=true;const r=original.onUnload?.apply(this,args);clean(this);return r}}
}
module.exports={reduced,style,tab,change,leave,fold,clean,wrap}
