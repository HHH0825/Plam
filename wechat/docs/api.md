# 猫爪物帐：小程序接口

> 历史资料。当前小程序是纯本地版，旧后端与部署代码仅在历史提交中查阅。

基础地址：`/api/mp`。除 `POST /auth/login` 外，请求须带 `Authorization: Bearer <token>`。登录凭证由 `wx.login` 获取，后端通过微信 `jscode2session` 换取 OpenID，建立独立用户并返回 7 天有效的随机 token；数据库只保存 token 的 SHA-256 摘要。错误统一为 JSON `{ "error": "原因" }`，无凭证为 401，无权访问或记录不存在为 404，回收站物品到期为 410。响应禁用缓存。

| 用途 | 方法与路径 |
|---|---|
| 微信登录／当前用户／登出 | `POST /auth/login`、`GET /auth/me`、`POST /auth/logout` |
| 修改资料 | `PUT /profile` |
| 物品列表／新增 | `GET /items`、`POST /items` |
| 详情／编辑／移入回收站 | `GET/PUT/DELETE /items/<id>` |
| 照片 | `GET/POST/DELETE /items/<id>/photo`，上传使用字段 `photo`；`GET ?size=thumb` 读取缩略图 |
| 置顶 | `PUT /items/<id>/pin` |
| 已停用的日均目标 | `PUT /items/<id>/daily-target`；权限校验后返回 410 |
| 历史使用／维修 | `GET /items/<id>/usage`（历史只读）、`GET/POST /items/<id>/maintenance` |
| 修改／删除维修记录 | `PUT/DELETE /maintenance/<id>` |
| 已停用的使用写入 | `POST /items/<id>/usage/today`、`POST /items/<id>/usage`、`PUT/DELETE /usage/<id>`；权限校验后返回 410 |
| 处置 | `GET/POST /items/<id>/disposal`、`PUT/DELETE /disposal/<id>` |
| 统计／规则发现 | `GET /stats`、`GET /insights` |
| 月度收藏小报 | `GET /reports/monthly?month=YYYY-MM`，省略月份时为后端当前月 |
| 想买清单 | `GET/POST /wishlist`、`GET/PUT/DELETE /wishlist/<id>` |
| 心愿转换为物品 | `POST /wishlist/<id>/convert` |
| 订阅/分期 | `GET/POST /fixed-expenses`、`GET/PUT/DELETE /fixed-expenses/<id>` |
| 确认实际付款 | `POST /fixed-expenses/<id>/payments` |
| 修改／作废历史付款 | `PUT/DELETE /fixed-expenses/<id>/payments/<payment_id>` |
| 回收站／恢复／永久删除 | `GET /trash`、`POST /trash/<id>/restore`、`DELETE /trash/<id>` |

创建或修改物品示例：

```json
{
  "name": "相机", "category": "摄影器材", "icon_type": "digital",
  "purchase_date": "2025-01-01", "purchase_price": "1200.00",
  "warranty_expires_on": "2027-01-01", "status": "active", "notes": "旅行用"
}
```

`icon_type` 可为 `digital/home/daily/clothing/books/mobility/sports/tools/other`。状态由 `active`（使用中）、`idle`（闲置）、`disposed`（已处置）表示。已处置状态由处置记录决定。金额是最多两位小数的非负十进制值；后端使用整数分存储。维修日期不得早于购买日，处置不能早于已有维修记录。旧使用记录不再限制购买日和处置日的修改。

示例记录：维修为 `{ "maintained_on": "2025-03-01", "cost": "100.00", "description": "清洁" }`；处置为 `{ "disposed_on": "2025-04-01", "method": "sold", "proceeds": "500.00", "notes": "" }`。

使用写入已退役，返回 `{ "error": "使用记录已停用，历史记录仍可查看" }`。无凭证返回 401，无权访问、记录不存在或物品在回收站返回 404；这些校验先于停用提示。旧使用表和详情 `usage_records` 保留，列表与详情中的 `usage_count/used_today/last_recorded_use` 暂时兼容旧读取客户端。`GET /insights` 不再产生 `inactive/unknown_use` 分析卡片；`review_items` 只返回手动闲置，`unknown_usage_items` 固定为空。`review_threshold_days` 仅作旧客户端兼容，当前分析不使用该阈值。

