"""Build a Linux x64 / Python 3.10 deployment ZIP without modifying the backend."""

import hashlib
import json
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "palm-flask-check-python310.zip"


def build():
    with tempfile.TemporaryDirectory(prefix=".pack-", dir=ROOT) as temporary:
        stage = Path(temporary).resolve()
        if not stage.is_relative_to(ROOT):
            raise RuntimeError("Build directory must stay within the probe directory")
        vendor = stage / "third_party"
        subprocess.run(
            [
                sys.executable, "-m", "pip", "install",
                "--disable-pip-version-check", "--no-compile", "--no-cache-dir",
                "--only-binary=:all:", "--platform", "manylinux2014_x86_64",
                "--implementation", "cp", "--python-version", "3.10",
                "--abi", "cp310", "--target", str(vendor),
                "-r", str(ROOT / "requirements.txt"),
            ],
            check=True,
        )
        packages = {}
        for metadata in vendor.glob("*.dist-info/METADATA"):
            fields = metadata.read_text(encoding="utf-8").splitlines()
            name = next(line[6:] for line in fields if line.startswith("Name: "))
            version = next(line[9:] for line in fields if line.startswith("Version: "))
            packages[name] = version
        manifest = {
            "target": "Linux x64 / CPython 3.10",
            "packages": dict(sorted(packages.items())),
            "contains_business_data": False,
        }
        entries = [(ROOT / name, name) for name in ("app.py", "scf_bootstrap", "requirements.txt")]
        entries.extend((path, path.relative_to(stage).as_posix()) for path in sorted(vendor.rglob("*")) if path.is_file())
        with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as bundle:
            for path, name in entries:
                data = path.read_bytes()
                if name in ("app.py", "scf_bootstrap", "requirements.txt"):
                    data = data.replace(b"\r\n", b"\n")
                info = zipfile.ZipInfo(name)
                info.create_system = 3
                info.compress_type = zipfile.ZIP_DEFLATED
                mode = 0o755 if name == "scf_bootstrap" else 0o644
                info.external_attr = (stat.S_IFREG | mode) << 16
                bundle.writestr(info, data)
            bundle.writestr("bundle-info.json", json.dumps(manifest, indent=2) + "\n")
        with zipfile.ZipFile(OUTPUT) as bundle:
            assert bundle.testzip() is None
            assert "app.py" in bundle.namelist()
            assert "third_party/gunicorn/__main__.py" in bundle.namelist()
            assert "third_party/flask/__init__.py" in bundle.namelist()
            startup = bundle.read("scf_bootstrap")
            assert b"\r" not in startup and not startup.startswith(b"\xef\xbb\xbf")
            assert ((bundle.getinfo("scf_bootstrap").external_attr >> 16) & 0o777) == 0o755
            assert not any("__pycache__" in name or name.endswith(".pyc") for name in bundle.namelist())
            assert not any("win_amd64" in name or name.endswith(".pyd") for name in bundle.namelist())
        digest = hashlib.sha256(OUTPUT.read_bytes()).hexdigest()
        OUTPUT.with_suffix(".zip.sha256").write_text(f"{digest}  {OUTPUT.name}\n", encoding="utf-8")
        print(json.dumps(manifest, indent=2))
        print(f"ZIP verified: {OUTPUT} ({OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    build()
