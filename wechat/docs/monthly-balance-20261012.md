# 月度净支出／净回收展示

## 本地实现

- 小小发现月报预览、完整月报、导出长图及分享封面共用 `presentMonthly().balance`。正值为“本月净支出”，负值为“本月净回收”，金额去除符号、保留完整整数与两位小数；零值和负零统一“本月收支持平 ¥0.00”。
- 无相关记录时预览为“本月暂无收支”，完整小报保留“这一页，暂时留白。”空状态。仅分期本金仍属于有记录的月份，净额为零时显示持平，并说明本金另列。
- 汇总保持淡黄背景、深灰文字，使用名称说明资金方向。对应说明为“本月支出超过处置回收”“本月处置回收超过支出”“本月支出与处置回收相同”。
- 比较区改为“本月支出与回收”，保留四类条形。分享封面补全订阅/分期支出行，避免净额与列出的项目不一致。
- 统一说明：“仅比较当月物品相关记录；分期本金另列，不计入上述净额。”
- 图片设计版本改为 `monthly-balance-20261012`；刷新、月份和账号切换继续清除旧图片。版本只进入客户端缓存标识，不增加后端快照。

## 数据兼容

`cashflow_net` 仍为购置＋维修＋已付服务费及分期利息／手续费－处置回收，分期本金另列。接口原值不修改，展示以字符串去除负号并格式化，避免大金额分值精度损失。物品累计净成本、日均净成本的真实负值继续保留。

无需新增接口、集合、索引、迁移或后端部署。本轮未部署云函数、未上传体验版。

## 验证

- 56项客户端回归通过：仅回收500、仅支出、支出超过回收、回收超过支出、双方相等、零值／负零、仅分期本金、大金额及字符串精度；原始带符号金额保持不变；旧汇总名称和汇总负号不进入页面或图片。
- 覆盖月份切换、记录重新读取后净额方向变化、删除／恢复后的刷新结果替换、图片缓存失效、原生预览与分享返回、账号隔离和迟到响应丢弃。记录更正／作废／删除恢复使用模拟响应验证客户端刷新；本轮没有对真实账户执行这些写入。
- 160组离线布局通过：10种情况 × 320／390／430／768px × 普通／1.3倍文字 × 预览／完整月报。检查整页横向溢出、素材、名称、金额和旧文案。大金额仍完整可读；离线布局不能替代微信真机。
- 20张实际生产画布绘图器生成的PNG通过文本边界检查：每种情况导出长图与5:4分享封面各一张。导出保持干净白底，没有页面波点。
- 微信模拟器27项检查通过：净回收／净支出／持平／暂无收支预览；完整月报对应名称、金额及原始接口符号；仅分期本金；月份切换；新图片版本；账号切换清空报表及图片。实际微信画布生成并保存三种情况的长图与分享封面，共6张PNG，另有8张模拟器页面截图。验证写请求为零，完成后恢复原账户、请求方法和偏好。结果见 `images/monthly-balance-20261012/native-results.json`。
- 待真机核验：iOS／Android、系统大字体、相册权限和好友实际接收分享卡片；本轮没有自动发送分享或写入相册。

## 截图与复查

| 场景 | 证据 |
| --- | --- |
| 微信模拟器预览 | [净回收](images/monthly-balance-20261012/preview-recovery-native.png) · [净支出](images/monthly-balance-20261012/preview-net-expense-native.png) · [持平](images/monthly-balance-20261012/preview-balanced-native.png) · [暂无收支](images/monthly-balance-20261012/preview-empty-native.png) |
| 微信模拟器月报 | [净回收](images/monthly-balance-20261012/report-recovery-native.png) · [净支出](images/monthly-balance-20261012/report-net-expense-native.png) · [持平](images/monthly-balance-20261012/report-balanced-native.png) · [仅分期本金](images/monthly-balance-20261012/report-principal-only-native.png) |
| 微信画布导出长图 | [净回收](images/monthly-balance-20261012/recovery-export-native.png) · [净支出](images/monthly-balance-20261012/net-expense-export-native.png) · [持平](images/monthly-balance-20261012/balanced-export-native.png) |
| 微信画布分享封面 | [净回收](images/monthly-balance-20261012/recovery-cover-native.png) · [净支出](images/monthly-balance-20261012/net-expense-cover-native.png) · [持平](images/monthly-balance-20261012/balanced-cover-native.png) |
| 390px净回收预览 | [预览](images/monthly-balance-20261012/insights-recovery-390.png) |
| 390px净支出完整月报 | [完整页](images/monthly-balance-20261012/monthly-net-expense-390.png) |
| 390px持平 | [完整页](images/monthly-balance-20261012/monthly-balanced-390.png) |
| 无记录预览／空状态 | [预览](images/monthly-balance-20261012/insights-empty-390.png) · [完整页](images/monthly-balance-20261012/monthly-empty-390.png) |
| 320px大字体、大金额 | [预览](images/monthly-balance-20261012/insights-large-320-large.png) · [完整页](images/monthly-balance-20261012/monthly-large-320-large.png) |
| 平板 | [完整页](images/monthly-balance-20261012/monthly-net-expense-768.png) |
| 导出长图 | [净回收](images/monthly-balance-20261012/recovery-export.png) · [净支出](images/monthly-balance-20261012/net-expense-export.png) · [持平](images/monthly-balance-20261012/balanced-export.png) |
| 分享封面 | [净回收](images/monthly-balance-20261012/recovery-cover.png) · [净支出](images/monthly-balance-20261012/net-expense-cover.png) · [持平](images/monthly-balance-20261012/balanced-cover.png) |

离线复查：`node --test wechat/tests/monthly-balance.test.cjs wechat/tests/monthly-report.test.cjs wechat/tests/monthly-share.test.cjs wechat/tests/navigation-discovery.test.cjs wechat/tests/collection.test.cjs`；`node wechat/tools/verify-monthly-balance.cjs`。

微信模拟器复查：`powershell -NoProfile -ExecutionPolicy Bypass -File wechat/tools/verify-monthly-balance-native.ps1`。使用内存中的演示账户与响应，禁止写请求，结束恢复账户、请求方法和本地偏好。
