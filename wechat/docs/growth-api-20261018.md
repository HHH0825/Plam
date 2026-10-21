# 递进签到与成长册接口

复用登录态、账户隔离、`member_documents`、余额流水及现有事务。所有写请求携带现有 `Idempotency-Key`；客户端不能指定奖励金额、进度或领取用户。

## 读取

`GET /api/mp/rewards` 保留现有余额、容量、喵铺、邀请和问候字段。`checkin.days` 按第1—7次签到返回，增加 `step`；`claimed_count` 为本周次数，`next_step` 为下一档，`today_claimed` 仍表示实际北京时间当天是否已领取。旧 `date` 字段保留兼容，但不再用来决定奖励档位。

`advertisement` 返回 `enabled:false, reward:10, used_today:0, daily_limit:3`。本轮没有广告发奖接口，点击不能增加次数或余额。

新增 `achievements` 数组，每项包含 `id/category/name/target/reward/progress/achieved/claimed`。类别为 `visits/items/ledger`；固定ID按类别及门槛构成，如 `visits_3`、`items_100`、`ledger_300`。表格共14档，奖励总计810喵粒。

## 写入

- `POST /api/mp/rewards/checkin` 继续接收 `{date}`，日期须等于服务端北京时间日期。奖励由本周已签到次数决定；返回 `awarded` 和 `already_claimed`。老签到记录按次数衔接，旧金额不改。
- `POST /api/mp/rewards/visit` 接收 `{}`，服务端记一次当天到访，返回完整商店状态和 `already_visited`。已登录前台进入及登录成功后调用，失败可重试；不是代签，不自动发币。
- `POST /api/mp/rewards/achievements/<固定ID>/claim` 接收 `{}`，返回完整状态、`awarded` 和 `already_claimed`。未达成或未知ID返回400；重复领取不加币。所有领取与余额入账同事务完成。

成长文档保存到访次数、物品最高有效数量、手动账目当前及最高数量、已领取ID。每日到访保留独立日期记录，奖励有独立流水；首次初始化穷尽历史有效记录，不按第一页计数。物品新增／删除／恢复与手动账目写入更新最高进度，编辑或反复恢复不能累计刷笔数。GET不写数据库；首次到访或相关写操作才持久化初始化。

`GET /api/mp/membership` 保留 `promotion:{active:false,feedback_message:...}` 供旧客户端读取普通公告；不再返回促销标签、截止时间或活动正文。当前目录售价不变。

无需新集合或环境变量。索引复用现有物品、会员文档及流水的账户分页索引。CloudBase和SQLite遵循同一套计算和去重规则。
