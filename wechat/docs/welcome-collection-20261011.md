# 登录首页「小猫的收藏盒」改版

日期：2026-10-11。仅修改登录前首页及其本地素材、专用布局参数；后端与账户接口不变。

## 结果与参考

- [微信模拟器首页](images/welcome-collection-20261011/home-native.png)
- [确认草图与实现对照](../branding/login-collection-20261011/comparison.html)
- [390px 主对照](images/welcome-collection-20261011/390.png)
- [320px 短屏](images/welcome-collection-20261011/320-short.png)、[320px 大字体](images/welcome-collection-20261011/320-large-font.png)
- [430px](images/welcome-collection-20261011/430.png)、[平板](images/welcome-collection-20261011/tablet.png)
- [原生加载中](images/welcome-collection-20261011/loading-native.png)、[失败重试](images/welcome-collection-20261011/failure-native.png)、[素材失败回退](images/welcome-collection-20261011/art-fallback-native.png)

保留草图的居中品牌、两行手绘标题、黄色收藏盒小猫、便签、相机示例卡、三个介绍图标、黄色登录长按钮与爪印装饰。唯一指定视觉变化为「小猫的收藏手账」使用 11px 淡玫瑰色文字，无底色、边框或胶囊，旁边保留黄色短线。页面不绘制平台状态栏、导航胶囊与手势区域。

示例卡明确标记「示例数据」，不调用保存接口；相伴 365 天、日均净成本 ¥1.28/天均为界面示例。品牌名、正文、数字、状态、说明与按钮文案为原生文字；手绘标题有无障碍文案与文字回退。

## 适配与操作

内容最大宽度 430px，390px 左右各 22px，宽屏居中。插画等比显示。短屏和大字体允许正常纵向滚动，数字空间不足自动换行，没有固定按钮覆盖正文。三个功能图标仅作说明，不提供跳转。

登录继续调用原有 `getApp().login()`，保留 busy 防重、禁用与加载状态、失败提示、重试清错及会话自动进入物品页。修复了微信 `style:v2` 的按钮默认宽度覆盖问题，原生按钮填满指定区域。

## 验证记录

| 验证 | 结果 | 边界 |
|---|---|---|
| 前端回归 | 28/28 通过 | 复用原登录、凭据、失败与防重回归；同文件其他既有回归通过 |
| 生产模板布局 | 9/9 通过 | 320/390/430/768px；320 短屏；320/390 的 1.3 倍文字；加载、失败、全部图片回退 |
| 微信模拟器 | 16/16 通过 | iPhone 14 Pro Max 模拟器，实际窗口 430×834；原生素材、按钮宽高、重复点击、失败重试、成功导航请求、已有会话与图片回退 |
| 模板编译 | 通过 | 微信 WXML 编译产物成功，原生页面已实际显示 |
| 素材预算 | 271,818 B（265.4 KiB） | 18 张透明 PNG 与手绘边框嵌入样式，低于 300 KiB 目标 |
| 包体静态核对 | 855,293 B | 按现有打包排除规则核对本地未压缩运行文件；不是实际上传产物；91 处静态素材引用均可用 |

布局检查核对无横向溢出、重点数字和按钮文案不裁切、标签透明无边框、装饰不截获点击、介绍区无按钮、底部说明可滚动到达。390px 默认文字下正文和说明可在常规窗口显示；短屏及大字体会增高。微信模拟器中的按钮尺寸为 364×62px。截图对照后确认猫咪、盒子和便签保持完整，未拉伸。

登录测试使用隔离内存 Promise 与导航记录，不向后端发出登录写入，不修改真实账户或持久会话。成功检查验证请求了原物品页路径；本轮未进行真实微信授权。结束后原登录方法、会话判断和导航均已恢复。

- [布局结果](images/welcome-collection-20261011/browser-results.json)
- [原生结果与几何](images/welcome-collection-20261011/native-results.json)
- [素材清单](../branding/login-collection-20261011/runtime-manifest.json)
- [生成方式与最终提示词](../branding/login-collection-20261011/prompts.md)
- [包体引用核对](../branding/login-collection-20261011/package-audit.json)

## 维护与复现

源码：`miniprogram/pages/login/`、`miniprogram/utils/layout.js`。草图、生成源与可编辑 SVG 仅在 `branding/login-collection-20261011/`，位于小程序根目录之外。运行素材仅在 `miniprogram/assets/welcome-collection/`。示例卡使用独立的手绘边框小片，不改变物品列表或详情的边框。

复现脚本：`tools/prepare-welcome-art.cjs`、`tools/verify-welcome-collection.cjs`、`tools/verify-welcome-native.ps1`。原生脚本必须在可访问开发者工具的本地环境运行，使用隔离模拟并在 finally 中恢复。

**交付为本地可审阅版本。未部署云函数，未上传体验版。** 小米 K80 Ultra、实体 iPhone/Android、大字体系统设置和真实微信授权未实测，仍需真机补核；窄屏与大字体截图来自实际生产模板的浏览器渲染，不标注为微信真机截图。

## 15:22 后的示例卡微调

- 边框改成独立的草稿风描边：深灰主笔、浅灰断续复描和轻微自然起伏，四角与边线分段拼接。
- 「使用中」去掉粉色底，改为玫瑰色圆点与文字。
- 「示例数据」移到右上角，改为深黄色文字、浅黄色底与虚线描边。标题区可换行，大字体时不会与左侧标题重叠。
- 最新首页、390px、320px 大字体等截图已更新。9 组生产模板检查通过，新增核对标题与演示标签不重叠、演示标签位于正文上方、状态文字背景透明；微信模拟器也已核对并保存[原生几何结果](images/welcome-collection-20261011/sample-refresh-native-results.json)。
- 登录逻辑未变，前面的登录回归记录继续适用；加载中、失败和回退的原生截图保留为上一轮验证证据。
