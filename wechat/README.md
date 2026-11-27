<p align="center">
  <img src="docs/promo/hero.png" width="1000" alt="PALM 与猫爪物账：管理喜欢的物品，记录生活的花费">
</p>

<h1 align="center">猫爪物账 · 微信小程序</h1>
<p align="center"><strong>收好每件小物，记清每笔收支。</strong></p>
<p align="center">2.0.0 已上线 · 全部工具免费 · 无需登录 · 手机本地保存</p>
<p align="center">全程用 Vibe Coding 做出来的个人小玩具，欢迎随手试试。</p>
<p align="center">
  <a href="#立即体验">立即体验</a> ·
  <a href="#功能一览">功能一览</a> ·
  <a href="#本地数据与备份">备份与恢复</a> ·
  <a href="#开发与测试">源码开发</a> ·
  <a href="https://github.com/HHH0825/Plam/issues">反馈与建议</a> ·
  <a href="../README.md">了解 PALM 网页版</a>
</p>

> 猫爪物账已改为纯前端本地版。物品、账目和照片保存在当前手机，不需要部署业务服务器、开通 CloudBase 或配置登录与支付。首次下载和未下载的分包仍需通过微信获取；代码包已下载后，核心记录功能可离线使用。

## 立即体验

**微信 → 搜一搜 → 搜索「猫爪物账」→ 进入小程序。**

<p align="center">
  <img src="docs/promo/wechat-search.png" width="900" alt="请在微信搜一搜输入：猫爪物账。物品管理、日均成本、日常记账。">
</p>

搜索图仅用于手动搜索指引。无需注册账户，打开后即可在当前手机开始记录。

## 功能一览

| 想做什么 | 可以怎样记录 |
|---|---|
| 整理拥有的物品 | 建立档案，添加照片或选择图标，按分类、状态与收纳位置查找 |
| 了解物品的陪伴与成本 | 查看持有天数、日均净成本，记录维修与处置 |
| 规划想买的小物 | 整理想买清单，购入后转为物品档案 |
| 随手记下一笔 | 记录日常收入、支出和退款，回看每月流水 |
| 看清花费去向 | 使用账本、月度预算、收支日历和分类统计 |
| 管理长期付款 | 管理订阅／分期计划与付款；新增时可选记录首笔，撤销付款与对应账目联动 |
| 回顾一个月 | 生成物品收藏小报与收支小报，主动保存或分享 |
| 留住自己的记录 | 回收站、完整 ZIP 备份、从聊天文件恢复与内部异常恢复 |

物品、记账、统计、我的四个主栏目，配合物品图标、小猫插画和本机外观设置。所有工具免费，不设商业性物品数量限额；实际可保存量受设备空间与微信文件系统限制。取消会员购买、容量兑换、邀请奖励及趣味签到，保留日常问候和普通好友分享。

<p align="center">
  <a href="docs/promo/items.png"><img src="docs/promo/items.png" width="240" alt="物品档案示例：相机、水杯与帆布包的相伴天数和日均成本"></a>
  <a href="docs/promo/ledger.png"><img src="docs/promo/ledger.png" width="240" alt="记账示例：月度支出、收入与日常流水，金额为虚构数据"></a>
  <a href="docs/promo/statistics.png"><img src="docs/promo/statistics.png" width="240" alt="统计示例：按日期查看收入、支出和退款，金额为虚构数据"></a>
</p>
<p align="center"><sub>物品档案 · 日常记账 · 收支统计。虚构数据的离线渲染预览，并非真机截图；点击可查看原图。</sub></p>

## 本地数据与备份

资料保存在**当前手机、当前微信小程序的文件目录**，不会自动上传到开发者的业务服务器，也不会自动跨手机同步。清理微信小程序数据、卸载、设备损坏或换手机可能导致资料丢失；开发者无法远程找回未备份的本机记录。

1. 在「我的」底部横向备份状态栏进入「资料与完整备份」。
2. 点击「生成完整备份」，再点击发送／分享按钮，在微信分享面板中选择接收方，例如文件传输助手（以设备实际支持为准）。
3. 确认 ZIP 已保存在聊天、电脑等小程序之外的位置且能重新选择后，点击「确认已保存到外部」。系统会清理小程序内对应的临时 ZIP；未确认的导出正常只保留最新一份，另有手动清理入口。
4. 恢复时选择「选择聊天中的 ZIP 备份」，核对日期与资料数量。先备份当前资料，再明确确认**整库替换**；不合并两台设备的记录。

完整备份含物品、历史、回收站、账目、设置与照片，默认不加密，请妥善保管。内部恢复副本用于写入异常恢复，不能代替保存在外部的备份。详细步骤见[本地使用与备份](docs/local-first-usage.md)。

## 给旧云端版本用户

因为使用人数较少，为让工具能够继续维护，本项目停止提供原云端存储，改为完全免费的本地版。本次取消过渡和自动迁移，**旧云端物品、账目与照片不会在新版自动显示，也不会自动保存到手机**。对此带来的不便，我们深感抱歉，感谢理解与支持。

新版从本机资料库开始使用；已有本机资料和本应用的完整备份可以继续使用。历史云端代码仅作留档，不代表旧云服务仍然可用。

## 关于这个小玩具

