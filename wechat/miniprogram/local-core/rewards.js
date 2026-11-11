const R=require('./rules')
function rewards({path,method,data,settings:s,clock,today}){
 if(path==='/rewards/checkin')R.fail('本地版已移除签到功能',410)
 const day=today(),write=method!=='GET',visits=s.visits||(s.visits=[]),greetings=s.greetings||(s.greetings=[]),delivery=R.key('greeting',day)
 if(write&&!['/rewards/visit','/rewards/greeting'].includes(path))R.fail('本地版不提供兑换或邀请奖励',410)
 if(write&&data.date&&data.date!==day)R.fail('日期已变化，请重新核对')
 if(write&&path==='/rewards/visit'&&!visits.includes(day))visits.push(day)
 let show=false
 if(write&&path==='/rewards/greeting'){
  if(data.not_shown&&data.delivery_token===delivery){const at=greetings.indexOf(day);if(at>=0)greetings.splice(at,1)}
  else if(!data.not_shown&&!greetings.includes(day)){greetings.push(day);show=true}
 }
 const hour=new Date(clock()+8*3600000).getUTCHours(),period=hour<5?'late':hour<11?'morning':hour<14?'noon':hour<18?'afternoon':'evening',copy={late:['夜深啦，喵～','把今天的小心事轻轻收好，也记得休息。'],morning:['早安，喵～','新的一天，慢慢用喜欢的小物，好好记录生活。'],noon:['午间好，喵～','给自己一点放松的时间，吃好饭再继续。'],afternoon:['下午好，喵～','让小猫陪你，把生活里的小喜欢收好。'],evening:['晚上好，喵～','把今天的花费与小收获记下来吧。']}[period]
 return {date:day,balance:0,capacity:{used:0,limit:null,unlimited:true,can_add:true},shop:{items:[],enabled:false},greeting:{period,title:copy[0],message:copy[1]},show,delivery_token:show?delivery:null,local:true}
}
module.exports={rewards}
