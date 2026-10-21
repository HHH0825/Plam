# 新增面板左右大卡片

## 本地调整

- 左侧“记一笔”、右侧“添物品”，等宽等高并排铺满内容区，间距12px、圆角20px。
- 390px下约171×170px；320px下约140px宽、最小156px高。大字体由内容自然撑高，两块同步增高。
- 左淡黄、右浅粉；图标56px，350px以下48px；名称20px，说明12px、常规字重、居中并允许换行。
- 删除标题下“每一笔花费，每一件小物。”和两个右箭头；保留标题、44×44px关闭按钮及底部安全区域。
- 显式覆盖微信原生按钮宽度和边距。仅改客户端面板布局；跳转、关闭后执行、防重复及账户保护逻辑沿用现有实现，无新增素材或接口。

## 验证

- 10组生产模板布局通过：320／390／430／768px × 普通／1.3倍文字，全部使用568px短屏与34px底部安全区；另检查320／390px大字体素材失败回退。检查两列同排、等宽等高、12px间距、两端对齐、说明完整、图标尺寸、常规字重及已删除的小字和箭头。
- 7项现有导航／菜单逻辑测试通过，覆盖关闭后跳转、防重复、物品页原有处理、隐藏菜单、账户切换和素材失败。
- 微信模拟器11项通过：左右顺序、同排等尺寸、12px间距、内容区铺满、56px图标、关闭按钮位置、关闭处理、左侧记账和右侧物品编辑器跳转、无业务写入。使用隔离数据，结束后恢复原账户和请求。
- 在当前项目实际点击：猫爪打开新面板、遮罩关闭、再次打开后点击叉号关闭均成功。最终状态为物品页、`menuOpen:false`、`fixture:false`。
- 真机iOS／Android、系统大字体及系统返回手势未实测。此前根导航页 `navigateBack` 的平台限制仍存在，未将其记为通过；本轮未修改原生页面容器的返回处理。
- 仅本地可审阅版本，未部署云函数、未上传体验版；没有保存任何业务记录。

## 截图与草图

- [微信实际面板](images/add-menu-tiles-20261013/menu-native.png)
- [390px布局](images/add-menu-tiles-20261013/ledger-390-menu.png) · [320px大字体](images/add-menu-tiles-20261013/ledger-320-large-menu.png) · [平板](images/add-menu-tiles-20261013/ledger-768-menu.png)
- [更新后的新增菜单草图](images/ledger-navigation-20261013/concepts/new-menu.png)
- [布局结果](images/add-menu-tiles-20261013/browser-results.json) · [模拟器结果](images/add-menu-tiles-20261013/native-results.json)

复现：设置 `PALM_MENU_TILES=1` 后运行 `wechat/tools/verify-ledger-navigation.cjs`；原生检查为 `wechat/tools/verify-add-menu-tiles-native.ps1`，需先完成微信开发者工具技能门禁。
