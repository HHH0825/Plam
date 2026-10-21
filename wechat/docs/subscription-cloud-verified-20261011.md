# 订阅/分期云端同步后复核 · 2026-10-11

用户自行创建集合、索引并更新云函数后，在原有环境 `cloud1-example` 进行只读复核。当前微信模拟器使用真实云端传输，`getApp()._purchasesQA` 未启用。

## 已确认

- `GET /api/mp/fixed-expenses`、`GET /api/mp/wishlist`、`GET /api/mp/items` 均返回传输 HTTP 200、业务状态 200；原订阅列表根路径的 404 已消失。
- `palm_wishlist` 包含升序组合索引 `user_id, _id`。
- `palm_fixed_expenses` 和 `palm_expense_payments` 均包含升序组合索引 `user_id, _id` 及 `user_id, item_id, _id`。
- 上述五个组合索引均为非唯一、非稀疏，无部分过滤条件。
- 真实订阅页面为正常空列表，汇总为零；`listReady=true`、`loading=false`、`featureUnavailable=false`，页面错误和关联物品错误均为空。
- 实际点击“新增订阅/分期”后进入表单，关联物品读取成功；随后返回列表，未填写或保存记录。

截图：[真实云端正常空列表](images/subscription-20261011/available-live-native.png)。

## 本次范围

仅查询接口、索引和页面状态，以及打开、关闭新增表单；未创建业务记录、确认付款、变更云端结构、再次部署函数或上传客户端。此前文档的“未部署”描述是当次交付状态；本记录确认的是用户后续同步之后的只读结果。

新增保存、付款、更正、作废、事务及真实多设备并发未在本次云端复核中执行，不能由读取成功推断这些写入流程均已通过。
