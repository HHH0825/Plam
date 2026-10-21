# 导航“我的”图标替换 · 2026-10-15

## 交付

按用户第二张截图重绘圆润白猫头像：短耳、淡黄耳内、浅粉腮红、深灰轮廓及两只小爪，移除原肩颈弧线。截图局部只用于对照，运行素材由独立 SVG 生成。

- [可编辑 SVG](../branding/navigation-me-20261015/my-cat.svg)
- [自定义导航 PNG：96×96，2642 字节](../miniprogram/assets/white-doodle/compact-nav-me.png)
- [配置导航 PNG：81×81，2391 字节](../miniprogram/assets/white-doodle/nav-me.png)
- [仅生成两个图标的工具](../tools/prepare-navigation-me.cjs)

两份 PNG 透明背景、同一造型，合计 5033 字节。保留现有 26px 图标区域、文字、选中底色、透明度、点击区域和图片失败回退。个人头像、其他导航图标与页面行为未改动。

## 对照与本地预览

![参考与实现](images/navigation-me-20261015/comparison.png)

以上为参考截图局部及本地组件预览，**不是微信模拟器截图**。参考图本身清晰度有限，不能据此声称逐像素一致。

## 验证

- 现有导航逻辑测试：7 项通过，覆盖路由同步、防重复跳转、新增菜单、筛选隐藏／恢复、账户保护及图标失败回退。
- 本地组件适配：8 组通过（320／390／430px 与 320px 1.3 倍文字，各含“我的”选中／未选中）。检查图标 26×26px、导航高 64px、五个按钮点击区域至少 44×44px、文字完整和页面无横向溢出。
- [机器检查记录](images/navigation-me-20261015/local-results.json)
- [窄屏大字体选中预览](images/navigation-me-20261015/me-320-large-local.png)

微信接口本次返回 `read ECONNRESET`／`APPID_ERROR`，未获得新的微信截图；微信内四页切换、实际“我的”入口跳转及真机显示均待验。本地检查不替代原生验收。未使用 Computer Use，未部署、未上传体验版。

## 重新生成

在配置好 Node 的 sharp 依赖后，于仓库根目录执行以下任一命令，仅生成这两个图标：

```text
node wechat/tools/prepare-navigation-me.cjs
node wechat/tools/prepare-white-doodle.cjs --nav-me-only
```

完整白色手绘素材生成流程也调用同一 SVG 源，避免恢复旧造型。
