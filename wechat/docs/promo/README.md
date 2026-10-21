# README 宣传素材

用于仓库首页和小程序 README。物品、记账、统计预览全部使用虚构样例，不包含真实账户、私有照片或云端请求；界面来自当前源码的离线浏览器渲染，不是手机实拍或微信真机截图。

## 编辑与导出

| 文件 | 用途 |
|---|---|
| `hero.svg` / `hero.png` | 1200×560 双版本横幅；可编辑SVG与README展示PNG |
| `wechat-search.svg` / `wechat-search.png` | 1200×280 手动搜索指引；搜索词为“猫爪物账” |
| `wechat-search-white.png` | 提供的设计包中的原始反白标志，保持原比例与原始像素 |
| `items.png`、`ledger.png`、`statistics.png` | 390×844逻辑尺寸、2倍像素的界面示例 |
| `render.cjs` | 横幅、搜索卡及三个界面预览的可重复导出脚本 |
| `sources.json` | 具体来源、原始标志校验值及设计参考记录 |

`hero.svg` 复用现有登录插画，保留相对资源引用；编辑时保持本目录与 `miniprogram/` 的相对位置。PALM 标志来自根目录的 `static/images/palm-logo.svg`。重建脚本应从完整仓库运行，需要 Node.js、可解析的 `playwright` 包与已安装的Microsoft Edge；可通过 `EDGE_PATH` 指定其他安装位置。字体使用系统的微软雅黑或苹方，不分发字体文件。

```powershell
node wechat/docs/promo/render.cjs
```

导出过程不依赖微信登录，也不连接线上服务。重建依赖现有UI检查辅助脚本和虚构测试样例；这些是文档制作依赖，不是小程序运行依赖。

## 素材与参考

- **小猫插画**：项目已有的 `miniprogram/pages/login/assets/hero.png`，不重复分发大尺寸原稿。
- **微信搜一搜标志与规范**：来自用户提供的《微信搜一搜物料设计指引_20211125_karinhu.zip》。仅提取本次实际使用的反白标志；未分发整包PDF、字体、视频、AI模板或其他品牌示例。绿色为指引所列的 `#07C160`，标志按比例使用，搜索区域单独留白。
- **界面示例**：读取当前 WXML/WXSS，使用虚构的相机、水杯、帆布包与测试收支；仅用于说明物品档案、记账和统计页面，不展示尚未正式发布的订阅表单或删除联动。
- **版式参考**：[Memos](https://github.com/usememos/memos) 的简短介绍与体验入口、[LocalSend](https://github.com/localsend/localsend) 的入口导航、[Immich](https://github.com/immich-app/immich) 的功能对照。只参考信息组织，不复制其文案或图像。

微信搜一搜标志属于其权利人；这里用于说明进入小程序的搜索方式，不代表微信官方背书。项目源码许可证不替代第三方标志、素材或字体各自的权利与使用规则。搜索卡是静态图片，不提供输入、自动搜索、排名保证或虚构跳转。
