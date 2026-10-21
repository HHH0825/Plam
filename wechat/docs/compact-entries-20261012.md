# 物品页三个入口压扁

## 调整

- “想买清单／订阅分期／收纳位置”保留原有图标、淡黄色底和上图下文布局。
- 常规最小高度88→70px，350px及以下80→68px；图标36→30px，图文间距4px，上下内边距8px，圆角16px。
- 三列等宽、等高，列间距8px、下方工具栏间距10px。使用最小高度，大字体自然撑高，不裁切文字。
- 仅改物品页 `header.wxss` 限定样式，覆盖普通和 `entries-stacked` 自适应状态。未修改跳转、素材、接口或后端；处置档案未引入该样式。

## 验证

- 16组离线生产模板布局通过：320／390／430／768px × 普通／1.3倍文字 × 普通／自适应状态。检查高度、图标30px、圆角16px、三列等宽等高、文字完整、点击区域至少44px及无整页横向溢出。
- 普通字体320px实测68.19px，390／430／768px约70px；大字体允许增高。
- 微信模拟器10项检查通过：入口68／70px目标、等宽等高、三个入口实际点击跳转、筛选操作、排序回调及每次入口检查无写入请求。各入口独立检查并等待页面切换完成，避免把异步切换误判为失败。
- 模拟器使用隔离账户和内存读取响应，结束后恢复原账户、请求和本地存储。未提交业务写入。
- 真机iOS／Android及系统大字体未实测；各尺寸和1.3倍文字由离线布局检查覆盖，微信模拟器为当前设备配置。未部署云函数、未上传体验版。

## 截图与结果

- [微信物品页](images/compact-entries-20261012/items-native.png)、[微信筛选弹层](images/compact-entries-20261012/filter-native.png)。
- [390px](images/compact-entries-20261012/normal-390.png)、[320px大字体](images/compact-entries-20261012/normal-320-large.png)、[430px](images/compact-entries-20261012/normal-430.png)、[平板](images/compact-entries-20261012/normal-768.png)。
- [布局结果](images/compact-entries-20261012/browser-results.json)、[模拟器结果](images/compact-entries-20261012/native-results.json)。

复现：设置 `PALM_COMPACT_ENTRIES=1` 后运行 `wechat/tools/verify-items-header.cjs`；微信模拟器检查使用 `wechat/tools/verify-compact-entries-native.ps1`，需先完成微信开发者工具技能门禁。
