"""Local capability check. A missing API key is entered without screen echo."""

import getpass
import json
import os
import sys

from .client import Client, Configuration, ConfigurationError
from .probe import run_probe


def main():
    env = dict(os.environ)
    if not env.get("CLOUDBASE_API_KEY") and not env.get("CLOUDBASE_APIKEY"):
        if not sys.stdin.isatty():
            print("请在交互式终端运行，管理员 API Key 输入不会显示", file=sys.stderr)
            return 2
        env["CLOUDBASE_API_KEY"] = getpass.getpass("服务端管理员 API Key（输入不会显示）：")
    try:
        result = run_probe(Client(Configuration.from_environ(env)))
    except ConfigurationError as error:
        print(str(error), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
