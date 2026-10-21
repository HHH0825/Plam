"""Build reviewable local bundles with the existing pinned offline dependencies."""
import ast
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('release_builder', ROOT / 'tools/prepare-purchases-release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
for source in (ROOT / 'backend/palm').glob('*.py'):
    ast.parse(source.read_text(encoding='utf-8'), filename=str(source), feature_version=(3, 10))
release.OUTPUT = ROOT / 'deploy/cloudbase/cash-ledger-20261013'
release.RELEASE = 'cash-ledger-20261013'
release.main()
