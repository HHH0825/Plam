# 双端支付与维护者工具：手动上线步骤

本次代码包仅为待部署候选。没有修改云端数据，没有给真实账户赠送会员，没有发起真实支付，也没有发布小程序。默认关闭新收款。代码测试不能代替新版本的云端3秒冷启动和手机支付验收。

## 交付内容

目录：`wechat/deploy/cloudbase/membership-dual-platform-20261016/`

| 文件 | 用途 |
| --- | --- |
| `palm-api-membership-dual-platform-python310.zip` | 更新现有Python 3.10 HTTP云函数 `palm-api` |
| `palm-pay-notify.zip` | 更新现有Node.js 20.19普通云函数 `palm-pay-notify`，执行方法继续为 `index.main` |
| `palm-member-maintainer-windows.zip` | 解压在电脑本地使用，不能上传为云函数 |
| `catpaw-miniprogram.zip` | 小程序前端，解压到独立文件夹后用微信开发者工具导入；不含本机私有配置 |
| `upload-manifest.json`、各包 `.sha256` | 文件大小、SHA-256及未部署标记 |
| `palm-api-env.example.json` | 配置参考；密钥是占位符，不要整体覆盖现有配置 |
| `resources-delta.json`、`database-prerequisites.json` | 本次复用资源与完整核对清单 |

个人设置中的用户ID已经移到显示名称上方，说明小字已删除，复制及账号隔离保护保留。

## 1. 准备正式商品

微信公众平台 → 支付与交易 → 虚拟支付 → 基本配置 → 道具配置。使用普通道具、自定义关联；本方案为手动续费，不是自动扣款订阅。

| 商品 | 道具ID | 价格（元） | 时长 |
| --- | --- | ---: | --- |
| 安卓月会员 | `catpaw_vip_month` | 3.90 | 1个自然月 |
| 安卓季会员 | `catpaw_vip_quarter` | 9.90 | 3个自然月 |
| 安卓年会员 | `catpaw_vip_year` | 29.90 | 12个自然月 |
| 苹果月会员 | `catpaw_ios_month` | 4.50 | 1个自然月 |
| 苹果季会员 | `catpaw_ios_quarter` | 11.50 | 3个自然月 |
| 苹果年会员 | `catpaw_ios_year` | 33.90 | 12个自然月 |

安卓商品已存在时只核对，不重复创建。苹果商品分别创建、审核并发布；必须在上方“线上版本”中看得到。发布后留出平台同步时间。你提供的截图中苹果IAP已开通，无需重复申请，但仍需核对简称与手机付款面板。

如果平台不允许上述苹果售价，或付款面板显示不同金额，保持苹果购买关闭，记录实际情况后再调整方案，不临时改成其他价格。本次代码不会接受客户端自定义价格或自动回退到安卓价格。

## 2. 核对数据库

本次不增加集合或SQLite表。只补缺失的下列非唯一升序索引，保留所有原数据和索引：

| 集合 | 索引名 | 字段顺序 |
| --- | --- | --- |
| `palm_member_documents` | `owner_kind_id` | `user_id` → `kind` → `_id` |
| `palm_pay_orders` | `owner_id` | `user_id` → `_id` |
| `palm_pay_orders` | `due_id` | `next_query_at` → `_id` |

三个支付／会员集合 `palm_member_documents`、`palm_pay_orders`、`palm_pay_deliveries` 继续使用仅管理员访问权限。已有 `_id` 去重索引保留，不删除重建集合。

旧账户首次发生赠送、付款发货或退款时会在事务内核对原基线及支付授权。到期日不一致时停止该次写入，不批量覆盖旧会员。

## 3. 更新云函数

先在 `palm-api` 将 `PALM_PAY_ENABLED` 设为 `0`，暂停新下单，保留通知和原单核对功能。

1. 上传新的 `palm-api-membership-dual-platform-python310.zip` 到现有 `palm-api`，保留Python 3.10、监听端口9000及原启动配置。
2. 上传新的 `palm-pay-notify.zip` 到现有通知函数。保留Node.js 20.19、执行方法 `index.main`、256MB及3秒超时，不升级套餐。
3. 保留两个函数现有的微信凭据、CloudBase凭据及相同的 `PALM_PAY_NOTIFY_SECRET`，不重新生成或替换。
4. 通知函数的 `PALM_PAY_RELAY_URL`、`PALM_PAY_RELAY_HOST` 保持原值，继续指向现有 `palm-api` 通知地址。

新旧订单继续核对；旧小程序由于没有终端与展示价格字段，将提示更新后再购买，不能用旧版本作为新支付代码的验收客户端。

## 4. 填写 `palm-api` 配置

