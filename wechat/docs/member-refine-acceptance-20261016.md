# 会员功能精简与页面调整：验收记录

2026-10-16，北京时间。本轮使用隔离数据，真实云端写入、会员赠送、付款、部署及发布次数均为0。

## 实施结果

- 会员工具为4项，圆形加减号与展开／收起文字替换原三角箭头；保留按账号记忆。
- 会员账单日历、批量确认、日历专用的未来付款账本修改接口和调用白名单已移除。免费的订阅／分期、单笔确认付款、统计收支日历及历史账本映射保留。
- 账本按确认草图改为三个页内分栏，新建／编辑使用底部表单，归档账本独立收放。预算采用剩余额度主卡与分类列表，编辑和复制上月额度均先进入草稿。
- 会员页保留现有风格，首项加入非点击的免广告展示卡，初创说明默认展开且可收起；删除底部服务说明按钮，加入免费／会员对比入口。
- 对比页两列共用同一份免费功能清单，会员列额外列出5项权益；服务约定使用当前终端目录。免广告为预留权益，本轮没有投放或接入广告。

## 测试结果

| 检查 | 结果 |
|---|---|
| Python后端回归 | 336项通过 |
| Node前端回归 | 352项通过 |
| 实际WXML／WXSS离线布局 | 69组通过 |
| 微信开发者工具编译 | 10个修改页面模板／样式通过 |
| 独立微信项目原生交互 | 14项通过 |
| ZIP源码、CRC、SHA-256 | 见更新目录 `package-verification.json` |

后端覆盖两种存储、下线接口404且不产生付款、免费单笔付款及重复请求、旧账本归属、到期后免费记账、退款／赠送／购买限制等原回归。前端新增检查覆盖复制预算只读取、跨年月份、本月版本号、保存冲突保留输入、账号切换隔离、未保存关闭确认、免费用户编辑阻止、旧日历链接、对比页读取失败及终端价格。

布局覆盖320／390／430／768宽度及320宽度字号放大30%，包含账本分栏、两种编辑表单、会员说明展开／收起、双列对比，以及预算未设置／接近额度／超支／退款结余。

原生检查使用单独的离线项目：模拟器连接曾超时，重启该隔离窗口后14项检查全部通过。生产项目没有被注入测试数据；离线API拒绝全部业务写入，偏好存储使用进程内替身。预算复制在真实微信运行时被确认是未保存草稿。

## 截图

之前：[原账本](images/member-refine-20261016/before-books-user.png)、[原工具收放](images/member-refine-20261016/before-tools-user.png)、[原会员说明](images/member-refine-20261016/before-membership-user.png)、[原预算](images/membership-20261015/budgets-native.png)。

现在的完整页面：

- [我的账本](images/member-refine-20261016/books-390.png)、[流水整理](images/member-refine-20261016/books-entries-390.png)、[标签](images/member-refine-20261016/books-tags-390.png)
- [月度预算](images/member-refine-20261016/budget-390.png)、[预算编辑](images/member-refine-20261016/budget-editor-390.png)、[超支状态](images/member-refine-20261016/budget-over-390.png)、[退款结余](images/member-refine-20261016/budget-refund_surplus-390.png)
- [会员页保留原风格](images/member-refine-20261016/membership-390.png)、[说明收起](images/member-refine-20261016/membership-collapsed-390.png)、[免费版与会员](images/member-refine-20261016/comparison-390.png)
- [我的工具收起](images/member-refine-20261016/me-tools-collapsed.png)、[展开四项工具](images/member-refine-20261016/me-tools-expanded.png)

微信原生截图：

- [账本](images/member-refine-20261016/books-native.png)、[底部编辑表单](images/member-refine-20261016/book-editor-native.png)
- [预算](images/member-refine-20261016/budget-native.png)、[复制上月形成草稿](images/member-refine-20261016/budget-copy-native.png)
- [会员页](images/member-refine-20261016/membership-native.png)、[对比页](images/member-refine-20261016/comparison-native.png)

结构结果：[布局](images/member-refine-20261016/layout-results.json)、[编译](images/member-refine-20261016/compile-results.json)、[原生检查](images/member-refine-20261016/native-results.json)、[包体估算](images/member-refine-20261016/package-results.json)。

## 交付边界

不新增集合、索引或迁移，不重写历史付款和会员文档。旧的日历专用接口返回404；历史计划路由只保留兼容读取与现有删除保护，不再提供日历中的修改入口。

未在真实手机上付款，未验证云端冷启动及真实通知重试。两端收款是否开放，仍按之前真实设备和云端验收决定；本轮没有调整环境开关。前端ZIP内源码总量2,003,793字节（约1.91MiB），相对上一份更新净增21,867字节（约21.4KiB），未新增图片资源。Python源码通过3.10语法检查，Linux运行环境未在本机执行。离线截图不替代各自手机的最终视觉验收，最终上传包体以微信开发者工具为准。
