"""驗證發行封裝的白名單、憑證阻擋與校驗清單。"""

import hashlib
from pathlib import Path
import zipfile

import pytest

from scripts.package_release import DIRECTORIES, ROOT_FILES, PackageError, create_release


@pytest.fixture
def release_root(tmp_path):
    for directory in DIRECTORIES:
        (tmp_path / directory).mkdir(parents=True, exist_ok=True)
    for name in ROOT_FILES:
        (tmp_path / name).write_text("合成發行資料", encoding="utf-8")
    for name in ("app/main.py", "docs/部署.md", "tests/test_demo.py", "scripts/start.ps1", "migrations/001.sql", "frontend/dist/index.html"):
        (tmp_path / name).write_text("合成發行資料", encoding="utf-8")
    return tmp_path


def test_只打包白名單並驗證每檔與壓縮檔校驗(release_root):
    for name in (".env", ".local/password.txt", ".git/config", "app/.env.production", "app/__pycache__/cache.py", "app/node_modules/test.py", "docs/.local/秘密.md", "app/data.db", "app/certificate.pfx", "docs/private.pem", "frontend/src/main.js", "frontend/dist/assets/source.map"):
        path = release_root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("不可打包", encoding="utf-8")
    result = create_release(release_root, "test-release")
    archive = Path(result["archive"])
    assert archive.parent == release_root / ".local/releases"
    with zipfile.ZipFile(archive) as bundle:
        names = set(bundle.namelist())
        assert names == set(ROOT_FILES) | {"app/main.py", "docs/部署.md", "tests/test_demo.py", "scripts/start.ps1", "migrations/001.sql", "frontend/dist/index.html", "SHA256SUMS.txt"}
        manifest = bundle.read("SHA256SUMS.txt")
        assert manifest == Path(result["file_checksums"]).read_bytes()
        for line in manifest.decode("utf-8").splitlines():
            digest, name = line.split("  ", 1)
            assert hashlib.sha256(bundle.read(name)).hexdigest() == digest
    assert result["file_count"] == len(names) - 1
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    assert result["sha256"] == digest
    assert Path(result["checksums"]).read_text() == f"{digest}  test-release.zip\n"


@pytest.mark.parametrize("value", [
    "sk-" + "proj-" + "a" * 40,
    "-----BEGIN " + "PRIVATE KEY-----",
    "Server=example;" + "Password=" + "synthetic-only-value;",
    "Authorization: Bearer " + "x" * 40,
    'api_key="' + "x" * 40 + '"',
])
def test_偵測疑似秘密先阻擋且不輸出敏感值(release_root, value):
    (release_root / "docs/秘密.md").write_text(value, encoding="utf-8")
    with pytest.raises(PackageError) as error:
        create_release(release_root)
    assert value not in str(error.value)
    assert not (release_root / ".local/releases").exists()


def test_缺前端建置或重複發行不覆寫(release_root):
    index = release_root / "frontend/dist/index.html"
    index.unlink()
    with pytest.raises(PackageError, match="前端建置入口"):
        create_release(release_root)
    index.write_text("合成建置", encoding="utf-8")
    result = create_release(release_root, "same-name")
    original = Path(result["archive"]).read_bytes()
    with pytest.raises(PackageError, match="不允許覆寫"):
        create_release(release_root, "same-name")
    assert Path(result["archive"]).read_bytes() == original


def test_拒絕符號連結避免越過來源邊界(release_root, tmp_path):
    target = tmp_path / "external.txt"
    target.write_text("不可封裝", encoding="utf-8")
    link = release_root / "docs/link.md"
    try:
        link.symlink_to(target)
    except OSError:
        pytest.skip("測試主機未提供建立符號連結權限")
    with pytest.raises(PackageError, match="不允許連結"):
        create_release(release_root)


def test_拒絕輸出名稱路徑穿越(release_root):
    with pytest.raises(PackageError, match="封裝名稱"):
        create_release(release_root, "../outside")


def test_可信Session處理器納入封裝且仍檢查憑證(release_root):
    handler = release_root / "scripts/mes_session_bridge.ashx"
    handler.write_text('可信 Session 處理器，不含環境設定', encoding="utf-8")
    result = create_release(release_root, "session-handler")
    with zipfile.ZipFile(result["archive"]) as bundle:
        assert bundle.read("scripts/mes_session_bridge.ashx") == handler.read_bytes()
    handler.write_text('api_key="' + 'x' * 40 + '"', encoding="utf-8")
    with pytest.raises(PackageError, match="疑似憑證"):
        create_release(release_root, "blocked-handler")
