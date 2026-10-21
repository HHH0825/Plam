function invitation(code){
 return typeof code==='string'&&/^[a-f0-9]{40}$/.test(code)
  ? {title:'和小猫一起，收好生活的小喜欢',path:'/pages/items/index?invite='+encodeURIComponent(code),imageUrl:'/pages/rewards/assets/invitation.png'}
  : require('../../../utils/share').introduction()
}
module.exports={invitation}
