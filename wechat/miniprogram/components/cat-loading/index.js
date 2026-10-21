Component({
 properties:{label:{type:String,value:'小猫正在整理中…'},compact:Boolean,paw:Boolean,reducedMotion:Boolean},
 data:{visible:false,ready:false,reduced:false},
 lifetimes:{attached(){this._active=true;try{this.setData({reduced:!!wx.getSystemSetting?.().reducedMotion})}catch(_){}this.reveal()},detached(){this._active=false;clearTimeout(this._delay)}},
 pageLifetimes:{show(){this._active=true;this.reveal()},hide(){this._active=false;clearTimeout(this._delay);this.setData({visible:false})}},
 methods:{reveal(){clearTimeout(this._delay);if(this.data.ready){this.setData({visible:true});return}this._delay=setTimeout(()=>{if(this._active)this.setData({visible:true,ready:true})},180)}}
})