## “我的”页账户概览（2026-10-11）

`GET /auth/me` 在原有 `user` 同级增加 `account_age_days`（正整数或 `null`）：按北京时间注册日期至今天的自然日数计算，注册当天为 1；缺失、无效或未来注册日期返回 `null`。SQLite 无时区时间戳按 UTC 解释，CloudBase 时间戳按其时区转换。不代表累计登录天数，登录和资料修改响应的 `user` 结构保持原样。

`GET /stats` 增加 `held_items`（非负整数）及 `held_purchase_total`（两位小数金额字符串）。仅统计当前账户未删除、状态为 `active/idle` 的物品；金额仅包含购买价，不包含维修、订阅、分期或处置回收。空账户返回 `0` 和 `"0.00"`。原 `total_items/purchase_total` 等历史统计字段保持原口径。

新客户端遇到旧后端缺少字段时显示“—”及同步提示，不用历史总额冒充持有金额。本次无需新增集合、索引或数据迁移；需更新后端代码才能返回新字段。部署材料见 `deploy/cloudbase/me-overview-20261011/`。

2026-10-12个人概览显示优化：客户端对 `held_purchase_total` 满万元／亿元的值派生“约 ¥…万／亿”，使用十进制字符串舍入，不修改接口金额。点击金额展示完整购买总额及持有统计口径；加载、失败、缺少金额字段及账号切换时禁用查看并清除旧值。本次样式与显示调整无需再次部署后端，见 [验证记录](summary-amount-20261012.md)。

## 照片尺寸与版本

上传输入仍限制 5 MB。新上传的清晰 JPEG 最长边不超过 1600px、文件不超过 512 KiB；缩略图最长边不超过 480px、文件不超过 80 KiB。超限时降低质量并缩小尺寸，保持比例、不放大小图，去除元数据。旧清晰照片保持原样；旧照片新生成的缩略图遵守 80 KiB 限制。接口路径、权限和响应字段没有变化。

列表、详情及照片上传后返回的物品包含 `photo_version`：有照片时为不透明版本字符串，无照片时为 `null`。替换照片后版本改变；客户端不得将它解释为文件路径。

`GET /items/<id>/photo?size=thumb` 返回最长边不超过 480px 的 JPEG；省略 `size` 或传 `full` 返回现有清晰照片（最长边 1600px）。其他尺寸值返回 400。两种尺寸均先验证账号和物品权限，回收站或无权限返回 404，未登录返回 401。旧照片在首次请求缩略图时生成，不修改原照片；无需数据库迁移。照片响应继续禁止 HTTP 缓存，客户端仅在当前登录会话内管理临时文件。`v` 查询参数仅供客户端区分版本，不改变服务端权限检查。

## 纪念与目标（已停用）

物品列表和详情为兼容旧客户端返回 `milestones: { "earned": [], "next": null }` 和 `daily_target: null`。历史数据库目标字段暂保留，不参与计算或展示。

`PUT /items/<id>/daily-target` 校验账户与物品归属后返回 410，提示更新；不再写入。相伴天数、曾持有天数及日均净成本继续正常计算。

## 想买清单与订阅/分期（本地候选）

上述新接口在 SQLite 与 CloudBase 使用同一合约。所有写入要求 `Idempotency-Key`（16–100 位字母数字下划线／短横线）；修改、删除、转换和付款还要求读取到的 `If-Match: "<revision>"`。新建记录版本为 0。付款修改／作废使用**费用档案**版本。归属检查先于版本检查；428 表示客户端未提供版本，409 表示陈旧版本，400 表示参数错误，404 表示无权访问或不存在。明确版本冲突要读取并核对新版本；未知结果重试保持原请求编号、内容和版本。

心愿写入示例：

```json
{"name":"耳机","expected_price":"399.00","reason":"通勤使用","category":"数码","review_on":null,"status":"considering"}
```

`name` 必填，日期不默认设置；`status` 为 `considering/declined/purchased`，`purchased` 由转换接口产生。GET 列表返回数组；详情及保存响应包括 `review_days`（未设日期为 null）、`created_on`、`revision`、`similar_items`，以及购入后 `item_id/item_available`。匹配项包含 `match_reason` 和物品照片、状态、编号。转换提交与普通新增物品相同字段，并返回物品响应；新建物品和心愿状态在同一事务提交。已转换再次请求返回同一物品，若该物品已经删除返回 410，不能再次创建。照片随后走已有照片接口，不进入转换事务。心愿删除不删除已转换物品。

