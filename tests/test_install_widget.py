"""以合成八頁驗證入口安裝、原始編碼保留與有條件還原。"""

import hashlib
import json
from pathlib import Path

import pytest

from scripts.install_widget import PAGES, TAG, WidgetError, install, restore
from scripts import install_widget


@pytest.fixture
def site(tmp_path):
    root = tmp_path / "site" / "wwwroot"
    originals = {}
    for number, relative in enumerate(PAGES):
        text = f"<!doctype html>\r\n<body>合成頁面{number}，成型報工\r\n</BODY>\r\n"
        encoding = ("utf-8", "utf-8-sig", "big5", "utf-16", "utf-32", "utf-8", "big5", "utf-8")[number]
        original = text.encode(encoding)
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(original)
        originals[relative] = original
    return root, originals, tmp_path / "backup-one"


def current(root):
    return {relative: (root / relative).read_bytes() for relative in PAGES}


def test_八頁安裝保留編碼備份校驗及完整還原(site):
    root, originals, backup = site
    result = install(root, backup)
    assert result["changed"] == 8
    manifest = json.loads(Path(result["manifest"]).read_text(encoding="utf-8"))
    assert {entry["path"] for entry in manifest["pages"]} == set(PAGES)
    for entry in manifest["pages"]:
        relative = entry["path"]
        old = originals[relative]
        new = (root / relative).read_bytes()
        assert (backup / "original" / relative).read_bytes() == old
        assert entry["old_sha256"] == hashlib.sha256(old).hexdigest()
        assert entry["new_sha256"] == hashlib.sha256(new).hexdigest()
        codec = "utf-32-le" if old.startswith(b"\xff\xfe\x00\x00") else "utf-16-le" if old.startswith(b"\xff\xfe") else "latin-1"
        assert new.decode(codec).count(TAG) == 1
        assert new.decode(codec).replace(TAG + "\r\n", "").encode(codec) == old
    before_second = current(root)
    assert install(root, backup.parent / "backup-two") == {"status": "already_installed", "changed": 0, "manifest": None}
    assert current(root) == before_second
    assert not (backup.parent / "backup-two").exists()
    assert restore(Path(result["manifest"]))["changed"] == 8
    assert current(root) == originals


@pytest.mark.parametrize("problem", ["missing", "body", "unknown", "duplicate"])
def test_任一頁預檢失敗全體不修改也不建立備份(site, problem):
    root, originals, backup = site
    last = root / PAGES[-1]
    if problem == "missing":
        last.unlink()
    elif problem == "body":
        last.write_bytes(b"<html><body>no closing body</html>")
    elif problem == "unknown":
        last.write_text('<body><script src="https://unknown/widget-loader.js"></script></body>', encoding="utf-8")
    else:
        last.write_text("<body>" + TAG + TAG + "</body>", encoding="utf-8")
    before = {p: (root / p).read_bytes() for p in PAGES if (root / p).exists()}
    with pytest.raises(WidgetError):
        install(root, backup)
    assert {p: (root / p).read_bytes() for p in before} == before
    assert not backup.exists()


@pytest.mark.parametrize("location", ["inside", "existing", "other_webroot"])
def test_拒絕網站內或既有備份目錄(site, location):
    root, originals, backup = site
    if location == "inside":
        backup = root / "backup"
    elif location == "existing":
        backup.mkdir()
    else:
        backup = root.parent.parent / "another" / "wwwroot" / "backup"
    with pytest.raises(WidgetError):
        install(root, backup)
    assert current(root) == originals


@pytest.mark.parametrize("change", ["current", "backup", "manifest_path"])
def test_還原任一校驗不符全體不動且保留他人變更(site, change):
    root, _, backup = site
    result = install(root, backup)
    if change == "current":
        path = root / PAGES[-1]
        path.write_bytes(path.read_bytes() + b"<!-- another edit -->")
    elif change == "backup":
        path = backup / "original" / PAGES[-1]
        path.write_bytes(path.read_bytes() + b"tampered")
    else:
        path = Path(result["manifest"])
        manifest = json.loads(path.read_text(encoding="utf-8"))
        manifest["pages"][-1]["path"] = "../outside.html"
        path.write_text(json.dumps(manifest), encoding="utf-8")
    before = current(root)
    with pytest.raises(WidgetError):
        restore(Path(result["manifest"]))
    assert current(root) == before


def test_混合已安裝頁面不重複且還原保留原有標記(site):
    root, originals, backup = site
    page = root / PAGES[0]
    originals[PAGES[0]] = page.read_bytes().replace(b"</BODY>", (TAG + "\r\n</BODY>").encode("ascii"))
    page.write_bytes(originals[PAGES[0]])
    result = install(root, backup)
    assert result["changed"] == 7
    assert page.read_bytes() == originals[PAGES[0]]
    assert restore(Path(result["manifest"]))["changed"] == 7
    assert current(root) == originals


def test_安裝途中寫入失敗還原已完成頁面且保留備份(site, monkeypatch):
    root, originals, backup = site
    replace = install_widget._replace
    failed = False

    def fail_once(path, data):
        nonlocal failed
        if path == root / PAGES[-1] and not failed:
            failed = True
            raise OSError("合成磁碟寫入失敗")
        return replace(path, data)

    monkeypatch.setattr(install_widget, "_replace", fail_once)
    with pytest.raises(OSError, match="合成磁碟"):
        install(root, backup)
    assert current(root) == originals
    assert (backup / "manifest.json").exists()
    assert all((backup / "original" / relative).read_bytes() == original for relative, original in originals.items())
    assert not list(root.rglob(".ai-widget-*.tmp"))
