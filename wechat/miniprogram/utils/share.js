const TITLE='猫爪物账｜收好喜欢的小物，记清生活的花费'
function introduction(){return {title:TITLE,path:'/pages/items/index',imageUrl:'/assets/white-doodle/share-fallback.png'}}
function wrap(definition){
 const own=definition.onShareAppMessage,show=definition.onShow
 const localCompatibility=['pages/membership/index','pages/member-benefits/index','pages/rewards/index','pages/login/index']
 return require('./session-page').wrap({...definition,onShow(...args){if(typeof getApp==='function'&&getApp().globalData.localMode&&localCompatibility.includes(this.route)){wx.redirectTo({url:'/pages/local-data/index'});return}return show?.apply(this,args)},onShareAppMessage(options={}){
  if(typeof getApp==='function'&&getApp().globalData.localMode&&this.route==='pages/rewards/index')return introduction()
  const result=own?.call(this,options)
  return result||introduction()
 }})
}
module.exports={introduction,wrap}
