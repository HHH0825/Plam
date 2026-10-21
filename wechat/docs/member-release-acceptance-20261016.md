# 本次会员与支付调整验收记录

日期：2026-10-16。所有写入测试使用隔离数据库，真实云端写入、真实赠送和真实付款均为0；没有部署或发布。

| 检查 | 结果 |
| --- | --- |
| 后端回归 | 322项通过 |
| 前端回归 | 335项通过 |
| 维护工具浏览器交互 | 9项通过：精确查询、预览、确认、重复提交只赠送一次、逐条撤销、凭据清空、无浏览器存储、无外部页面请求、无页面错误 |
| 个人设置布局 | 320／390／430／768宽度，正常及放大字号，共8组通过 |
| 两端会员页 | 安卓与苹果各4个宽度，共8组通过；使用隔离后端实际目录响应 |
| 微信开发者工具 | 个人设置与会员页的WXML／WXSS，共4个文件编译通过 |
| 小程序体积 | 约1.87MiB，按现有打包排除规则估算；图片引用无缺失。最终上传体积以开发者工具为准 |
| 交付包 | 4个ZIP的完整性、SHA-256及关键源文件一致性通过；后端源码通过Python 3.10语法检查 |

后端回归包含自然月跨月及闰年、赠送与付款交错、全额退款、撤销、部分退款保留权益、旧基线不一致停止写入、提交成功但响应丢失、并发事务冲突、三档苹果目录、价格过期和旧客户端限制。云端替身测试不能代替真实CloudBase时延与事务验收。

## 截图

- [个人设置调整前](images/member-release-20261016/profile-before.png)
- [个人设置调整后（浏览器布局）](images/member-release-20261016/profile-after-browser.png)
- [个人设置调整后（开发者工具离线页面）](images/member-release-20261016/profile-after-native.png)
- [安卓会员页](images/member-release-20261016/subscription-android-390.png)
- [苹果会员页](images/member-release-20261016/subscription-ios-390.png)
- [维护工具确认前预览](images/member-release-20261016/admin-preview.png)
- [隔离账号赠送后](images/member-release-20261016/admin-granted.png)
- [隔离账号撤销后](images/member-release-20261016/admin-revoked.png)

## 尚需上线前完成

尚未验证真实云端3秒冷启动、实际待处理订单的补单、微信通知重试及退款链路，尚未核验苹果正式商品的实际付款面板。当前交付是手动部署候选，不能据此认定公众收款已经验收通过。

Linux云函数依赖沿用已锁定的Linux包，并核对版本；未在本机执行Linux运行环境。手机实际付款、平台价格及云端操作由用户按[手动操作说明](member-release-manual-20261016.md)完成。

各包完整SHA-256、字节数及上述未验证标记保存在交付目录的 `upload-manifest.json` 与 `acceptance-results.json` 中。
