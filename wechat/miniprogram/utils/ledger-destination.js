const ledger=require('./ledger')
function open(page,enable=false){
 if(page._visible===false||page._cashNavigation||!getApp().requireSession())return
 const app=getApp(),intent={token:app.globalData.token,month:ledger.today().slice(0,7)}
 page._cashNavigation=true;if(!enable)app._ledgerDestination=intent
 wx.switchTab({url:enable?'/pages/ledger/index':'/pages/statistics/index',fail(){if(app._ledgerDestination===intent)delete app._ledgerDestination;page._cashNavigation=false;wx.showToast({title:'暂时无法打开，请重试',icon:'none'})}})
}
function take(){const app=getApp(),intent=app._ledgerDestination;delete app._ledgerDestination;return intent?.token===app.globalData.token?intent:null}
module.exports={open,take}
