# 本地数据、业务与恢复

2026-11-11：2.0.0 纯本地版已上线。运行实现位于 `../miniprogram/local-core/`；本目录是早期导入的兼容入口，不维护第二套实现。

- `store.js`：串行跨表事务、不可变分片、双描述符、校验、保存回执及显式恢复。损坏不清空。
- `runtime.js`：文件预检、数据与控制目录单实例、请求队列、照片持久化及导入切换。
- `business.js`、`ledger.js`、`collections.js`、`analytics.js`、`rules.js`：兼容页面字段的本地业务与整数金额规则。
- `item-page.js`、`scan.js`：分片扫描、可丢弃派生索引及主物品列表分页。
- `gc.js`、`repair.js`：两代引用保护、安全清理、明确确认的修复与中断恢复。
- `integrity.js`、`wx-files.js`：严格UTF-8、SHA256／CRC32及微信文件系统适配。

备份位于 `../miniprogram/pages/local-data/lib/`，提供业务白名单、ZIP校验、整库恢复及控制目录修复。照片为相对标识，备份不含会话和密钥。取消前的迁移实现和测试仅保留为历史资料，最终纯本地构建会移除迁移入口和业务网络依赖。

内部恢复与外部备份分开管理。生成ZIP不等于保存到小程序之外；导入先备份当前资料，明确确认整体替换，不合并。详见[实施记录与限制](../docs/local-first-implementation.md)、[交付步骤](../docs/local-first-release.md)。
