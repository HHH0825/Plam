"""Package the probe with the already verified Linux Python 3.10 dependencies."""
import hashlib
import json
from pathlib import Path
import stat
import zipfile

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / "flask-check" / "palm-flask-check-python310.zip"
SOURCE_SHA256 = "c73ed28226bb9be59a8cd44a08fe80bcc8078d1a8a7cd00fc02fd2a90699bf8c"
CODE = ROOT.parents[1] / "backend" / "cloudbase_probe"
OUTPUT = ROOT / "palm-cloudbase-probe-python310.zip"


def build():
    if not SOURCE.is_file() or hashlib.sha256(SOURCE.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise RuntimeError("缺少已验证的 Flask 依赖包，或依赖包已改变；请先核对 flask-check 部署包")
    entries = {name: (ROOT / name).read_bytes() for name in ("app.py", "scf_bootstrap")}
    for name in ("__init__.py", "client.py", "probe.py", "app.py", "check.py"):
        entries["cloudbase_probe/" + name] = (CODE / name).read_bytes()
    with zipfile.ZipFile(SOURCE) as source:
        assert source.testzip() is None
        manifest = json.loads(source.read("bundle-info.json"))
        for name in source.namelist():
            if name.startswith("third_party/") and not name.endswith("/"):
                if ".." in Path(name).parts or "__pycache__" in name or name.endswith((".pyc", ".pyd")):
                    raise RuntimeError("依赖包包含不适合部署的文件")
                entries[name] = source.read(name)
    manifest.update(diagnostic_bundle="palm-cloudbase-probe-v1", collection="palm_cloud_probe",
                    contains_business_data=False, contains_credentials=False,
                    dependency_bundle_sha256=SOURCE_SHA256)
    entries["bundle-info.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    with zipfile.ZipFile(OUTPUT, "w") as bundle:
        for name, data in sorted(entries.items()):
            if not name.startswith("third_party/"):
                data = data.replace(b"\r\n", b"\n")
            info = zipfile.ZipInfo(name)
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (stat.S_IFREG | (0o755 if name == "scf_bootstrap" else 0o644)) << 16
            bundle.writestr(info, data)
    with zipfile.ZipFile(OUTPUT) as bundle:
        assert bundle.testzip() is None
        assert "third_party/flask/__init__.py" in bundle.namelist()
        assert "third_party/gunicorn/__main__.py" in bundle.namelist()
        assert b"\r" not in bundle.read("scf_bootstrap")
        assert ((bundle.getinfo("scf_bootstrap").external_attr >> 16) & 0o777) == 0o755
    digest = hashlib.sha256(OUTPUT.read_bytes()).hexdigest()
    OUTPUT.with_suffix(".zip.sha256").write_text(f"{digest}  {OUTPUT.name}\n", encoding="utf-8")
    print(f"Verified: {OUTPUT} ({OUTPUT.stat().st_size} bytes), SHA256 {digest}")


if __name__ == "__main__":
    build()
