# 记账月度面板与统计日历交付（2026-10-13）

## 状态与视觉基准

采用确认的**第一版双页草图**：奶黄月度面板、白色细格线日历、淡黄装订与粉色猫爪。页面使用真实文字、组件和接口，未将草图用作背景。对照原稿见 [第一版草图](images/ledger-journal-20261013/approved-first-sketch.png)。

**仅本地可审阅，未部署云函数、未上传体验版、未写入真实账目。** 微信截图与排版截图均使用隔离示例，结束核验后已恢复原账户、请求传输与存储。当前云端服务不会因本次本地修改自动升级。

## 已实现

### 记账首页

- 删除内容区大标题、介绍及独立月份栏，月份前后切换和选择器融入奶黄面板；保留微信原生标题。
- 完整两位小数显示支出、收入与净额方向，退款为零隐藏说明；右上信息按钮解释退款与物品成本口径。
- 渲染与尺寸变化后测量金额文字，字号依次缩小、下方双列改为纵排；极端金额保持一行并可横向查看。未缩写面板金额。
- “本月流水”右侧搜索／筛选按钮均至少 44px。搜索展开并聚焦，收起保留可清除标签；筛选草稿只在确认后生效，关闭不改变原条件。
- 筛选徽标统计已选条件数；整月面板不随筛选变化，独立显示完整筛选合计。换月保留条件，账户切换清空。
- 日期标题显示服务端完整筛选结果的原支出、收入及退款合计；不是对已加载的分页求和。历史核对入口在流水末尾。

### 统计收支日历

- 保留“收支／物品”切换，以手绘日历替换重复概览与每日柱状图；物品分析入口保留。
- 周一开头，按月份显示 4–6 周，月外留空；未来日期淡化且不可选择，无记录日期只显示日期。
- 日历“支”为未扣退款的原支出，“收”为收入，“退”表示有退款；月支出仍按原规则扣退款。图例明确区分口径。
- 格内金额通过十进制字符串去尾零、缩写万／亿并按实测宽度减少精度；仅格内使用约数。窄屏减少格内左右留白，保留七列和至少 44×44px 日期按钮。选中日下方显示完整精确金额。
- 当前月首次选今天，历史月选最后一个有记录的日期，空月选 1 日。选中日淡黄底、角落猫爪，今天另有黄色短线。
- 当天明细独立分页并进入现有详情，分类排行始终表示整月。返回保留月份、日期和滚动位置，重新读取变更后的汇总与明细。
- 日期使用北京时间自然日；可见页面每 30 秒检查跨日，重新进入时也更新。原选今天时可随跨月切至新今天；主动选择的历史日期保留。
- 换月、切日期、离开或换账户后的旧响应、旧测量回调不会覆盖当前数据；失败提示重试，不用假零替代失败结果。

## 截图

微信模拟器为 430px；其他尺寸及 1.3 倍文字为真实 WXML／WXSS 的浏览器近似渲染，不能代替真机。

| 内容 | 微信模拟器 | 窄屏／大字体 |
|---|---|---|
| 奶黄月度面板 | [记账页](images/ledger-journal-20261013/ledger-native.png) | [320px](images/ledger-journal-20261013/ledger-320.png)、[1.3 倍文字／短屏](images/ledger-journal-20261013/ledger-320-large-font.png) |
| 日历及选中日 | [统计页](images/ledger-journal-20261013/statistics-native.png) | [320px](images/ledger-journal-20261013/statistics-320.png)、[1.3 倍文字／短屏](images/ledger-journal-20261013/statistics-320-large-font.png) |
| 搜索／筛选 | [搜索](images/ledger-journal-20261013/ledger-search-native.png)、[筛选](images/ledger-journal-20261013/ledger-filter-native.png) | [窄屏筛选](images/ledger-journal-20261013/ledger-320-filter.png) |
| 退款日期 | [10 月 12 日](images/ledger-journal-20261013/statistics-refund-native.png) | [退款结余面板](images/ledger-journal-20261013/ledger-390-refund-surplus.png) |

另见：[390px 记账](images/ledger-journal-20261013/ledger-390.png)、[390px 日历](images/ledger-journal-20261013/statistics-390.png)、[平板](images/ledger-journal-20261013/statistics-768.png)、[六周月份](images/ledger-journal-20261013/statistics-320-2026-08.png)、[闰年二月](images/ledger-journal-20261013/statistics-320-2024-02.png)、[极端精确金额](images/ledger-journal-20261013/ledger-320-extreme.png)、[旧后端](images/ledger-journal-20261013/statistics-390-old-backend.png)、[当天读取失败](images/ledger-journal-20261013/statistics-390-day-failure.png)。

