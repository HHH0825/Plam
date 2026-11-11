# GitHub源码同步：猫爪物账2.0.0纯本地版

更新日期：2026-11-11。目标为现有仓库`HHH0825/Personal-Asset-Lifecycle-Manager-PALM`，默认分支`main`。当前线上小程序为作者确认已发布的2.0.0纯本地版；源码同步不会再次上传微信、提审、发布或操作云资源。

## 本次同步内容

- 纯本地前端、本地持久化与业务适配、照片、完整ZIP备份与恢复、临时备份清理，以及对应测试和构建模板。
- 根README、小程序README、本地使用与备份、发布状态、隐私说明和实现记录。
- 历史后端及取消前迁移开发的相关源码和回归，保持导入链完整，明确仅供留档与规则对照，不需要部署。
- 运行素材及此前已经跟踪的品牌源文件继续保留；小程序使用免费，源码许可证保持不变。

## 排除内容

`wechat/.gitignore`排除数据库、照片运行数据、虚拟环境、依赖展开目录、私密配置、开发者工具个人设置、ZIP与校验文件、生成交付目录及验收截图。`test-results/`也不提交。

本次不纳入本机的文章草稿、其他宣传草稿和无关目录。忽略文件不会删除它们，也不会自动删除已经跟踪的历史文件。AppID和环境ID是客户端标识，不是AppSecret或访问密钥；真实服务端凭证不应提交。当前发布构建会裁剪历史云配置和业务网络代码。

## 日后如何同步

在仓库根先检查本地与远端，不强制推送：

```powershell
git status --short
git fetch origin
git log --oneline --left-right HEAD...origin/main
```

远端有新提交时先核对并保留更新。只暂存本次准备同步的明确文件路径，检查暂存清单、私密配置和无关文件：

```powershell
git add -- README.md wechat/README.md
# 再按本次实际改动逐项添加小程序源码、文档与测试
git diff --cached --check
git diff --cached --stat
git diff --cached --name-only
```

完整构建与回归通过、确认提交范围后，再提交推送：

```powershell
git commit -m "feat(wechat): 同步2.0.0纯本地版与使用说明"
git push origin main
```

不要直接`git add .`带入无关文件，也不要为解决推送冲突而强制覆盖远端或重置当前工作区。保留已有许可证及其他人的更新。

## 从干净克隆开发

参考[README开发与测试](../README.md#开发与测试)，先提取已安装微信开发者工具中的Terser，再运行`node wechat/tools/build-local-variants.cjs`。导入生成的`test-results/local-builds/local-source/`或`local/`，替换自己的AppID。不需要运行Python后端或开通CloudBase。

历史ZIP交付和本机验收证据不会进入GitHub；`package-local-first.py`用于复刻2026-11-06本机交付，不是日常构建前置条件。当前验证结果见[本次同步检查](github-local-2.0.0-verification.md)。