| 环境变量 | 值 |
| --- | --- |
| `PALM_PAY_PRODUCT_MONTH` | `catpaw_vip_month` |
| `PALM_PAY_PRODUCT_QUARTER` | `catpaw_vip_quarter` |
| `PALM_PAY_PRODUCT_YEAR` | `catpaw_vip_year` |
| `PALM_PAY_IOS_PRODUCT_MONTH` | `catpaw_ios_month` |
| `PALM_PAY_IOS_PRODUCT_QUARTER` | `catpaw_ios_quarter` |
| `PALM_PAY_IOS_PRODUCT_YEAR` | `catpaw_ios_year` |
| `PALM_PAY_ENABLED` | 先保持 `0`，受控测试准备好后改为 `1` |
| `PALM_PAY_IOS_ENABLED` | 苹果商品和平台条件就绪后，受控测试时改为 `1` |
| `PALM_PAY_TEST_ENABLED` | 受控测试时为 `1`，正式开放时为 `0` |
| `PALM_PAY_TEST_USER_IDS` | 你的实际用户ID；多个ID用英文逗号分隔，无空格 |
| `PALM_PAY_TEST_PRODUCT` | 已发布的 `catpaw_test_month` |
| `PALM_PAY_TEST_PRICE_CENTS` | `1`，单位分，即0.01元 |

原 `PALM_PAY_OFFER_ID`、`PALM_PAY_APP_KEY` 继续使用现网值；`PALM_WECHAT_DEV_LOGIN` 必须保持 `0`。没有新增公开免费开通接口。

测试模式只允许白名单账户购买测试月会员，其他账户关闭新购买；不会把非白名单用户自动转为正式价扣款。正式模式关闭测试价，每个终端使用各自的三档正式目录。

## 5. 保留并启用推送、定时器与权限

| 消息类型 | 事件 | 环境 | 函数 |
| --- | --- | --- | --- |
| `event` | `xpay_goods_deliver_notify` | 当前环境 | `palm-pay-notify` |
| `event` | `xpay_refund_notify` | 当前环境 | `palm-pay-notify` |

操作列显示“启用”时表示尚未启用，需要点击；启用后通常显示“停用”。保留禁止小程序客户端直接调用通知函数的权限规则。

定时器名称 `palm-pay-reconcile`，类型 `timer`，Cron为 `0 */5 * * * * *`。新代码每次最多核对1笔，先持久化轮转位置与下次重试时间，再查微信。原35秒批处理已移除。

通知转发为2.5秒总截止，下游2秒处理预算。未查到已支付、未完成事务或提交结果不确定时不返回发货成功；通过同一原单重试和去重恢复。代码预算不等于已经验证云端冷启动一定能在3秒内完成。

## 6. 更新手机预览并受控验收

在开发者工具重新编译、生成新的手机预览或体验版。先用白名单测试配置，安卓与iPhone分别验证；iPhone微信至少8.0.68。

每次实际付款均由你确认。核对金额、业务订单、微信单号、会员到期日及通知成功；重新打开、重复核对不得重复增加时长。历史订单仍按原金额显示，退款指引按原订单终端显示。

必须检查通知函数冷启动，以及确有待核对订单时的定时查单。空定时器返回成功不能证明补单已经通过。通知丢失、超时重试和退款尚未完成云端验证时，不勾选公众收款通过，不删除原订单或手动改成已支付。

正式价验证应先将 `PALM_PAY_ENABLED=0`，再把 `PALM_PAY_TEST_ENABLED=0`；在尚未公开的预览／体验阶段安排短验证时段开启付款，检查两端三档显示及付款面板。此时开关对所有已有客户端的新下单生效，不再是白名单限定。金额不符时取消付款并关闭该端，不重复付款试错。

## 7. 正式开放与回退

两端手机、原单恢复、通知、冷启动、补单和退款验收通过后：

- `PALM_PAY_TEST_ENABLED=0`、`PALM_PAY_ENABLED=1`；苹果通过时 `PALM_PAY_IOS_ENABLED=1`。
- 开发者工具上传客户端 → 公众平台提审 → 审核通过后发布。
- 某端未通过时保持该端关闭；通知或补单不稳定时保持受控测试，不直接对公众开放收款。

异常时先关闭 `PALM_PAY_ENABLED`，继续处理已付款订单。使用赠送功能后，不回滚到忽略赠送记录的旧退款代码；应保留新授权计算与支付处理能力。

## 8. 给自己免费设置会员

完成新版 `palm-api` 部署后，在电脑上双击 `wechat/tools/member_admin/打开会员维护工具.cmd`。单独工具包的首次安装方法见其README。

按现有云函数配置填写环境、数据库实例／名称及 CloudBase 管理员 API Key，查询你手机个人设置中的用户ID。核对昵称后选择12个自然月、填写“维护者功能测试”，预览到期日，再确认。

手机重新进入猫爪会员页即可读取新身份。每次赠送独立记录，可以逐条撤销，不修改付费订单；赠送可以测试会员功能，但不能代替苹果、安卓实际支付验收。

维护者工具只在本机开放，密钥不保存到文件、浏览器存储或日志。点击“关闭工具”或闲置30分钟后清除会话。响应丢失时保留原预览并重试同一操作，不重新赠送一笔。