费用档案示例：

```json
{"name":"云空间","kind":"subscription","amount":"30.00","cycle":"month","cycle_days":30,"anchor_on":"2026-10-31","service_from":"2026-10-01","service_until":"2026-10-31","item_id":12,"status":"active","notes":""}
```

`kind` 为 `subscription/installment`，创建后不可更改；`cycle` 为 `month/quarter/year/days`，自定义 `cycle_days` 1–3650。分期按月，另外提交 `principal_total`、`periods`（1–600），`amount` 为每期利息／手续费，本金均摊并补尾差。`anchor_on` 必填；服务日期和物品可空；`status` 为 `active/paused/ended`。月末依原始日期推算，二月二十九日年度续期在平年取二月二十八日。更改服务周期而不改原始日期时，从下一未付款日期建立新排期。

GET 列表返回 `{plans: [...], totals: {...}}`。合计字段 `cents/linked_cents/unlinked_cents/principal_cents` 是两位小数**元字符串**（字段名为兼容内部统计），`count` 为付款笔数。单个档案包含 `next_due_on/due_days/remaining_days/next_cycle_index`、`paid_cost`、`paid_principal/remaining_principal/suggested_principal/planned_payment/paid_periods/completed`、`item_available/check_renewal/revision`；详情还包含 `payments`。`planned_payment` 为下一期计划本金加费用；已还清分期为零。

确认付款示例：

```json
{"paid_on":"2026-10-10","amount":"30.00","principal":"0.00","cycle_index":0,"service_until":"2026-11-30","notes":"实际续费"}
```

付款日期不可晚于北京时间今天；服务费用或本金之和必须大于零。本金只有分期接受，累计不超过总本金。`cycle_index` 必须等于档案当前 `next_cycle_index`；付款、费用档案版本与关联物品成本变化共同提交或回滚。可提前付款，但没有后台自动扣费。服务到期日选填，仅确认新付款时可顺便更新费用档案有效期。

付款响应保存当时的到期日、周期、计划金额、实际金额、实际本金、设备编号与名称快照。修改实际金额、付款日、备注、设备通过 PUT；不提交 `item_id` 保留该笔原关联，明确 null 改为独立费用。DELETE 将其作废而非物理删除，同时更新汇总与周期进度。历史作废后该周期可以重新确认；已还完本金仍不可超额。

物品列表和详情增加 `fixed_expense_total`；净成本 = 购买价 + 维修 + 已付关联服务费／分期利息手续费 − 处置回收。分期本金不加入净成本。统计 `fixed_expense_total` 为当前可见物品关联费用合计，`all_fixed_expense_total` 包括独立费用和删除设备历史；发现中的月份增加 `fixed/principal`。账本按账户批量汇总，不为每件物品单独追加查询。

迁移、索引、费用示例、部署包与测试说明见 [功能交付](purchases-20261010.md)。客户端统一名称为“订阅/分期”，内部路由和字段保持不变；当前云端列表接口 404 与客户端兼容提示见 [2026-10-11 核对记录](subscription-20261011.md)。

## 月度小报

月份严格使用 `YYYY-MM`，非法或未来月份返回 400。日期以北京时间自然日为准，当前月截止今天，历史月截止当月最后一天。

```json
{
  "month": "2026-10", "today": "2026-10-03", "cutoff_date": "2026-10-03", "is_current": true,
  "totals": { "purchase_count": 1, "purchase_total": "48.00", "maintenance_total": "0.00", "disposal_total": "0.00", "cashflow_net": "48.00", "usage_count": 0 },
  "purchases": [{ "id": 1, "name": "陶杯", "icon_type": "daily", "purchase_date": "2026-10-02", "purchase_price": "48.00" }],
  "memories": [],
  "purchase_leaders": [{ "id": 1, "name": "陶杯", "icon_type": "daily", "purchase_price": "48.00", "share": "100.00" }],
  "has_activity": true
}
```

