"""Request only the fixed probe action; prompt without echoing its access token."""
import getpass
import json
from pathlib import Path
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import build_opener, Request

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from cloudbase_probe.client import _NoRedirect


def main():
    if len(sys.argv) != 2:
        print("用法：check_remote.py https://你的域名/db-check/probe")
        return 2
    url = sys.argv[1]
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or not parsed.path.endswith("/probe"):
        print("请输入不含查询参数的 HTTPS /probe 地址")
        return 2
    if not sys.stdin.isatty():
        print("请在交互式终端运行，口令输入不会显示")
        return 2
    token = getpass.getpass("独立验证口令（不是 CloudBase API Key）：")
    if len(token) < 32 or not token.isascii() or any(c.isspace() for c in token):
        print("验证口令格式不正确")
        return 2
    req = Request(url, data=b"", method="POST", headers={"Authorization": "Bearer " + token})
    try:
        with build_opener(_NoRedirect()).open(req, timeout=95) as response:
            result = json.loads(response.read(1024 * 1024))
    except HTTPError as error:
        # The probe has a fixed, sanitized response. Do not print proxy error pages.
        with error:
            raw = error.read(1024 * 1024)
        try:
            result = json.loads(raw)
        except (ValueError, UnicodeError):
            print(f"HTTP {error.code}；请检查网关和函数日志")
            return 1
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1
    except (URLError, TimeoutError, OSError, ValueError):
        print("请求失败；请检查网关和函数日志，写入结果可能尚未确认")
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if isinstance(result, dict) and result.get("ok") is True else 1


if __name__ == "__main__":
    raise SystemExit(main())
