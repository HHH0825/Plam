# 订阅／分期进度条简洁版

## 实现

- 列表和详情共用进度组件：删除奶黄内框、端点猫爪和凸起效果，白色卡片内增加浅灰细分隔线。
- 轨道8px，底色 `#EEEDE8`、填充 `#F4CE63`，两端圆角，无渐变、阴影或动画。16px粉色猫爪位于标题旁，不影响点击。
- 正常天数使用28px数字与14px单位，作为一个布局整体；状态文字18px，可换行。标题14px、日期及付款说明12px。窄屏优先将整组天数放到下一行。
- 组件仅拆分现有 `progress.value` 的字号展示，输入接口和计算保持原样。更新为过期等状态时清除先前数字。素材失败隐藏猫爪，其余内容仍显示。
- 列表取消重复的外部付款日期、管理状态；关联物品单独显示。详情保留服务有效期、费用和付款历史。
- 暂停／结束继续使用灰色，临近到期使用浅粉。未知比例不虚构填充，已还清不显示轨道；北京时间日期、付款及跨午夜刷新逻辑未修改。
- 三个物品页入口、筛选和其他页面样式保持当前版本。无接口、数据库或后端修改。

## 视觉对照与素材

- [确认草图](../branding/subscription-progress-simple-20261012/approved-sketch.png)
- [粉色猫爪可编辑SVG](../branding/subscription-progress-simple-20261012/progress-paw.svg)：复用原有四趾猫爪，仅更换颜色。
- 运行PNG 64×64，透明背景，1,531B；源文件和草图在小程序目录外。包引用检查通过，运行文件原始合计1,098,172B；此数值不是上传压缩包大小。

## 验证

| 验证 | 结果 |
| --- | --- |
| 既有日期及业务测试 | 17项通过；覆盖自然日、月末／闰年、提前付款、同日有效期、日期缺失、付款／编辑／作废、冲突、跨午夜与账号切换 |
| 离线生产模板布局 | 32组通过：320／390／430／768px × 普通／1.3倍文字 × 568／844px高度 × 列表／详情 |
| 离线状态覆盖 | 正常、临近到期、当天、过期、未开始、起止日期缺失、同日起止、暂停、结束、分期、已还清和极长天数；数字完整、单位不拆分、无整页横向溢出 |
| 微信模拟器 | 14项通过：8px轨道、16px标题猫爪、正确比例、数字观察更新、进度区域点击进入详情、付款／编辑入口、返回列表、紧急／过期切换及素材失败回退 |
| 隔离验证 | 模拟器使用内存数据，阻止写入；实际写入请求为零，完成后恢复账户与请求方法 |

首次模拟器检查发现数字容器的 `overflow-x:auto` 会产生多余滚动条，已移除并重新通过布局及模拟器检查。猫爪位于组件内部，自动化点击改为组件宿主，实际进度区域点击进入详情验证通过。

### 截图及结果

- 微信：[列表](images/subscription-progress-simple-20261012/subscriptions-native.png)、[详情](images/subscription-progress-simple-20261012/subscription-detail-native.png)、[临近到期](images/subscription-progress-simple-20261012/urgent-native.png)、[过期](images/subscription-progress-simple-20261012/expired-native.png)。
- 离线：[390px详情](images/subscription-progress-simple-20261012/subscription-detail-390.png)、[320px大字体列表](images/subscription-progress-simple-20261012/subscriptions-320-large-short.png)、[320px大字体详情](images/subscription-progress-simple-20261012/subscription-detail-320-large-short.png)。
- [32组布局结果](images/subscription-progress-simple-20261012/browser-results.json)、[14项模拟器结果](images/subscription-progress-simple-20261012/native-results.json)。

离线检查使用真实模板、样式和组件观察器，不能替代微信设备渲染。微信模拟器验证为当前设备配置；其余宽度、大字体和短屏由离线检查覆盖。iOS／Android真机、系统大字体、长时间前台跨午夜及真实付款／编辑／作废后的云端同步未实测；相关业务通过既有可控测试验证。未部署云函数，未上传体验版。

## 重现

- 逻辑：`node --test wechat/tests/expense-progress.test.cjs wechat/tests/purchases.test.cjs`
- 布局：设置 `PALM_PROGRESS_SIMPLE=1` 后运行 `wechat/tools/verify-subscription-progress.cjs`；需本机Playwright依赖及Edge。
- 模拟器：完成微信开发者工具技能门禁后，运行 `wechat/tools/verify-progress-simple-native.ps1`。
- 素材：`wechat/tools/prepare-progress-paw.cjs`；需Sharp依赖。