`memories` 固定为空。购入、维修、回收及已付订阅/分期按各自事件日期归月，金额使用整数分汇总后返回两位小数字符串。新增 `totals.fixed_expense_total`、`totals.installment_principal_total`。`totals.cashflow_net` = 本月购置支出 + 维修支出 + 已付服务费及分期利息手续费 − 处置回收；分期本金单列，不叠加。负值表示回收超过本月支出，不等于物品累计净成本。`purchase_leaders` 列出当月购买价最高的全部并列物品；`share` 是每件购买价占当月购置支出的百分数字符串，保留两位小数；总购置支出为零时返回 `null`，无购入物品时返回空数组。

`totals.usage_count` 已弃用，为兼容旧客户端固定返回 0；旧使用记录不参与 `has_activity` 判断。物品事件仅查询当前账号未删除物品，包含已处置物品的历史记录；订阅/分期账本不随物品删除，独立费用也统计。零金额购入、维修或处置事件也属于有记录的月份。历史小报不保存快照，更正记录、付款或删除恢复物品后会重新计算。迁移见 [本轮说明](purchases-20261010.md)。

客户端月度汇总展示（2026-10-12）：`cashflow_net` 的原始符号与精度不变，正值显示“本月净支出”、负值显示“本月净回收”，金额均使用绝对值；零值及负零显示“本月收支持平 ¥0.00”。`has_activity: false` 时预览显示“本月暂无收支”，完整小报沿用空状态。客户端通过字符串派生展示，不将金额转为浮点数。物品累计净成本及日均净成本的负值保持原样。没有新增字段、接口或迁移，无需更新后端。详见 [验证与截图](monthly-balance-20261012.md)。
# 云端照片补充

私有 COS 直传的凭证、提交、下载接口及 `X-Palm-Photo-Transfer` 响应头协议见 [照片接入说明](cloud-photos-cos.md)。上传申请 JSON 使用 `size_bytes` 与 `content_type`，签名不会出现在业务 JSON 或请求回执中；本地 SQLite 照片接口继续保留。

## 收纳位置（本地候选版本，2026-10-11）

所有接口使用现有账户会话，位于 `/api/mp`。位置为单层清单，位置编号为正整数。

| 方法与路径 | 参数 | 返回 |
|---|---|---|
| `GET /storage-locations` | 无 | `{locations: [{id,name,revision,count,...}], unassigned_count}` |
| `POST /storage-locations` | `{name}`，必填，去首尾空白后 1–40 字 | 201，新位置与 `revision:0` |
| `PUT /storage-locations/:id` | `{name}`，`If-Match: "revision"` | 新位置版本 |
| `DELETE /storage-locations/:id` | `If-Match: "revision"` | 逻辑删除后的行与新版本 |
| `POST /storage-locations/assign` | `{storage_location_id: id或null, items:[{id,revision}]}` | `{items:[{id,revision,storage_location_id,storage_location_name}]}` |

写操作发送稳定的 `Idempotency-Key`，未知提交结果复用原编号、原参数重试。批量操作必须明确提交目标位置；`null` 表示清除关联，缺少该键返回 400。每批 1–50 个不重复物品，全部先检查账户归属、未删除、使用中/闲置及读取版本，再在同一事务中提交。任一冲突 409 整批回滚，跨账户或已删除 404 整批回滚；成功仅增加相关物品版本，不改变金额与状态。

位置重名返回 409 / `LOCATION_NAME_EXISTS`、`retry_same_request:false`，位置删改版本条件与既有 `ITEM_VERSION_CONFLICT` 协议一致。位置删除不删除物品；失效关联统一解析为未设置。`count` 与 `unassigned_count` 只统计使用中、闲置且未进回收站的物品。已处置物品保留最后有效关联供详情查看，不允许再分配。恢复回收站物品时保留仍有效的位置。

物品列表和详情增加 `storage_location_id`（整数或 null）、`storage_location_name`（字符串或 null）与 `revision`。物品新增、编辑及心愿转换接受可选 `storage_location_id`。旧客户端编辑未发送该键时保留原值；明确发送 null 才清除。云端位置接口未同步时，客户端编辑将省略该键，保留已有位置。详情计算规则、照片协议与订阅账本不变。

迁移、部署材料和验证记录见 [收纳位置交付说明](storage-locations-20261011.md)。本次尚未部署。

## 云端已有物品写入的版本条件（待部署候选协议）

