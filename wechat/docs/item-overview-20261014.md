# 同行展开搜索与物品统计首页

日期：2026-10-14。仅本地客户端交付，未部署云函数、未上传体验版，未改动后端、接口或数据库。

## 本次完成

- 物品页搜索按钮移至工具栏最左。展开后输入框占剩余空间，筛选和图标排序各保留44px；再次点搜索收起并隐藏键盘。输入内×只清空关键词，收起后保留可清除标签。已处置档案保留原搜索布局。
- 统计的物品视图直接展示累计净成本、四项费用、三种状态件数、购入金额分类分布、两条真实分析摘要及收藏小报入口。
- 累计净成本直接使用现有 `/stats`：购置＋维修＋关联已付订阅／分期费用－处置回收，包含已处置、排除已删除物品；分期本金不重复计入。说明按钮解释与记账现金收付的差别。
- 分类按购买金额排序，超过三类时前三类单列，其余精确相加。历史分类名称保持原样。金额以十进制字符串处理，仅画横条比例使用近似值；保留完整两位小数及负值。
- 提醒复用 `/insights`，优先手动闲置、即将过保。点击带客户端 `kind` 参数进入小小发现并定位对应卡片；提醒消失时提示已更新，显示最新内容。
- 两个统计数据请求分别加载、失败和重试，不依赖记账能力。缺失字段显示暂不可用；分类合计异常明确提示，避免显示伪造比例。
- 收支／物品分别记录滚动位置；收支月份和选中日保留。返回页面刷新，账户切换清空，旧请求和测量回调不能覆盖新页面。跨午夜更新提醒及小报月份。

## 截图

截图中的账目和物品为隔离验证示例，并非用户数据。微信模拟器核验时拦截请求和存储，拒绝所有业务写入，结束后恢复原账户、存储和连接。

| 内容 | 截图 |
| --- | --- |
| 确认草图 | [双页草图](images/item-overview-20261014/approved-sketch.png) |
| 搜索收起，微信模拟器 | [物品工具栏](images/item-overview-20261014/items-collapsed-native.png) |
| 搜索同行展开，微信模拟器 | [展开搜索](images/item-overview-20261014/items-expanded-native.png) |
| 收起后保留关键词 | [搜索标签](images/item-overview-20261014/items-query-chip-native.png) |
| 物品统计，微信模拟器 | [统计首页](images/item-overview-20261014/statistics-overview-native.png) |
| 滚动到底部，微信模拟器 | [提醒与小报入口](images/item-overview-20261014/statistics-bottom-native.png) |
| 提醒进入并定位分析 | [小小发现定位](images/item-overview-20261014/reminder-target-native.png) |
| 390px完整统计布局 | [浏览器实际模板](images/item-overview-20261014/statistics-overview-390.png) |
| 320px、1.3倍文字搜索 | [窄屏搜索](images/item-overview-20261014/items-expanded-320-large.png) |
| 320px、1.3倍文字统计 | [窄屏统计](images/item-overview-20261014/statistics-overview-320-large.png) |
| 多分类与长名称 | [分类合并](images/item-overview-20261014/statistics-many-320-large.png) |
| 极端金额 | [金额纵排与横向查看](images/item-overview-20261014/statistics-extreme-320-large.png) |
| 负净成本 | [负值](images/item-overview-20261014/statistics-negative-390.png) |
| 零金额 | [中性轨道](images/item-overview-20261014/statistics-zero-390.png) |
| 旧后端缺字段 | [兼容提示](images/item-overview-20261014/statistics-legacy-390.png) |
| 统计失败、提醒仍可用 | [独立失败](images/item-overview-20261014/statistics-stats-failure-390.png) |
| 提醒失败、统计仍可用 | [提醒重试](images/item-overview-20261014/statistics-insights-failure-390.png) |
| 已处置档案 | [原布局](images/item-overview-20261014/disposed-archive-390.png) |

## 验证记录

- 客户端249项测试全部通过。本次增加8项，覆盖精确大金额合并、负值、零值、缺字段、提醒优先级、独立请求重试、无记账能力、视图和账户切换丢弃旧响应、分视图滚动、跨午夜及提醒定位。
- 浏览器实际模板／样式25组检查通过：320／390／430／768px、320×568短屏及1.3倍文字；检查同排、右侧按钮宽度、页面不横向溢出、数字单行和素材可用。补充空数据、负值、多分类、巨大金额、加载、部分失败及旧后端场景。
- 微信模拟器编译物品、统计、小小发现和已处置档案共8个WXML／WXSS文件。核验搜索、清除、收起标签、筛选取消、排序、关闭记账能力后仍可用的物品统计、提醒定位、返回保留视图、小报跳转及切换收支后再次加载。
- 包检查确认静态引用完整；本次没有新增运行素材，草图及验证图片位于文档目录，不进入小程序包。
- [浏览器几何检查](images/item-overview-20261014/browser-results.json)、[微信模拟器记录](images/item-overview-20261014/native-results.json)、[交付验证摘要](images/item-overview-20261014/verification.json)。

## 使用与待测

微信开发者工具重新编译当前项目，即可查看本次客户端修改，无需为本次改版更新后端。

真机未测试：iOS／Android系统字体缩放、原生键盘及收起行为、系统返回手势、安全区域、实际网络延迟。窄屏／大字体为浏览器模拟，微信截图为当前模拟器尺寸；不将浏览器检查等同于真机结果。未对真实账户执行新增、编辑、删除或退款操作。
