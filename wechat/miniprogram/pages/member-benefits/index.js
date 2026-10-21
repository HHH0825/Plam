const member=require('../../utils/member'),content=require('./lib/member-benefits')
const {resetNavigation}=require('../../utils/navigation')
Page(member.wrap({
 data:{introduction:content.introduction,freeFeatures:content.freeFeatures,memberFeatures:content.memberFeatures,serviceExpanded:false,catalogLoading:true,catalogError:'',service:content.service(null)},
 onShow(){this._visible=true;this._returning=false;resetNavigation(this);if(getApp().requireSession())this.load()},
 onHide(){this._visible=false;this._seq=(this._seq||0)+1},
 onUnload(){this._visible=false;this._seq=(this._seq||0)+1},
 onMembershipRefreshSuccess(r){this.setData({service:content.service(r),catalogLoading:false,catalogError:''})},
 async load(){const token=getApp().globalData.token,seq=this._seq=(this._seq||0)+1;this.setData({catalogLoading:true,catalogError:'',service:content.service(null)});try{const r=await member.load(true);if(!this._visible||token!==getApp().globalData.token||seq!==this._seq)return;this.setData({service:content.service(r)})}catch(e){if(this._visible&&token===getApp().globalData.token&&seq===this._seq)this.setData({catalogError:'当前设备售价读取失败，请返回会员页核对。'})}finally{if(this._visible&&token===getApp().globalData.token&&seq===this._seq)this.setData({catalogLoading:false})}},
 toggleService(){this.setData({serviceExpanded:!this.data.serviceExpanded})},
 returnMembership(){if(!this._visible||this._returning||!getApp().requireSession())return;this._returning=true;const pages=getCurrentPages(),previous=pages[pages.length-2],fail=()=>{this._returning=false;wx.showToast({title:'暂时无法返回，请重试',icon:'none'})};if(previous?.route==='pages/membership/index')wx.navigateBack({delta:1,fail});else wx.redirectTo({url:'/pages/membership/index',fail})}
}))
