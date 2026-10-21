const { money } = require('./report-design')
function increment(digits) {
  const chars=digits.split('');let carry=1
  for(let i=chars.length-1;i>=0&&carry;i--){const digit=chars[i].charCodeAt(0)-48+carry;chars[i]=String(digit%10);carry=digit===10?1:0}
  return (carry?'1':'')+chars.join('')
}
function roundUnit(cents, power) {
  const padded=cents.padStart(power+1,'0'),split=padded.length-power
  let hundredths=padded.slice(0,split)
  if(padded[split]>='5')hundredths=increment(hundredths)
  hundredths=hundredths.padStart(3,'0')
  return hundredths.slice(0,-2)+'.'+hundredths.slice(-2)
}
// Decimal strings only: scaling and rounding never lose the original cents.
function compactMoney(value) {
  if(typeof value!=='string'||!/^\d+\.\d{2}$/.test(value))return{display:'—',compact:false}
  const [whole,fraction]=value.split('.'),integer=whole.replace(/^0+(?=\d)/,''),cents=integer+fraction
  if(integer.length<5)return{display:'¥'+money(integer+'.'+fraction),compact:false}
  let unit=integer.length>=9?'亿':'万',rounded=roundUnit(cents,unit==='亿'?8:4)
  if(unit==='万'&&rounded==='10000.00'){unit='亿';rounded='1.00'}
  return{display:'约 ¥'+rounded+unit,compact:true}
}
module.exports={compactMoney,roundUnit}
