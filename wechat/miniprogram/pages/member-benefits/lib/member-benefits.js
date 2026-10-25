const freeFeatures=['基础20件物品，可用喵粒永久扩容','日常收支记账','基础统计与收支日历','订阅／分期记录','使用、维修与处置记录','愿望清单与月度小报','页面配色与小报模板','多账本与流水整理','月度与分类预算']
const memberFeatures=['免小程序内广告','无限容量（会员有效期内）']
const introduction=['把每一件物品、每一笔花销安稳收好，免费版就能陪你完成。','若猫爪让生活多了一点条理，而你也愿意支持这份小小的创作，可以选择会员。会员提供免广告和有效期内无限物品容量，也让它有机会慢慢长大。','按自己的需要选择。愿意常来记录，就已经很好。']
function service(status){
 if(!status?.supported)return {catalog:'当前设备售价暂未获取，请返回会员页核对。',terms:terms()}
 const price=p=>(p.price_cents/100).toFixed(2),unit=p=>p.months===1?'月':'季'
 const catalog=status.payment_test?'当前为小额真实支付测试：'+(status.plans||[]).filter(p=>p.id==='month'&&p.months===1).map(p=>p.name+'¥'+price(p)+'／'+unit(p)).join('，')+'。确认付款会真实扣款，并按所选测试套餐发放会员。':(status.plans||[]).filter(p=>p.id==='month'&&p.months===1).map(p=>p.name+'¥'+price(p)+'／'+unit(p)).join('，')+'。'
 return {catalog,terms:terms()}
}
function terms(){return [
 '仅提供月会员，一个自然月，一次购买，到期手动续费。有效期内不可重复购买，赠送会员同样适用。具体售价以当前设备会员页目录与微信付款面板为准。',
 '付款后由服务器核实再开通；结果待确认时，请核对原订单，不要重复付款。购买记录和订单核对在会员页保留。',
 '会员提供对应期限的付费功能服务。多账本、流水整理和预算继续免费，会员到期不会删除已有记录。'
 ]}
module.exports={freeFeatures,memberFeatures,introduction,service}
