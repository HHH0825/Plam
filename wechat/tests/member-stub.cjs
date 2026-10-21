// Old page tests isolate their original feature; member integration has its own suite.
module.exports={wrap:d=>({...d,memberRefresh:async()=>{},data:{...d.data}}),load:async()=>null,effective:()=>({theme:'default',template:'default',sticker:''}),style:()=>''}