CloudBase 物品及回收站响应增加非负整数 `revision`，旧记录缺失按 `0`。修改已有物品资料、目标、置顶、照片、维修/处置记录、删除及恢复/永久删除回收站时，发送读取时的版本，例如 `If-Match: "7"`。严格使用带双引号的整数，不使用通配符或多版本列表。新增物品不要求此头。本地 SQLite 合约保持原样。

先验证所属账号；越权仍为 404，匿名或撤销会话仍为 401。缺少版本返回 428 / `CLIENT_UPDATE_REQUIRED`，格式错误返回 400 / `INVALID_ITEM_VERSION`，版本陈旧返回 409 / `ITEM_VERSION_CONFLICT`；以上错误带 `retry_same_request: false`。客户端保留表单，读取并确认最新内容后才能用新编号、新版本重新提交，不自动覆盖。

版本与业务写入同一事务核对。相同请求编号的已完成回执先于版本检查重放；去重指纹包含 `If-Match`，同编号变更版本不能复用。无版本头的历史回执保留原指纹。数据库暂时冲突或丢失响应的未知结果仍使用原编号、原版本与原内容重试，不能把所有 409 都视为明确版本冲突。

上传票据绑定 `base_revision`，票据申请、等待处理名额后、提交写入事务分别验证当前版本。照片竞争失败保留原照片，新生成文件由既有私有维护清理；不新增公开清理入口。资料写入成功后的照片重试沿用保存后版本，只重试照片，不再次提交旧资料。

## 物品封面扩展（2026-10-11）

- `GET /api/mp/auth/me` 返回 `capabilities.item_cover_icons: true` 和整数 `capabilities.item_cover_icons_version: 3`。目录版本1支持原40个、版本2支持90个、版本3支持100个；未声明有效版本时，新前端仅开放原40个。能力缺失或读取失败均禁用图标写入，允许重新检查和原照片功能。
- 物品新增、编辑、列表、详情、心愿转换及小报购入记录增加 `cover_mode: "photo" | "icon"`、`cover_icon_key: string | null`。回收站记录同样返回封面字段。
- 图标编号白名单见 `backend/palm/covers.py` 的100项 `ICON_KEYS`，与可编辑素材目录 `branding/beauty-icons-20261018/catalogue.json` 一致；原90个编号与资源保持不变。空编号使用现有物品类型插画；图标不修改分类或 `icon_type`。
- 旧请求不提交封面字段时保留当前封面；旧记录没有封面字段时，有照片显示照片，否则显示类型插画。提交未知编号或任意URL返回400。
- 新增图标物品提交 `cover_mode:"icon"` 及对应编号。编辑提交这两个字段时携带 `If-Match` 和原有请求幂等标识；SQLite封面写入也使用持久化事务收据。同一请求重试返回相同结果，版本冲突返回409，缺少版本返回428。
- 将照片物品保存为 `icon`，在同一事务中修改图标、清空照片关联并更新物品版本。CloudBase事务内加入现有存储清理队列；SQLite在数据库提交后调用现有照片及缩略图清理。纯本地版不随事务删除文件，改为由“清理无引用照片”在两代资料都不再引用时回收。事务回滚不删除原照片。
- 新照片上传提交成功时才设置 `cover_mode:"photo"`；未完成的上传保留之前的封面。没有已保存照片时直接提交 `cover_mode:"photo"` 返回400。照片上传凭证、提交及下载接口路径不变。
- 心愿转换仍在现有事务中创建物品和更新心愿，新增封面字段不改变每个心愿只能转换一次的规则。
- 无新增接口路径、云端集合或索引。部署与迁移说明见 [预设图标封面](item-covers-20261011.md)。

## 个人主体会员虚拟支付（2026-10-15）

新增接口、通知接收方案和安全配置见 [虚拟支付接入与验收](virtual-payment-20261015.md)。购买默认关闭；`/payments/wechat/notify`是签名云函数转发接口，不是公开XML回调URL。


## 会员工具精简（2026-10-16）

历史版本的会员权益如下；当前免费工具及套餐口径以文末“整理工具免费开放（2026-10-25）”为准。`ad_free` 是未来广告接入后的免广告权益，当前程序没有投放广告。

