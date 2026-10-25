const TITLE='猫爪物账｜收好喜欢的小物，记清生活的花费'
function introduction(){return {title:TITLE,path:'/pages/items/index',imageUrl:'/assets/white-doodle/share-fallback.png'}}
function wrap(definition){
 const own=definition.onShareAppMessage
 return require('./session-page').wrap({...definition,onShareAppMessage(options={}){
  const result=own?.call(this,options)
  return result||introduction()
 }})
}
module.exports={introduction,wrap}
