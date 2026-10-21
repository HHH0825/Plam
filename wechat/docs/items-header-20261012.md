# “我的物品”页顶部草图落地 · 2026-10-12

## 实现

- 以 `../branding/items-header-20261012/approved-sketch.png` 为确认对照。仅持有物品页导入独立 `header.wxss`；已处置档案继续使用原来的标题、插画和样式。
- 文案为“生活收藏册”“我的物品”“N 件持有物品 · 慢慢收藏”。N继续读取已排除处置和回收站物品的 `items.length`，搜索和筛选只影响结果数量。
- 标题34px、黄色手绘下划线，数量30px；百万件以上的长数量使用22px以避免窄屏溢出。页头正文最小高度154px；320px标题30px、正文150px。内容可撑高，没有固定裁切文字高度。
- 奶黄光晕从右上方淡入白色，保留现有波点和轻装饰。猫咪为独立透明PNG，保持原始比例；装饰不接收点击。加载失败仅隐藏新猫咪，不隐藏文字、入口或物品卡片。
- 搜索框50px高，放大镜使用简单原生样式绘制；三个入口同排等宽、图标在上、文字在下。按20:00追加要求，将图标替换为确认草图中的爱心清单、粉色时钟日历与简洁收纳盒，显示尺寸36px。正常点击高度88px，窄屏80px；大字体可自然增高。
- 共用模板保留档案页分支。未修改详情、物品卡片、底部导航、业务接口或金额计算。

## 素材

使用内置 image_gen，参照确认草图独立提取猫咪与收纳盒，未将完整草图当作页面背景。原图与草图放在branding目录，不进入小程序包。

- 运行文件：`../miniprogram/assets/items-header/cat-box.png`，360×358，透明通道，57,595B（约56.2KiB），低于80KiB。
- 原图：`../branding/items-header-20261012/cat-box-source.png`。
- 三个入口保留可编辑 `entry-wishlist.svg`、`entry-subscription.svg`、`entry-storage.svg`，同在branding目录；独立透明PNG合计9,675B，连同猫咪运行素材合计67,270B（约65.7KiB），仍低于80KiB。
- 图标重建：`node wechat/tools/prepare-items-header-icons.cjs`。只替换物品页入口引用，其他页面的既有图标素材保持原样。
- 重建：`node wechat/tools/prepare-items-header.cjs`，依赖sharp；可传入草图和透明原图两个绝对路径首次归档。
- 生成提示：仅保留草图右侧圆脸白猫与淡黄色收纳盒，双爪搭在盒边、粉色脸颊、右侧卷尾、盒上粉色猫爪标签、深灰圆润手绘描边、左上两笔黄色短线和极淡底影。透明背景；去除UI、文字、波点及星星。

## 验证

- 72组离线布局通过：320、390、430、768px × 常规／1.3倍文字 × 正常、零件、大数量、加载、读取失败、猫咪失败回退、筛选弹层、搜索、已处置档案。320px使用640px短屏。
- 检查标题与猫咪不相交、说明不被页头裁切、搜索左边缘对齐、入口等宽和顺序、点击高度、横向溢出及素材加载。宽屏保留480px最大内容宽。
- 现有 `collection.test.cjs` 21项通过，覆盖搜索筛选、升降序、偏好、置顶、账户隔离、回收站与归档状态、照片重试、返回定位等。
- 素材打包检查通过136处静态引用；依照现有忽略规则，运行文件未压缩合计1,099,625B。该数字不是微信上传后的压缩包大小。审计结果归档在本轮branding目录。
- 微信模拟器组合检查通过13项：持有范围与数量、插画加载、文字分离、边缘对齐、入口点击尺寸、搜索和筛选后的总数、排序及心愿入口。随后工具返回页面断言未通过，`native-results.json`保留`passed:false`，不宣称完整组合流程通过。导航脚本改为按页面栈等待后，仍复现该返回问题；没有修改业务导航逻辑。
- 三个入口及详情另以独立场景验证，10项检查通过，结果见 `native-navigation-results.json`。初次详情演示数据漏了维修记录数组；补齐隔离数据后追加检查详情加载与无错误状态，结果见 `native-detail-results.json`，截图已更新。使用内存演示账户和拦截读取，不允许后端写入；每个场景结束时恢复原账户、请求方法及模拟偏好。详情返回定位由现有自动化单元检查覆盖，模拟器组合返回及真机返回仍待复核。
- 真机iOS／Android及系统字体设置未实测。320／390／430／平板和1.3倍文字为离线适配证据，不冒充真机截图。

## 截图

| 场景 | 文件 |
| --- | --- |
| 确认草图对照 | [草图](../branding/items-header-20261012/approved-sketch.png) |
| 微信模拟器 | [物品页](images/items-header-20261012/items-native.png) |
| 离线主要对照 | [390px](images/items-header-20261012/normal-390.png) · [430px](images/items-header-20261012/normal-430.png) |
| 窄屏大字体／平板 | [320px大字体](images/items-header-20261012/normal-320-large.png) · [768px](images/items-header-20261012/normal-768.png) |
| 搜索／筛选 | [搜索](images/items-header-20261012/search-native.png) · [筛选](images/items-header-20261012/filter-native.png) |
| 空状态／读取失败 | [零件](images/items-header-20261012/zero-390.png) · [错误](images/items-header-20261012/error-390.png) |
| 猫咪失败回退 | [离线](images/items-header-20261012/art-failed-390.png) · [模拟器](images/items-header-20261012/art-failure-native.png) |
| 已处置档案 | [离线](images/items-header-20261012/archive-390.png) · [模拟器](images/items-header-20261012/archive-native.png) |

## 复查

```text
node --test wechat/tests/collection.test.cjs
node wechat/tools/verify-items-header.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File wechat/tools/verify-items-header-native.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File wechat/tools/verify-items-header-navigation-native.ps1
```

浏览器布局检查依赖playwright，素材导出依赖sharp，使用本机工作区依赖即可。微信自动化需先检查开发者工具状态，在本机非沙箱环境运行。

仅本地可审阅版本；没有部署云函数、创建云端数据或上传体验版。

## 20:00 图标与数量调整

按用户截图重绘三个入口图标，保留SVG并导出144×144透明PNG；数量22→30px，仍使用真实持有总数。72组离线布局复查通过，正常、窄屏／大字体及主模拟器截图已更新。微信模拟器使用6件隔离演示物品核对三图标无加载失败，结束恢复原账户。此前组合返回限制保持原记录，本次没有改动跳转逻辑。