猫爪物账从第一版到现在，全程用 **Vibe Coding** 开发。我和 AI 一边写、一边在手机上试，慢慢把物品整理和记账做进同一个小玩具。欢迎体验，也欢迎分享你用起来顺手或别扭的地方。 [GitHub Issues](https://github.com/HHH0825/Plam/issues)

反馈时带上小程序版本、设备和复现步骤。截图请遮挡个人资料和账目，**完整备份请留在自己的设备或聊天里**。

## 与本地网页版的关系

猫爪物账与上一级 PALM／物物记本地网页版共享项目理念，但**资料库和照片独立，不会自动同步**。小程序不依赖本地网页版，也不需要运行 Python 后端。

旧小程序服务端、云部署目录和相关测试已从当前版本移除，需要回顾时可以查 Git 历史。旧版发布工具只对应当时的源码。前端源码里的旧页面兼容逻辑仍由纯本地构建裁剪。

## 源码更新与发布状态

- **当前线上版本：2.0.0 纯本地版**。作者于 2026-11-08 确认已正式上线，本次于 2026-11-11 同步源码与说明。
- 保留 26 个页面 URL，旧会员、权益和喵铺地址兼容进入本地资料说明；正式构建移除业务云、登录、支付及迁移通道。
- 文件存储使用分片、串行事务、校验、保存回执及两代恢复版本；写入失败或资料损坏不会静默初始化为空。
- 前端回归覆盖本地业务、跨资料表写入、备份恢复、照片引用和临时备份清理。自动化与模拟器结果不等于安卓／苹果所有设备均已验证，详见[实施记录](docs/local-first-implementation.md)。

## 开发与测试

| 目录 | 用途 |
|---|---|
| `miniprogram/` | 页面、组件、素材与可编辑开发源码；默认本地模式，仍含历史兼容代码 |
| `miniprogram/local-core/` | 本地业务、持久化、事务、查询、统计与恢复实现 |
| `miniprogram/pages/local-data/` | 资料管理、完整备份与恢复界面；最终构建裁剪历史迁移代码 |
| `local-core/` | 早期本地模块的兼容导入入口及说明 |
| `tools/local-template/` | 最终纯本地启动与业务入口模板 |
| `react-pilot/` | 收纳位置 React 试点，包含共享契约和原生桥 |
| `tests/`、`tools/` | 回归测试、纯本地构建与验收工具 |
| `docs/`、`branding/` | 使用文档、宣传素材、插画源文件与素材清单 |

使用 Node.js 24.18.0、npm 11.16.0 和微信开发者工具。压缩器随工具锁文件安装。在仓库根目录构建原生纯本地版。

```powershell
npm ci --prefix wechat/tools --ignore-scripts
node wechat/tools/build-local-variants.cjs
```

用微信开发者工具导入 `test-results/local-builds/local-source/`（可编辑纯本地项目）或 `test-results/local-builds/local/`（压缩项目），替换为自己的 AppID。**正式编译与上传使用这两个构建目录**，不要把仍含历史兼容实现的 `wechat/miniprogram/` 直接当成最终发布包。构建会检查业务网络／云登录／支付残留及包体预算；过渡构建已禁用。

当前版本无需配置云环境、AppSecret、数据库或支付密钥。生成目录、日志、数据库、个人设置与交付 ZIP 不提交到 Git；源代码、测试和运行素材完整保留。

### React 收纳位置试点

安装试点依赖后，构建命令会同时生成原生版和试点版供对照。完整前端回归在构建后运行。

```powershell
npm ci --prefix wechat/tools --ignore-scripts
npm ci --prefix wechat/react-pilot --ignore-scripts
npm run build:weapp --prefix wechat/react-pilot
node --test 'wechat/tests/*.test.cjs'
```

在微信开发者工具导入 `test-results/local-builds/local-react-pilot/` 做隔离预览。AppID 只改本机预览副本，保留原始构建以便按清单核对哈希。组件开发可用 `npm run dev:weapp --prefix wechat/react-pilot` 监听 Taro 输出，再运行完整构建更新可导入项目。要回退到原生收纳页面，使用同次生成的 `local/`，两种构建使用同一资料与备份格式。试点真机状态见[验收结果](docs/react-refactor/results.md)。

## 构建与更多文档

- [本地版使用与备份](docs/local-first-usage.md) · [2.0.0 发布与构建说明](docs/local-first-release.md)
- [本地数据与恢复实现](local-core/README.md) · [测试记录与限制](docs/local-first-implementation.md) · [本地隐私说明](docs/local-first-privacy.txt)
- [工程成熟度评估与 React 收纳位置试点设计](docs/react-refactor/README.md)
- [GitHub 源码同步](docs/github-upload.md) · [云服务关闭指引](docs/local-first-cloud-shutdown.md) · [宣传素材来源](docs/promo/README.md)
- 历史资料：[订阅／分期更新](docs/subscriptions-20261021.md) · [开发历史](docs/development-history.md)

`tools/package-local-first.py` 用于复刻本机 2026-11-06 交付档案，需要当日验收证据；它不是干净克隆后开发的前置条件。日常构建使用上面的 Node 命令即可。GitHub 更新不会自动上传微信、提交审核或创建云资源。

## 许可证

小程序使用免费，源码采用 [PolyForm Noncommercial 1.0.0](LICENSE)；超出许可范围的商业使用须另行取得书面授权，可通过 [GitHub Issues](https://github.com/HHH0825/Plam/issues) 联系作者。历史 MIT 授权见 [NOTICE](NOTICE)，第三方材料仍遵循原许可。
