# 文档数据库验证包（先验证，再迁移）

这个包使用 Python 通过 CloudBase 官方 HTTPS API 操作文档数据库，不需要 VPC。是否能在当前环境取得管理员 API Key、调用事务接口，仍须实测。本包没有正式用户、物品或照片数据，也没有密钥。

## 1. 现在这个弹窗怎么填

| 配置 | 填写内容 |
| --- | --- |
| 集合名称 | `palm_cloud_probe` |
| 权限设置 | 最后一项 **无权限 [ADMINONLY]** |

点击“确定”。这里的“无权限”禁止客户端直接读写；服务端管理员凭证仍可操作。先只建这个测试集合。

## 2. 获取服务端凭证

按照官方 API Key 文档，进入环境的 **环境配置 → API Key 管理**，查看是否能创建**管理员 API Key**。不同控制台入口可能叫“环境管理”；云函数的环境配置中也有“API Key 设置”，可选择已有 Key 注入。

- 需要管理员 API Key；Publishable Key（发布密钥）、匿名密钥或普通用户 access_token 不能替代。
- 密钥只在本机交互式终端或云函数环境变量中填写，不发到聊天，不放进小程序、代码或 ZIP。
- 如果当前套餐只能创建发布密钥，先停止验证并提供隐藏密钥值的“类型/权限”截图。不能靠开放集合权限使测试通过；下一步可评估普通 Node.js 云函数使用服务端 SDK 的方案。
- 控制台中 `flexdb / tnt-example` 是数据库选择信息。本验证默认使用官方 API 的 `(default)` 实例和数据库映射；不要凭页面 URL 推测连接参数。若控制台连接信息明确要求其他实例或库，再设置 `CLOUDBASE_DB_INSTANCE`、`CLOUDBASE_DB_NAME`。

## 3. 推荐先在电脑上验证（无需另建云函数）

打开项目终端，执行：

```powershell
Set-Location .\wechat\backend
$env:CLOUDBASE_ENV_ID = 'cloud1-example'
..\.venv\Scripts\python.exe -m cloudbase_probe.check
```

程序会提示输入管理员 API Key，输入不会显示。仅在本次进程内使用，不写入文件。如果已经设置 `CLOUDBASE_API_KEY` 或平台注入的 `CLOUDBASE_APIKEY`，程序读取该环境变量。

测试包括：

1. 新增、读取中文测试物品；
2. 更新并校验整数金额（分），包括负数；
3. 同一事务中修改物品并新增维修记录，然后回滚，确认两项都撤销；
4. 同一事务中修改物品并新增维修记录，提交后确认两项均保存；
5. 删除本次生成的测试记录，并确认不存在。

每次运行约三十次数据库请求，不是压力测试。不要反复运行。代码只操作固定集合和本次随机 ID，删除前检查 `probe_run` 标记，不删除集合或已有业务数据。网络中断后的写入结果可能不确定；程序会尝试回滚和清理，若不能确认，会列出 `remaining_test_ids` 以及事务清理状态。

`remaining_test_ids` 表示曾尝试写入但无法确认已清理的 ID，不代表已经确认存在。`cleanup_status` 为 `verified` 表示清理已核实，`unverified` 表示不能核实，`not_needed` 表示首次写入被明确拒绝、无需清理。首次返回 `403 DATABASE_PERMISSION_DENIED` 时，程序会停止后续操作并提示核对管理员 Key，不再把未尝试写入的维修记录列为残留。

所有检查完成且返回 **`ok: true`、`cleanup: true`**，才算云数据库验证通过。`/healthz` 正常或集合创建成功不能替代上述验证。

## 4. 可选：在云函数中验证

上传文件：**`palm-cloudbase-probe-python310.zip`**。它包含已通过校验的 Linux Python 3.10 Flask/Gunicorn 依赖。

建议创建独立函数 `palm-db-check`：

| 配置 | 值 |
| --- | --- |
| 类型 | HTTP 云函数 |
| 运行环境 | Python 3.10 |
| 端口 | 9000 |
| 内存 | 先沿用 256 MB |
| 执行超时 | 90 秒，原来的 3 秒不够跑完整验证 |
| 网络 | 现有公网访问即可 |

如果控制台不允许 90 秒，先用第 3 节本机验证，不要为测试升级套餐。配置环境变量：