## 接口与部署材料

[接口说明](cash-ledger-api-20261013.md) 已补充 `GET /ledger/entries` 的可选 `date`、实际日期回传及 `day_summaries`。每日合计在分页之前、全部筛选之后计算。`summary` 继续表示整月；`/ledger/statistics` 的每日汇总不变。无日期调用保持兼容。

旧记账后端仍可展示日历汇总；未回传匹配日期时，客户端不展示整月流水冒充当天流水，并提示同步新版服务端。缺少整个记账能力的更旧后端继续显示筹备提示。

| 本地文件 | 用途 |
|---|---|
| [palm-api-python310.zip](../deploy/cloudbase/ledger-journal-20261013/palm-api-python310.zip) | 更新现有 Python API，包含本次当天查询及既有记账逻辑 |
| [palm-api-bridge-node20.zip](../deploy/cloudbase/ledger-journal-20261013/palm-api-bridge-node20.zip) | 可选桥接，代码未因日历查询新增路由 |
| [manifest.json](../deploy/cloudbase/ledger-journal-20261013/manifest.json) | 包体、依赖基线、源文件及 SHA-256 |
| [resources-delta.json](../deploy/cloudbase/ledger-journal-20261013/resources-delta.json) | 本轮无新集合、索引、字段或迁移，`applied:false` |

**已有首版记账后端时**：备份现有函数版本与配置 → 更新 Python API → 用隔离账户核对当天查询 → 同步客户端。本轮 SQLite 版本仍为 13，无数据库迁移；无需新建集合。沿用原环境变量与依赖，不新增密钥或任务。

**尚未安装首版记账后端时**：仍需先满足 [首版迁移说明](cash-ledger-20261013.md) 中的两个记账集合和权限要求，再使用本次最新 API 包。不能用本轮“无新增资源”省略首版基础资源。

所有包只包含程序与既有锁定依赖，不含业务数据库、照片或凭证。复现：`wechat/.venv/Scripts/python.exe wechat/tools/prepare-ledger-journal-release.py`。回退可恢复原函数版本和旧客户端，保留现有账目数据；不通过删集合回退。

## 验证记录

完整机器记录：[verification.json](images/ledger-journal-20261013/verification.json)、[浏览器记录](images/ledger-journal-20261013/browser-results.json)、[微信记录](images/ledger-journal-20261013/native-results.json)、[包体清单](images/ledger-journal-20261013/package-audit.json)。

- 后端全套 **220 项通过**；其中记账合约 30 项，在 SQLite 与 CloudBase 文档事务模拟器上覆盖当天分页、完整按日合计、筛选、空日期、未来／月外／非法日期、闰日及退款日期；同时回归保存、退款、作废、来源联动和归属隔离。
- 客户端全套 **235 项通过**；本次新增 11 项覆盖四至六周、28–31 天、跨年、未来日期、选中规则、退款标记、金额精度和进位、草稿取消、分页、旧后端、乱序响应、账户切换、错误数据、午夜更新、返回滚动及失效测量。
- 浏览器 **23 组通过**：320／390／430／768px、320px 1.3 倍文字及 568px 短屏，四种月份长度、六周、空态、退款结余、极端金额、搜索筛选、旧后端及读取失败。核验无页面横向溢出、金额不拆行、素材可用、日期点击区完整；额外核对普通日历金额行实际宽度。
- 微信最终编译 4 个 WXML／WXSS 文件；**12 项原生运行时检查通过**，包括面板、44px 搜索筛选按钮、隐藏导航、取消筛选、搜索、31 个日期按钮、今天及退款日期切换、当天查询范围和零业务写请求。交互通过运行时处理器调用，截图为真实模拟器渲染。
- 未新增运行图片，复用现有猫爪；静态素材引用全部可用。清单为源文件未压缩估算，微信上传后的最终包体未测。

测试日志位于 `wechat/.qa-ledger-tmp/journal-backend-tests.log`、`journal-contract-tests.log`、`journal-client-tests.log`；验证摘要另持久保存于上述 JSON。

### 尚未实测

iOS／Android 真机、实际手指点击与系统返回手势、系统键盘、真机 1.3 倍字号、极端金额横向触摸、真实午夜前后台恢复、多设备同时更正后的端到端刷新，以及生产 CloudBase 部署后的事务与权限。没有自动部署、上传或提交测试账目。
