# 记账／统计入口与首版功能设计

后续调整：新增面板已改为左右大卡片，并移除标题下小字及箭头。[最新截图与验证记录](add-menu-tiles-20261013.md)；下文保留首版导航的验证历史。

## 本地已实现

- 底部顺序为“记账 → 物品 → 猫爪新增 → 统计 → 我的”。四个真实导航页按路径同步选中状态，中间按钮负责打开新增面板；启动和登录仍进入物品页。
- 导航保留64px玻璃胶囊、淡黄选中态和黄色猫爪。四个入口等宽且至少44×44px；常规新增按钮64px，350px以下56px。图标26px、文字11px。
- 新增记账、统计筹备页，使用主题插画、白底波点及“功能正在准备中”；没有虚构金额、流水或记账保存请求。统计页的“查看物品分析”进入现有小小发现。
- 四页统一新增面板：记一笔进入记账筹备页，添物品进入现有表单；物品页保留原有列表定位处理。点击遮罩、叉号均关闭面板，选中项目后等待原生关闭动画完成再跳转。账户切换、页面隐藏或筛选弹层打开时清除待执行动作。
- 记账图标为猫爪账本，统计图标为三色柱形和猫爪。新增透明PNG合计3,970B；SVG源文件存于小程序包外。新旧图标失败时保留文字及可用入口。
- 修正微信原生按钮默认宽度：菜单卡片铺满内容区，关闭按钮44×44px、距面板右侧12px。组件样式改为类选择器，避免通用标签选择器警告。
- 无后端接口、数据表、集合、索引或迁移变更；没有部署、上传体验版或业务写入。

## 四张功能草图

以下是未来完整功能的设计示意，示例金额未进入小程序或接口。

| 页面 | 草图 |
| --- | --- |
| 记账首页：月份、支出／收入概览、分日流水与来源标签 | [查看记账首页](images/ledger-navigation-20261013/concepts/ledger.png) |
| 记一笔：支出／收入、金额、分类、日期、备注与可选关联物品 | [查看表单](images/ledger-navigation-20261013/concepts/record-form.png) |
| 统计：收支／物品切换、月度净额、分类排行与趋势 | [查看统计页](images/ledger-navigation-20261013/concepts/statistics.png) |
| 新增菜单：记一笔与添物品，保持当前实际面板风格 | [查看新增面板](images/ledger-navigation-20261013/concepts/new-menu.png) |

可编辑设计源文件：[HTML草图目录](../branding/ledger-navigation-20261013/concepts/)。运行页面使用真实组件和文字，未将草图图片作为背景。

### 后续功能方向

日常收支与物品业务统一查看，各条标注来源。自动来源返回原记录编辑，不复制成可独立修改的重复流水；更正、作废、删除及恢复需要保留来源关系。

物品购买价格用于成本，分期付款反映实际收付，二者不能直接累加。本次未实现统一收支汇总；分期购买、历史记录补入、删除恢复与资金账户口径在正式后端实施前另行确认。现有小小发现、收藏小报和日均净成本的计算保持原样。

未来统计以明确文案显示净收入、净支出或收支持平，金额保留两位小数。统计的物品视角承接物品成本、小小发现及收藏小报入口，不把日常餐饮等支出加进某件物品的日均成本。

## 验证结果

| 检查 | 结果与范围 |
| --- | --- |
| 逻辑与既有流程 | 25项通过：四页路径同步、菜单防重复、关闭后跳转、账户切换取消动作、隐藏导航、物品定位处理、原有分析／订阅流程及WXML结构 |
| 离线生产布局 | 42组通过：四页在320／390／430／768px与普通／1.3倍文字下显示；新增菜单补查568px短屏与34px安全区；另查图标失败回退 |
| 微信模拟器主回归 | 19项通过：四页、尺寸与点击区域、两个筹备页不请求后台、原生新增容器、全宽卡片、关闭按钮位置、记一笔／添物品、编辑器返回锚点、筛选、图标回退及无业务写入 |
| 物品分析入口 | 模拟器真实点击“查看物品分析”，成功进入 `pages/insights/index` |
| 当前项目实际点击 | 使用电脑操作截图核验：点击猫爪打开菜单、点击遮罩关闭、再次打开后点叉号关闭、点击记账入口进入筹备页，均确认成功 |
| 测试状态恢复 | 最后运行状态为记账页，`fixture:false`、`menuOpen:false`；原账户及请求方法已恢复 |

自动化尺寸查询添加了1.5秒保护，防止未返回的回调阻塞整轮检查。原生最终尺寸读取成功；尺寸及菜单边距详见结果JSON。

**返回操作限制：** 本轮使用微信原生 `page-container` 承接系统返回。模拟器根导航页调用 `wx.navigateBack` 返回“cannot navigate back at first page”，菜单仍打开，故该项明确记为未通过API验证。关闭事件取消待执行动作已通过逻辑测试；安卓物理返回键、iOS返回手势仍需真机确认，不能据此宣称已实测通过。

iOS／Android真机、系统大字体、真实账户登出再登录与设备返回手势未测。账户隔离和登录后目标页由逻辑／配置检查覆盖，模拟器回归使用隔离账户与读取响应，写入请求为零。电脑操作补查使用恢复后的当前项目，没有输入或保存业务记录。

## 截图与素材

- 微信：[物品页五入口](images/ledger-navigation-20261013/items-native.png)、[记账筹备页](images/ledger-navigation-20261013/ledger-native.png)、[统计筹备页](images/ledger-navigation-20261013/statistics-native.png)、[新增面板](images/ledger-navigation-20261013/new-menu-native.png)、[返回物品页](images/ledger-navigation-20261013/items-return-native.png)。
- 适配：[320px大字体](images/ledger-navigation-20261013/ledger-320-large.png)、[大字体短屏菜单](images/ledger-navigation-20261013/ledger-320-large-menu.png)、[平板](images/ledger-navigation-20261013/statistics-768.png)、[图标回退](images/ledger-navigation-20261013/statistics-320-large-fallback.png)。
- SVG：[记账](../branding/ledger-navigation-20261013/ledger.svg)、[统计](../branding/ledger-navigation-20261013/statistics.svg)。
- 记录：[42组布局](images/ledger-navigation-20261013/browser-results.json)、[19项模拟器](images/ledger-navigation-20261013/native-results.json)、[分析入口及返回限制](images/ledger-navigation-20261013/native-back-results.json)。
- 包引用检查152处通过，当前小程序运行文件原始合计1,115,153B；这是本地估算，不是微信上传压缩包大小。

## 重现

- `node --test wechat/tests/custom-tab-bar.test.cjs wechat/tests/navigation-discovery.test.cjs wechat/tests/purchases.test.cjs`
- `node wechat/tools/verify-ledger-navigation.cjs`：本地浏览器布局及截图。
- `node wechat/tools/render-ledger-concepts.cjs`：四张可编辑功能草图。
- 完成微信开发者工具技能门禁后，运行 `wechat/tools/verify-ledger-navigation-native.ps1` 和 `wechat/tools/verify-ledger-navigation-back-native.ps1`。