已移除 `GET /api/mp/member/bills`、`POST /api/mp/member/bills/<id>/confirm` 及日历专用的 `GET/PUT /api/mp/member/plans/<id>/book`，均返回404。免费 `/fixed-expenses` 及单笔 `/fixed-expenses/<id>/payments` 不变；历史付款和已保存的账本归属保留。不新增集合、字段迁移或公开管理接口。

账本、流水整理、预算与外观接口保留。标签与自定义分析接口已于2026-10-17下线，不保留空读取兼容；历史文档不删除。预算“沿用上月额度”改为客户端先读取上月配置填入草稿，再按本月版本号保存；读取不产生写入。新增“免费版与会员”页面仅展示功能、当前终端价格和原服务约定，不发起付款。


### 账本整组排序（2026-10-17）

- `GET /api/mp/member/books` 保留 `books`，增加 `order_revision`（初始为0）。正在使用的账本按账户保存的顺序返回，归档账本在后；默认账本可以在任何位置。
- `PUT /api/mp/member/books/order` 接收 `{ "book_ids": ["default", "<账本ID>"] }`，必须包含当前账户全部正在使用账本，且不重复、不包含归档账本。要求登录、现有 `Idempotency-Key` 和 `If-Match: "<order_revision>"`；2026-10-25起不要求有效会员。
- 返回 `{ "book_ids": [...], "order_revision": <新版本> }`。列表已变化返回409；缺失版本返回428；账本集合不完整或无效返回400。响应丢失时先读取列表核对，再复用同一请求标识重试。
- 在现有 `palm_member_documents` 保存账户的 `kind=book_order`、`id=current` 文档。排序在单一事务中写入，新建、归档、恢复、删除账本同步更新版本；新增与恢复默认追加到末尾。
- 旧账户读取时不写入迁移记录；首次修改沿用已有顺序。旧账本 `order`、`sticker` 字段保留兼容，新客户端不再编辑或展示这两个字段。小报外观的贴纸字段不变。


### 标签与会员自定义分析下线（2026-10-17）

`/member/tags`、`/member/tags/<id>`、`/member/entries/<id>/tags`、`/member/analysis/run`、`/member/analysis-presets`及其单个方案接口全部移除，返回404。流水响应不再包含会员标签，保留账本归属与`member_revision`。基础`/ledger/statistics`、`/stats`、`/insights`、预算及原支付接口不变。旧版账本依赖标签读取接口，必须更新前端。历史标签及分析方案文档不批量迁移或删除。

## 手账外观免费开放（2026-10-17）

`GET/PUT /api/mp/member/appearance` 保留原地址、字段、版本及幂等协议，所有已登录账户均可读取和保存。`saved` 与 `effective` 均返回已保存设置；不再随会员到期失效。会员专属权益只含 `ad_free`、`books`、`budgets`。已有外观文档不迁移，预算及账本写权限不变。

## 外观贴纸下线与工具折叠（2026-10-17）

外观接口地址、配色／模板字段、登录、版本和幂等规则不变。读取历史外观时将 `saved.sticker` 和 `effective.sticker` 返回为空字符串，不重写历史文档。PUT接受但忽略旧 `sticker` 字段，只保存配色与模板；`catalog.stickers` 返回空列表。原账本历史字段兼容不变。工具折叠偏好仅保存在本机，按服务环境、账户ID和页面隔离，不新增接口或集合。


## 喵粒签到、容量与每日问候（2026-10-17）

所有接口要求登录；云端写入沿用 Idempotency-Key 和事务收据，本地奖励写入同样要求请求编号。所有日期、签到周和奖励由服务器北京时间确定。金额字段为整数喵粒，不支持充值、提现或转赠。

| 接口 | 用途 |
| --- | --- |
| GET /api/mp/rewards | 返回服务器日期／时间、余额、七天签到、容量、五档兑换目录、邀请信息和问候文案 |
| POST /api/mp/rewards/checkin | 提交服务器日期 date，当天只领取一次；不同请求编号也不会重复发放 |
| POST /api/mp/rewards/redeem | 提交 expected_extra 与 expected_price，核对当前累计额外容量及价格后事务扣币＋扩容1格 |
| POST /api/mp/rewards/invitation | 获取或创建不透明分享码；注册时 auth/login 可附带 invite_code，仅新建身份事务内绑定 |
| GET /api/mp/rewards/transactions | 当前账户最近30笔独立喵粒流水 |
| POST /api/mp/rewards/greeting | date领取当天唯一问候展示资格，返回show及delivery_token；如果返回前页面离开，可用相同date及delivery_token、not_shown=true释放未展示标记 |

