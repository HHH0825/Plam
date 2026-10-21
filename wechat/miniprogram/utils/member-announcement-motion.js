// Coordinates are measured in the viewport so the letter returns to the real icon.
const DURATION=560
function sameOwner(page,state){return state.token===getApp().globalData.token&&state.key===page._announcementKey}
function cancel(page){
 const state=page._noticeMotion
 page._noticeMotion=null
 if(state){clearTimeout(state.timer);if(sameOwner(page,state))state.done()}
 clearTimeout(page._noticePulse)
 page.setData({announcementBusy:false,announcementClosing:false,announcementFlightStyle:'',announcementPulse:false,announcementFading:false})
}
function close(page,done,options={}){
 if(!page.data.announcementOpen||page._noticeMotion)return
 clearTimeout(page._noticePulse)
 const state={token:getApp().globalData.token,key:page._announcementKey,done}
 page._noticeMotion=state
 page.setData({announcementBusy:true,announcementPulse:false})
 const valid=()=>page._noticeMotion===state&&sameOwner(page,state)&&page._visible!==false&&!page.data.announcementFading
 function finish(pulse=false){
  if(page._noticeMotion!==state)return
  clearTimeout(state.timer);page._noticeMotion=null
  if(!sameOwner(page,state))return
  done()
  page.setData({announcementBusy:false,announcementClosing:false,announcementFlightStyle:'',announcementPulse:pulse&&page._visible!==false,announcementFading:false})
  if(pulse)page._noticePulse=setTimeout(()=>{if(sameOwner(page,state)&&page._visible!==false)page.setData({announcementPulse:false})},360)
 }
 function fallback(){if(!options.fadeFallback){finish();return}if(!valid())return;clearTimeout(state.timer);page.setData({announcementClosing:true,announcementFading:true,announcementFlightStyle:''});state.timer=setTimeout(()=>finish(),120)}
 if(options.reducedMotion){fallback();return}
 if(typeof wx.createSelectorQuery!=='function'){fallback();return}
 // A missing query callback must never trap the user in the modal.
 state.timer=setTimeout(()=>fallback(),200)
 try{
  wx.createSelectorQuery().in(page).select('.member-announcement-window').boundingClientRect()
   .select('.member-announcement-icon').boundingClientRect().exec(rects=>{
    if(!valid())return
    clearTimeout(state.timer)
    const [panel,icon]=rects||[]
    let height=Infinity
    try{height=wx.getWindowInfo?.().windowHeight||Infinity}catch(_){}
    const good=r=>r&&[r.left,r.top,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0
    if(!good(panel)||!good(icon)||icon.top<0||icon.top+icon.height>height){fallback();return}
    const x=panel.left+panel.width/2,y=panel.top+panel.height/2
    const dx=icon.left+icon.width/2-x,dy=icon.top+icon.height/2-y
    const style=`left:${x-36}px;top:${y-36}px;--notice-dx:${dx}px;--notice-dy:${dy}px;--notice-mid-x:${dx*.58}px;--notice-mid-y:${dy*.35-24}px;`
    page.setData({announcementClosing:true,announcementFlightStyle:style})
    state.timer=setTimeout(()=>finish(true),DURATION)
   })
 }catch(_){fallback()}
}
module.exports={close,cancel}
