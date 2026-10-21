# 已处置物品独立归档 · 2026-10-11

## 本地实现

- 物品首页只展示使用中、闲置物品。标题数量、结果数量、分类、搜索及排序均在当前持有范围内计算；状态选项改为“全部持有 / 使用中 / 闲置”。清除筛选不会混入已处置物品。
- “我的收藏册”按“小小发现 → 已处置档案 → 回收站”排列。新入口使用原创猫爪档案盒图标，深灰描边配淡黄与浅粉；文字在图标失败时仍可点击。
- 新增 `pages/disposed/index`。沿用白底、真实照片或原分类插画、手绘边框，改用浅灰蓝状态标签和数字标记。突出“曾持有天数 / 历史日均净成本”，直接展示原响应数值；零值、负值、暂无不会替换成演示金额。
- 档案支持搜索、分类筛选、最近添加、曾持有最久、购买价格、历史日均净成本排序，均保留置顶优先。处置方式、日期与回收金额仍在原物品详情查看。
- 无档案时显示“还没有已处置的物品档案”，可返回物品页。搜索无结果与真正空档案分开显示。
- 处置保存后提示“已归入处置档案”。两页重新显示时读取实际状态；撤销处置、回收站恢复后的归属由后端返回状态决定，客户端不猜测恢复成使用中。

## 共用与兼容

- 两页共用 `utils/item-list-page.js` 与 `templates/item-list.wxml`，保留缩略图读取、懒加载、失败重试、导航重复点击保护及返回定位。照片缓存同步完整 `/items` 响应，避免切换页面时误清除另一列表的缩略图。
- 搜索、筛选、滚动和锚点按页面分别在当前运行会话中保存，重新打开档案页仍可恢复；切换登录会话后清除。排序偏好按账户及页面分别保存，首页继续使用原偏好键；没有把物品数据写入偏好存储。
- 首页筛选开启时隐藏玻璃导航，关闭或确认后恢复；独立档案页无底部导航，筛选不会调用原生标签栏显示接口。弹层保留安全区与可滚动分类区。
- 没有新增请求路径、接口、集合、索引或数据库字段。后台继续返回全部非回收站物品，由两页分别筛选。历史统计、小报及费用计算没有改动。
- 本次没有部署云函数、创建云端资源或上传体验版；编译本地客户端即可审阅。本次无需同步后端。“我的”持有物品、购入总额、使用天数的上一轮后端同步仍需单独处理。

## 验证结果

- **70 项客户端回归通过**：持有 / 处置范围、数量与分类、搜索、状态与清除筛选、置顶、排序独立偏好、处置与撤销后刷新、回收站恢复、返回附近有效卡片、账户切换隔离、照片重试与迟到回调、重复提交及处置成功提示。见 [完整输出](images/disposed-archive-20261011/frontend-results.txt)。
- **20 个本地布局场景通过**：320、390、430、768px，1.3 倍字号、长名称、大金额、负金额、零值、暂无、空档案、照片重试、普通边框回退及两页筛选。没有横向溢出，档案标签为灰蓝色，确认按钮在可见区域。见 [布局记录](images/disposed-archive-20261011/browser-results.json)。此类截图使用实际 WXML/WXSS 进行本地渲染，不等同于真机。
- 两项现有 SQLite / CloudBase 接口生命周期回归通过：维修与处置后的净成本、照片、回收站、撤销处置恢复闲置，以及事务回滚。测试使用临时数据库和内存 CloudBase，不访问生产数据。
- 微信模拟器已实际检查持有列表、我的入口、处置档案、筛选重置 / 确认 / 关闭、照片失败重试、卡片进入原详情、空状态返回。测试数据及云请求均隔离；生产账户没有写入。处置、撤销、回收站与恢复的 18 项流程衔接断言通过，结果见 [模拟器记录](images/disposed-archive-20261011/native-results.json)。
- 微信 `compile_wxml` 对物品页与档案页成功，`compile_wxss` 对档案页成功。新增 PNG 合计 7,173 字节；包体静态审计纳入文件原始合计 874,716 字节，实际上传包大小仍须上传前检查。见 [包体审计](../branding/disposed-archive-20261011/package-audit.json)。

## 截图

| 页面 / 状态 | 微信模拟器 | 多尺寸与异常内容 |
| --- | --- | --- |
| 持有物品 | [首页](images/disposed-archive-20261011/held-native.png) · [筛选](images/disposed-archive-20261011/held-filter-native.png) | [320px](images/disposed-archive-20261011/items-320.png) |
| 我的入口 | [收藏册顺序](images/disposed-archive-20261011/me-native.png) | [390px](images/disposed-archive-20261011/me-390.png) |
| 已处置档案 | [首屏](images/disposed-archive-20261011/archive-native.png) · [筛选](images/disposed-archive-20261011/archive-filter-native.png) | [首屏](images/disposed-archive-20261011/archive-first-screen.png) · [滚动后](images/disposed-archive-20261011/archive-scrolled.png) |
| 原物品详情 | [详情](images/disposed-archive-20261011/archive-detail-native.png) | [长名称 / 大金额 / 大字体](images/disposed-archive-20261011/archive-long-large.png) |
| 空状态与回退 | [空档案](images/disposed-archive-20261011/archive-empty-native.png) · [照片重试](images/disposed-archive-20261011/archive-photo-error-native.png) | [描边回退](images/disposed-archive-20261011/archive-decor-fallback.png) |

## 验证限制

- 当前开发者工具的 `navigateBack` 在自动化中报告成功，但页面栈没有弹出。这是前一轮已记录的模拟器问题；本轮通过 `redirectTo / switchTab` 重新进入页面验证刷新，返回定位由客户端回归覆盖，未把它宣称为原生返回手势已通过。
- 尚未进行真机测试，包括小米 K80 Ultra 的返回手势、滚动性能、安全区域与系统大字体。平板及尺寸矩阵来自本地布局渲染，模拟器截图来自当前设备配置。
- 所有截图数字为隔离示例，不写入真实账户；结束后恢复原内存会话与云请求方法。

## 设计源文件

- [猫爪档案盒 SVG](../branding/disposed-archive-20261011/entry.svg)
- [灰蓝数字标记 SVG](../branding/disposed-archive-20261011/mark.svg)

设计源文件与验证截图位于包外，运行时仅使用两个透明 PNG。