capacity 包含 base、extra、used、free_limit、limit、unlimited、can_add、max_extra；有效会员 limit=null，免费限额仍保存在free_limit。GET /membership 和 GET /stats 同步返回capacity；有效会员entitlements新增unlimited_items。

使用中、闲置及已处置档案均计数，软删除不计数；创建／恢复事务检查限额并更新同一账户钱包计数，删除在同一事务释放容量。免费超额创建／恢复返回409、code=ITEM_CAPACITY_REACHED及capacity，已有查看和编辑不受限。首次写入时分页核对完整旧数据，不批量重写历史物品。会员到期不移除永久兑换容量。

签到5/5/5/5/8/10/12，邀请有效新用户120；每格扩容价格按累计额外格数1–5/6–20/21–50/51–100/101–200分别为60/100/160/200/260。旧账户、老用户访问和分享操作本身不构成邀请奖励。失败、重复及并发操作通过业务唯一记录和事务隔离处理。


### 2026-10-21 订阅／分期首笔付款与账目删除

`GET /auth/me` 的 `capabilities.fixed_expense_quick_add: 1` 表示支持新增计划同时记首笔付款。

`POST /fixed-expenses` 保留原字段。`amount` 始终表示每期服务费或分期每期额外费用，不能当作分期实付总额。可选：

```json
{
  "initial_payment": {
    "paid_on": "2026-10-20",
    "amount": "5.00",
    "principal": "500.00",
    "notes": "首期已付",
    "enable_ledger": true
  }
}
```

`initial_payment` 仅创建时可用。实际付款日期按北京时间不得晚于当天，费用与本金之和必须大于零，本金不得超过计划本金总额。订阅本金为零。未启用记账时必须明确 `enable_ledger: true`；已启用记账时可为 false。计划、启用记账、付款与账目同一事务提交，依旧需要 `Idempotency-Key`。返回更新后计划及 `initial_payment_created`、`initial_payment_id`。不要根据不完整响应自行追加付款；按已返回计划 ID 读取详情核对。

`DELETE /ledger/entries/:id` 现在支持订阅与分期自动账目。响应的 `deletable: true` 是删除入口能力，`editable` 仍控制修改入口。删除需账目 `If-Match` 和现有幂等键，在同一事务中逻辑作废对应付款与账目、更新计划版本及费用／本金进度。退款阻拦、账号归属与并发版本检查保持生效；计划、其他付款和手填服务有效期保留。订阅页作废付款共用同一个处理函数。

不新增接口路径、集合、索引或环境变量。旧后端仍支持仅保存计划；不返回能力标记时前端禁用首笔选项，不返回 `deletable` 时不提供自动账目删除。


## 整理工具免费开放（2026-10-25）

`GET /api/mp/membership` 新增 `free_entitlements: ["books", "budgets"]`，所有已登录账户均返回此字段。有效会员的 `entitlements` 仅为 `ad_free`、`unlimited_items`；免费／已到期账户仍为 `active=false`，付费权益为空。状态、到期时间和容量语义不变。

正式 `plans` 仅为 `[{"id":"month","name":"月会员","price_cents":290,"months":1}]`，安卓和苹果同价；独立小额支付测试仍按既有测试目录返回。`promotion` 保留 `active=false`、`feedback_message`，新增 `announcement_id`、`announcement_title`，新公告版本为 `free-tools-month-290-v1`。公告更新不表示促销或自动续费。

现有 `/member/books`、账本修改／删除／排序、`/member/entries/move`、`/member/budget` 写入不再检查付费会员；登录、账户所有权、归档限制、事务、版本和幂等检查保留。非默认账本记账及保留的订阅付款路由也免费。客户端必须读取当前服务声明的免费能力；缺失字段提示更新服务，不伪造付费状态。

`POST /api/mp/pay/order` 对 `quarter`、`year` 返回410及`code=PLAN_RETIRED`；旧月价客户端提交390／450分与新目录不符时返回409，要求重新核对价格，不静默扣款。旧订单继续以不可变快照中的商品、价格和自然月时长查单／发放／退款。仅月商品映射是新购必需配置，无新增数据库迁移或路由。
