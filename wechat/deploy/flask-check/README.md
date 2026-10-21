# Flask 云函数独立诊断包

这个包只验证 CloudBase Python HTTP 云函数的依赖、启动和 HTTP 路由，不读取小程序账号、数据库、照片或密钥。原后端及本地 5001 配置不变。

## 上传

1. 打开已有测试函数 `plam-flask-check`，进入“函数代码 → 上传代码”。
2. 选择 ZIP 代码包，上传 `palm-flask-check-python310.zip`。直接上传 ZIP，不要解压后再压缩外层文件夹。
3. 保持 HTTP 类型、Python 3.10、监听端口 9000。包内已经包含 Linux x64/Python 3.10 依赖，不需要依赖控制台临时安装。
4. 等待上传和部署成功，确认没有未部署内容；路由 `/flask-check` 继续关联这个测试函数，路径透传保持关闭。
5. 访问现有网关域名加 `/flask-check/`。成功响应含 `"ok": true` 和 `"diagnostic_bundle": "palm-flask-check-v1"`，可确认运行的是这个包。

本包使用明确的 Python 解释器路径、随包依赖和 `/tmp` 工作文件目录。ZIP 根目录包含 `app.py`、`scf_bootstrap` 和 `third_party/`；启动脚本使用 LF 换行，无 BOM，并记录 Linux 0755 权限。

此测试函数未接入业务认证，只用于无私人数据的示例验证，不是可发布的业务后端。不改变任何套餐或权限设置。

## 重新打包

在装有 Python 和 pip 的电脑运行 `python build.py`，首次需要联网下载 PyPI 依赖。脚本只将依赖安装到临时打包目录，不安装进项目或全局环境。输出 ZIP 和 SHA-256 校验文件；依赖的实际版本记录于 ZIP 内的 `bundle-info.json`。

## 验证范围

打包脚本检查 ZIP 完整性、入口层级、依赖存在、启动权限和换行格式。可用 Windows 上的 Python 检查应用路由；Linux Gunicorn/云函数启动必须在云端验证，不能用 Windows 检查替代。上传后的 200 响应才代表云端测试通过。

参考：[CloudBase 启动文件说明](https://docs.cloudbase.net/cloud-function/develop/scf-bootstrap)、[Python HTTP 云函数快速开始](https://docs.cloudbase.net/cloud-function/quickstart/httpfunc/python)。
