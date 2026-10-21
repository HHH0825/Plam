async function() {
  const app=getApp();
  if(app._purchasesQA)return {blocked:'fixture active'};
  const read=path=>new Promise(resolve=>{
    wx.cloud.callHTTPFunction({name:'palm-api',config:{env:'cloud1-example'},path,method:'get',header:{Authorization:'Bearer '+app.globalData.token},dataType:'json',responseType:'text',
      success:r=>{let b=r.data;try{if(typeof b==='string')b=JSON.parse(b)}catch(_){}resolve({path,httpStatus:r.statusCode,status:b&&b.statusCode,error:b&&b.data&&b.data.error,envelope:b&&b.palm_http})},
      fail:e=>resolve({path,failed:true,code:e.errCode})});
  });
  return {transport:'cloud_http_function',results:await Promise.all([read('/api/mp/fixed-expenses'),read('/api/mp/items')])};
}
