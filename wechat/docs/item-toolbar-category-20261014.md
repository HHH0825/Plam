# 物品工具栏精简与分类合并（2026-10-14）

## 本地交付

- 删除“我的物品”页常驻搜索框及列表上方重复的件数，保留页头真实持有总数。
- 三个黄色入口下方统一排列搜索圆形按钮、筛选圆形按钮和排序胶囊；保留当前排序名称、筛选徽标及至少 44×44px 点击区域。
- 点击搜索展开输入行并聚焦，收起后保留关键词标签；清除关键词不影响状态和分类筛选。原筛选取消／确认、排序偏好、列表返回位置及三个入口继续使用。
- 已处置档案保留常驻搜索及数量行，未应用持有页的精简样式。
- 新增／编辑物品移除自由分类输入，原“物品类型”改名“分类”，只保留九项预设选择；新增默认“其他”。选择同时更新现有 `category` 名称和 `icon_type` 标识。
- 旧物品打开编辑时按原 `icon_type` 显示预设分类，只有保存才更新服务端原自定义分类；不批量改历史数据。草稿恢复和心愿转物品同样映射为预设分类。
- 分类改变不替换已选图标或照片；版本冲突将分类作为一个项目展示，保存失败保留填写内容。
- 若发现仅因分类规范化而不同的旧版未确认提交，使用原请求内容和原回执先重试；成功后留在当前表单，提示再次保存预设分类。未确认的照片提交同样保留原内容，不换编号重复建档。

## 截图

微信截图使用隔离示例，未提交保存；核验结束恢复原账户、请求传输和存储。浏览器截图使用真实模板和样式近似渲染。

| 内容 | 微信模拟器 | 窄屏／大字体 |
|---|---|---|
| 精简物品页 | [物品页](images/item-toolbar-category-20261014/items-native.png) | [320px](images/item-toolbar-category-20261014/items-normal-320.png)、[1.3 倍文字](images/item-toolbar-category-20261014/items-normal-320-large.png) |
| 展开／收起搜索 | [展开搜索](images/item-toolbar-category-20261014/search-native.png)、[关键词标签](images/item-toolbar-category-20261014/chip-native.png) | [窄屏搜索](images/item-toolbar-category-20261014/items-search-320-large.png) |
| 单一下拉分类 | [编辑表单](images/item-toolbar-category-20261014/editor-native.png) | [新增表单](images/item-toolbar-category-20261014/editor-new-390.png)、[大字体编辑](images/item-toolbar-category-20261014/editor-edit-320-large.png) |

另见：[大字体排序和筛选徽标](images/item-toolbar-category-20261014/items-sorted-320-large.png)、[已处置档案](images/item-toolbar-category-20261014/disposed-archive-390.png)、[平板](images/item-toolbar-category-20261014/items-normal-768.png)。

## 验证

- 客户端全套 **241 项通过**，含本次新增 6 项行为验证：九项分类与封面保持、旧分类加载不写入及失败保留、旧提交先原样恢复后更新、账户隔离和多个未确认提交保护、搜索清除不影响筛选、账户切换及心愿转换。旧草稿测试更新为预设分类，同时继续核对其余文字、日期、金额和照片完整恢复。
- 浏览器 **35 组通过**：物品默认、展开搜索、关键词标签、最长排序与徽标、已处置档案、新增及编辑表单；每组覆盖320／390／430／768px及320px 1.3倍文字／568px短屏。检查无页面横向溢出，工具栏位于入口下方，点击区达标，无自由分类输入，档案仍有搜索与数量。
- 微信编译物品、已处置档案、编辑页共6个模板／样式文件，15项原生检查通过，覆盖工具栏尺寸、搜索、筛选取消、升序排序、三个入口及分类选择。入口使用模拟器点击，搜索和分类使用运行时处理器；子页面之间通过切回物品导航继续核验，系统返回手势仍待真机。原生工具记录见下方 JSON。
- 新增／修改／失败／重试及旧提交恢复在隔离客户端测试中验证；模拟器不调用保存接口，不修改真实物品数据。

机器记录：[验证摘要](images/item-toolbar-category-20261014/verification.json)、[浏览器](images/item-toolbar-category-20261014/browser-results.json)、[微信](images/item-toolbar-category-20261014/native-results.json)、[素材及包体](images/item-toolbar-category-20261014/package-audit.json)。完整客户端测试日志位于 `wechat/.qa-ledger-tmp/item-toolbar-client-tests.log`。

## 使用与未测项

本轮仅客户端修改，**重新编译即可，无需更新后端**；无新增接口、集合、字段、索引或迁移，也无新增运行素材。历史自定义分类只有编辑保存时才替换，不执行批量修改。

未部署云函数、未上传体验版。iOS／Android 真机、系统键盘与大字体、返回手势、横向触摸、生产环境保存及跨设备版本冲突仍待实测；本轮未自动发送测试反馈或写入真实账目。
