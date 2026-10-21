const { syncTabBar } = require('./tab-bar')
const { navigate, resetNavigation } = require('./navigation')
const presentations = {
 ledger:{title:'记账',subtitle:'日常收支，也慢慢记清楚。',art:'/assets/white-doodle/cat-book.png',message:'把每一笔，记成生活的小故事',description:'日常花费、物品相关收支，都有自己的位置。',tags:['日常收支','物品关联','每月整理'],analysis:false},
 statistics:{title:'统计',subtitle:'把记录，整理成生活的小发现。',art:'/assets/white-doodle/cat-search.png',message:'慢慢记录，也慢慢发现',description:'收支的变化、物品的陪伴，都会在这里慢慢清晰。',tags:['收支趋势','分类排行','物品分析'],analysis:true}
}
function createPreparingPage(kind){return {
 data:{...presentations[kind],artFailed:false},
 onShow(){this._visible=true;resetNavigation(this);if(getApp().requireSession())syncTabBar(this)},
 onHide(){this._visible=false;const bar=this.getTabBar?.();bar?.cancelMenu?.()},
 onUnload(){this._visible=false},
 artFailed(){this.setData({artFailed:true})},
 insights(){if(this._visible && getApp().requireSession())navigate(this,'/pages/insights/index')}
}}
module.exports={createPreparingPage}
