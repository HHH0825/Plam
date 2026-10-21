# 记账接口与数据说明（2026-10-13）

所有路径以 `/api/mp` 开头；使用现有 Bearer 会话和账户隔离。CloudBase 写请求继续要求 `Idempotency-Key`，客户端保存提交编号；SQLite 新客户端也发送该头。写请求只接收 JSON，沿用 64 KiB 请求限制。

## 能力与启用

`GET /auth/me` 新增 `capabilities.cash_ledger: 1`。未提供该能力的服务端不启用记账保存或历史导入。

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/ledger/settings` | 返回 `enabled`、分类及来源配置 |
| POST | `/ledger/settings` | 当前账户开启记账；重复调用安全 |
| GET | `/ledger/entries` | 月度流水、整月概览、筛选合计及下一页偏移 |
| POST | `/ledger/entries` | 手动支出或收入 |
| GET / PUT / DELETE | `/ledger/entries/{id}` | 详情、修改、作废 |
| POST | `/ledger/entries/{id}/refunds` | 对有效支出添加关联退款 |
| GET | `/ledger/operations/{operation_id}` | 查询手动保存、退款或历史批次的已提交结果 |
| GET | `/ledger/statistics` | 月概览、每日收支及分类排行 |
| GET | `/ledger/history` | 历史待核对候选，每页 20 条 |
| POST | `/ledger/history/import` | 原子导入已确认候选，每批 1–20 条 |

流水查询参数：`month=YYYY-MM`、可选 `date=YYYY-MM-DD`、`q`、`kind`、`category`、`source`、`offset`。每页最多 30 条，响应 `next_offset:null` 表示末页。月概览 `summary` 不受日期、搜索／筛选影响，`filtered_summary` 表示完整当前查询；同日按创建时间倒序。

### 每日流水与分组合计（2026-10-13 日历改版）

- `date` 必须是有效的北京时间自然日、属于请求月份且不晚于今天；空值、月外、未来及不存在的日期返回 400。未传仍查询整月，兼容原调用。
- 响应新增 `date`：传入日期的实际回传值，未传为 `null`。客户端必须核对回传值，旧后端忽略日期时不能将整月流水当成当天流水。
- 响应新增 `day_summaries`：以日期为键，值为该日完整筛选结果的 `gross_expense / expense / expense_label / income / refund / net / net_label / count`。先执行日期、搜索、类型、分类和来源筛选，再汇总，最后分页；每页都返回完整合计，不只合计当前 30 条。无匹配日期不生成对应键。
- `summary` 始终是整月；`filtered_summary` 与 `day_summaries` 使用相同筛选范围。当天请求无记录时返回空 `entries`、空 `day_summaries`，当月汇总仍保留。
- `/ledger/statistics?month=YYYY-MM` 无变更；`days` 包含月份中的全部自然日，每日原支出／收入／退款为精确两位小数字符串，供日历与选中日合计使用。

例如 `/ledger/entries?month=2026-10&date=2026-10-13&offset=0` 返回 `date:"2026-10-13"`；有 34 条匹配时，首批 30 条、`next_offset:30`，每日合计 `count:34`。下一页继续携带同一日期。

更新包与验证记录见 [月度面板与统计日历交付](ledger-journal-20261013.md)。本轮无新增字段、集合、索引或数据库迁移。

## 手动账目与退款

```json
{
  "kind": "expense",
  "category": "food",
  "amount": "28.01",
  "occurred_on": "2026-10-13",
  "name": "午餐",
  "notes": "和朋友吃顿饭",
  "item_id": null,
  "operation_id": "ledger-unique-operation-0001"
}
```

- 金额使用正的十进制字符串，最多两位小数；单笔上限沿用 `999999999.00` 元。整数分计算，响应始终两位小数。月合计不经浮点数格式化；图表比例可近似，金额标签保留精确值。
- 支出分类：`food / transport / shopping / home / fun / health / study / other`；收入：`salary / parttime / gift / investment / other`。
- 日期按北京时间自然日验证，不允许未来日期。未填名称使用分类名称。关联物品只用于查询与跳转，不改变物品成本。
- 新增／退款的 `operation_id` 为 16–100 位字母、数字、下划线或连字符；新客户端始终提交。即使换用新的请求回执编号，原操作也不会重复生成。同编号不同内容返回冲突。
- 修改、作废传 `If-Match: "revision"`；添加退款使用**原支出版本**。退款修改／作废会更新父支出版本；父支出改分类会同步退款分类并更新退款版本。
- 退款不能早于原支出，有效退款总额不得超支出。原支出不能作废、改为收入、缩小至退款总额以下或移至退款日期之后，须先处理退款。
- 自动账目来源仍存在时，从原业务更正／作废；物品移入回收站保留现金流水。原来源永久删除后保留名称快照，允许在账单详情更正或作废，变更保留最近 40 次。
- 退款仅冲减发生月份的原分类支出，不计普通收入，不修改购买价格、物品成本或分期进度。

详情包含 `id / kind / category / category_name / amount / occurred_on / source / source_id / source_name / item_id / item_name / item_available / item_removed / editable / state / revision / refunded / refunds / changes`；分期付款还含 `principal / cost / expense_id`。手动支出被选用为购置付款后，原行 `state:linked`，并提供 `linked_entry_id` 跳转，统计只计来源账目一次。

## 汇总口径

`gross_expense` 为原支出，`refund` 为实际退款，展示支出为两者之差的绝对值；退款更多时 `expense_label:本月退款结余`。净额为收入＋退款－原支出，按方向返回 `net_label` 与绝对值 `net`。零值统一 `0.00`，`count` 仅计有效收付记录。

日历明确显示**原支出（未扣退款）／收入**，退款用“退”标记并在选中日期下展示精确金额；分类排行按支出扣退款后的实际净额降序，退款结余类别明确标注，条形归零并保留完整金额。物品分析、小小发现和收藏小报沿用原成本统计，不改用本账本。

## 物品与原业务联动

新增、编辑物品及心愿转换接受可选 `payment_info`：

```json
{"mode":"paid","amount":"399.00","paid_on":"2026-10-12","existing_entry_id":"可选的32位账目ID"}
```

- `paid`：实际付款必须大于零；免费物品选 `archive`。
- `installment`：只记实际首付，可为 `0.00`；后续在订阅／分期确认付款。不把购置总价再次入账。
- `archive`：仅建档，不产生购置现金支出；不需要金额或付款日。
- 编辑显式付款信息需物品 `If-Match`。旧客户端缺失该字段时保留已有选择；无付款确认的新物品进入待核对，不默认全款。
- `existing_entry_id` 只能选本账户有效、未绑定来源、无退款的手动支出；金额、日期必须相同，关联物品为空或为当前物品。原支出与来源绑定同事务完成，不重复记账。
- 启用记账后新维修形成支出，新处置回收形成收入（零元不计流水）；订阅／分期仅确认实际付款时入账。分期一笔为本金＋利息／手续费，拆分保留。
- 原业务保存、来源账目更新、版本变化在同一事务内完成；退款保护失败时原维修／付款等修改一并回滚。

## 历史核对与持久结果

`GET /ledger/history` 每条包含 `source / source_id / name / amount / occurred_on / fingerprint`。购置候选提交时必须补付款方式；其他记录勾选确认。永久删除且尚未入账的旧来源不再重建，避免虚构已丢失的收付。

```json
{
  "operation_id": "history-unique-operation-0001",
  "entries": [{"source":"purchase","source_id":123,"fingerprint":"预览返回值","payment_info":{"mode":"paid","amount":"399.00","paid_on":"2026-10-12"}}]
}
```

提交在事务内重新读取所选来源并比对指纹；任何一条变化、越权或重复选择，整批不导入。成功返回 `imported` ID 数组及 `count`。批次 `operation_id` 结果持久保存，可通过 `/ledger/operations/{id}` 核对；内部回执 `state:batch` 不计入现金流水、退款或统计。旧客户端没有操作号仍可用现有请求回执重放，新客户端必须携带持久操作号。

常见状态：400 校验失败、401 会话过期、404 不存在／非本人、409 版本／来源冲突或未启用、428 缺版本、503 事务／服务暂不可用。`retry_same_request:true` 表示须先核对或用原内容、原请求编号重试；失败不清空表单，未确认结果时禁止更换提交内容。