| 变量 | 值 |
| --- | --- |
| `CLOUDBASE_ENV_ID` | `cloud1-example` |
| `CLOUDBASE_API_KEY` | 服务端管理员 API Key；也支持平台注入的 `CLOUDBASE_APIKEY` |
| `PALM_CLOUD_PROBE_ENABLED` | `1` |
| `PALM_CLOUD_PROBE_TOKEN` | 另设一个至少 32 位的随机验证口令，不能使用管理员 API Key |

口令可在本机生成后直接复制到控制台，不发到聊天：

```powershell
wechat\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(32))"
```

HTTP 网关关联 **云函数 HTTP → palm-db-check**，访问路径 `/db-check`，路由启用，路径透传关闭。请求由本验证包检查独立口令；本测试路线不依赖网关的用户身份认证。跨域设置保留默认，本机 Python 请求无需增加浏览器跨域白名单。

浏览器访问 `https://你的网关域名/db-check/healthz` 只检查服务是否启动。执行完整验证必须在项目根目录的交互式终端运行：

```powershell
wechat\.venv\Scripts\python.exe wechat\deploy\cloudbase-probe\check_remote.py https://你的网关域名/db-check/probe
```

提示输入的是**独立验证口令**，不是管理员 API Key。不要把口令放入地址栏。函数拒绝请求参数和上传内容；同一进程内限制一分钟一次。多个云函数实例仍可能分别接受请求，因此不要并行调用。验证完成后将 `PALM_CLOUD_PROBE_ENABLED` 改为 `0`。

### 常见结果

| 结果 | 下一步 |
| --- | --- |
| 401 / 403 或鉴权错误 | 核对 Key 类型、环境及权限，保持集合 ADMINONLY |
| 集合或数据库不存在 | 核对集合名称、默认库映射和连接信息 |
| 事务失败 | 保存不含密钥的返回结果，先不要迁移业务 |
| `NETWORK_ERROR` / 超时 | 查看函数日志、套餐用量及 `remaining_test_ids`，不能假定没有写入 |
| 503 验证未开启 | 检查开关及独立口令；缺少管理员配置会显示变量名 |
| 429 | 等至少一分钟，避免重复请求 |

如果返回 `DATABASE_PERMISSION_DENIED`，先到当前环境的 API Key 管理页核对输入的是管理员 **API Key（api_key）**，不是 **Publishable Key（publish_key）**，并确认 Key 属于 `cloud1-example`。这条错误本身不能证明需要付费升级。若管理员类型和环境都正确仍被拒绝，再用返回的 `request_id` 排查平台权限/策略，不要开放集合读写来绕过鉴权。

## 5. 验证通过后再改正式后端

本次新增的是独立连接器和验证服务，**正式 PALM 后端仍使用 SQLite**，本地端口仍为 5001。没有自动迁移用户、会话、物品、维修、处置、回收站或照片。

云端验证通过后，才逐步替换这些功能的数据访问层，并验证用户隔离、并发写入、事务和回收站恢复；照片单独迁移到云存储。修改限定在 `wechat/`，原电脑版继续使用现有配置。文档数据库不是 SQL 的直接替换，需要逐个改写查询与约束。

## 本地构建与检查

从项目根目录执行：

```powershell
wechat\.venv\Scripts\python.exe -m unittest discover -s wechat\tests -p test_cloudbase_probe.py -v
wechat\.venv\Scripts\python.exe wechat\deploy\cloudbase-probe\build.py
```

构建器只打包白名单源码和已验证 ZIP 中的 `third_party/` 依赖；校验依赖包 SHA256、ZIP 完整性、启动脚本 LF 换行及 Linux 可执行权限。若旧依赖包缺失或改变，会停止构建。

### 官方依据

- [NoSQL HTTP API 概览](https://docs.cloudbase.net/http-api/nosql/nosql-restful-api)
- [接口完整 OpenAPI 定义（包括事务）](https://docs.cloudbase.net/openapi/en/nosql.v1.openapi.yaml)
- [管理员 API Key 使用说明](https://docs.cloudbase.net/http-api/basic/apikey)
- [云函数访问 CloudBase 资源，含 Python HTTP API](https://docs.cloudbase.net/cloud-function/resource-integration/cloudbase)

这些文档确认接口协议；本机模拟测试不能确认你的套餐权限或当前环境是否开放该接口。
