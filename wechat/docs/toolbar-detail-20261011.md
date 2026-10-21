# 物品入口与详情微调 · 2026-10-11

## 本地修改

- 三个黄色入口等宽铺满内容区，间距8px、左右18px，内容最大宽度480px。图标22px、文字13px；320–374px自动改成上图标下文字，大字体在内容放不下时也统一改为纵向。三个入口始终同排，文字可换行。
- 筛选和排序的浅灰可见底色缩至36px，圆角12px、图标15px、文字12px；外层点击范围至少44px。筛选生效时保留黄色底与条件数量。
- 收纳位置移至基本资料整张卡片下方、订阅/分期入口上方。基本资料收起后仍显示位置，已处置物品仍显示最后收纳位置。
- 陪伴与花费复用已有四角、四边手绘素材，透明度35%；白底、原费用数字和布局不变。右上角淡黄色弧线透明度45%。素材失败时回退为普通浅灰细边框，装饰不接收点击。
- 未新增图片；手绘边框样式限定在框内，列表沿用原有深色描边。没有修改接口、费用规则或后端材料。

## 验证

- 43项相关前端回归通过：筛选重置与确认、导航隐藏与恢复、排序基础逻辑、重复跳转保护、返回定位、详情展开、位置关联及账户隔离。
- 实际WXML/WXSS在本地浏览器渲染20个场景：320、390、430、768px，1.3倍字号、基本资料展开/收起、长位置名称、大金额/负金额、已处置、暂无费用及素材回退。无横向溢出，三个入口等宽且内容居中。
- 浏览器检查直接调用客户端入口尺寸判断方法；正常字号可见胶囊36px、点击范围44px。布局截图不等同于真机测试。
- 13项微信模拟器检查通过，覆盖三个入口、筛选/排序、详情折叠、位置更换和素材回退。检查结果和实际尺寸见 [native-results.json](images/toolbar-detail-20261011/native-results.json)，布局结果见 [layout-results.json](images/toolbar-detail-20261011/layout-results.json)。模拟器使用隔离内存示例，云端写入为0；结束后恢复真实连接。

## 截图

- [微信模拟器首屏](images/toolbar-detail-20261011/entries-native.png)
- [筛选弹层](images/toolbar-detail-20261011/filter-native.png)
- [详情收起](images/toolbar-detail-20261011/detail-collapsed-native.png)
- [详情展开](images/toolbar-detail-20261011/detail-expanded-native.png)
- [普通边框回退](images/toolbar-detail-20261011/detail-fallback-native.png)
- [320px入口](images/toolbar-detail-20261011/entries-320.png)
- [390px大字体入口](images/toolbar-detail-20261011/entries-large-font-390.png)
- [320px大字体详情](images/toolbar-detail-20261011/detail-large-font-320.png)

## 同步状态

本轮为本地可审阅客户端版本，未部署云函数、未上传体验版。小米K80 Ultra及其他真机的字号、点击与滚动表现待补测。

复现：`node wechat/tools/verify-toolbar-detail.cjs`；微信模拟器运行 `wechat/tools/verify-toolbar-detail-native.ps1`。需要本机Edge、已登录的微信开发者工具；模拟器脚本不调用云端写操作。
