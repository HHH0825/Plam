> 此文记录上一份更新。当前会员工具精简与部署步骤请看 [最新操作说明](member-refine-manual-20261016.md)。

# 本地验收记录：会员工具、外观与购买资格

验收日期：2026-10-16（北京时间）。固定隔离数据；真实云端写入、会员赠送、付款、部署及发布次数均为0。

## 结果

- Python回归336项通过：SQLite和文档型数据库合同、付费／赠送有效身份禁止下单、旧客户端、价格协议、过期／全额退款恢复购买、赠送撤销、老订单晚到／重复发货、下单中身份变化，以及同账户并发下单／事务冲突。活动截止前1秒／整点／后1秒均校验，价格未变。
- Node回归342项通过：账号／终端隔离、复制ID、支付与取消、旧响应隔离、折叠记忆、草稿／恢复默认／切账号、购买前身份刷新和过期价格阻止。
- 实际WXML/WXSS离线渲染61组通过：320／390／430／768宽度，320宽度额外放大字号30%；会员免费／已开通／到期、折叠／展开、长账本名、三列工具条及外观页面。工具条三入口同一行，点击区域至少44px。
- 24张小报输出通过：4种配色×3种模板×收支／收藏两类；使用实际导出计划与画布绘制函数。文字边界、透明图片资源、贴纸及金额检查通过。
- 微信开发者工具23个本地页面模板、样式及全局样式编译通过。另在独立离线项目中验证了6张**微信原生画布**图片（三模板×两类小报），草稿预览成功且没有保存或账目写入。
- 包体及ZIP源码／CRC／SHA-256检查结果见更新目录 `package-verification.json`；精确体积见同目录与截图目录的 `package-results.json`。前端ZIP内源码总量1,981,926字节（约1.89MiB），相对上一份部署包净增27,351字节（约26.7KiB）；按打包配置估算的运行文件总量1,983,008字节，均低于2MiB。

## 可直接打开的效果

之前的布局：[原会员工具](images/membership-tools-20261015/me-free-390.png)，[原会员页](images/membership-tools-20261015/subscription-390.png)。

现在：[会员工具收起](images/member-polish-20261016/me-active-390.png)、[会员工具展开](images/member-polish-20261016/me-active-390-expanded.png)、[有效会员“已拥有”](images/member-polish-20261016/membership-active-390.png)、[免费会员页](images/member-polish-20261016/membership-free-390.png)、[到期会员页](images/member-polish-20261016/membership-expired-390.png)。

工具：[统计320宽](images/member-polish-20261016/statistics-320.png)、[记账390宽](images/member-polish-20261016/ledger-390.png)、[手账外观页](images/member-polish-20261016/member-tools-390.png)、[微信原生预览](images/member-polish-20261016/appearance-native.png)。

小报：[手绘](images/member-polish-20261016/report-cash-blue-default.png)、[简洁](images/member-polish-20261016/report-cash-blue-simple.png)、[猫爪手帐](images/member-polish-20261016/report-cash-blue-journal.png)、[收藏小报](images/member-polish-20261016/report-collection-pink-journal.png)。微信真实画布生成文件以 `native-report-` 开头，所有图均为隔离示例。

结构结果：[布局](images/member-polish-20261016/layout-results.json)、[原生预览](images/member-polish-20261016/native-preview-results.json)、[编译](images/member-polish-20261016/compile-results.json)。

## 实施范围与限制

复用现有集合、索引、外观字段和两端目录。下单保护作为现有会员文档的一种账户记录，发货、退款、赠送和撤销算法保持现有逻辑；新限制只阻止有效会员的新订单，不拒收原订单付款。

截图中的字形和微信原生画布受运行字体影响，浏览器截图不能替代安卓／苹果真机视觉体验。本轮未在实际手机上付款，未改变云端3秒限制，也没有验证真实云端冷启动及通知丢失恢复。是否对公众开放支付继续按上一轮部署验收要求决定。

前端包体为按当前打包忽略规则计算的源码体积估计，微信上传压缩后的最终体积以开发者工具为准；没有新增大尺寸装饰图片。
