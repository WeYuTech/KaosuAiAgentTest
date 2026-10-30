"""以原始位元組備份、安裝及還原八個 MES 頁面的同源助理入口。"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile


PAGES = (
    "MES-WIP/WIP-menu.html",
    "MES-WIP/setup/wip-query_schedule_plan_new.html",
    "MES-WIP/setup/wip-query_schedule_detail_new.html",
    "MES-WIP/OPI/schedule_report/wip-opi_schedule_uping.html",
    "MES-WIP/OPI/schedule_report/wip-query_schedule.html",
    "MES-WIP/OPI/schedule_report/wo-schedule.html",
    "MES-WIP/OPI/mold/wip-opi_schedule_mold_eqp.html",
    "MES-WIP/OPI/mold/wip-query_schedule_clear.html",
)
TAG = '<script defer src="/KSS_MES/ai-agent/widget-loader.js" data-assistant-url="/KSS_MES/ai-agent/"></script>'


class WidgetError(ValueError):
    """頁面預檢或還原條件不成立。"""


def _hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _path(root: Path, relative: str) -> Path:
    path = root / relative
    if path.resolve().is_relative_to(root) is False:
        raise WidgetError(f"路徑超出指定根目錄：{relative}")
    if any(p.is_symlink() or p.is_junction() for p in (path, *path.parents) if p != root and root in p.parents):
        raise WidgetError(f"不允許符號連結或目錄接合：{relative}")
    return path


def _insert(original: bytes, relative: str) -> bytes:
    encoding = "latin-1"
    for marker, codec in ((b"\xff\xfe\x00\x00", "utf-32-le"), (b"\x00\x00\xfe\xff", "utf-32-be"), (b"\xff\xfe", "utf-16-le"), (b"\xfe\xff", "utf-16-be")):
        if original.startswith(marker):
            encoding = codec
            break
    try:
        text = original.decode(encoding)
    except UnicodeError:
        raise WidgetError(f"無法無損讀取頁面編碼：{relative}") from None
    endings = list(re.finditer(r"</body\s*>", text, re.IGNORECASE))
    if len(endings) != 1:
        raise WidgetError(f"頁面須有且僅有一個 body 結尾：{relative}")
    remainder = text.replace(TAG, "")
    if text.count(TAG) > 1 or re.search(r"widget-loader|data-assistant-url|/ai-agent/", remainder, re.IGNORECASE):
        raise WidgetError(f"發現未知或重複的既有助理標記：{relative}")
    if TAG in text:
        if text.index(TAG) > endings[0].start():
            raise WidgetError(f"既有助理標記位於 body 外：{relative}")
        return original
    newline = "\r\n" if "\r\n" in text else "\n"
    position = endings[0].start()
    return (text[:position] + TAG + newline + text[position:]).encode(encoding)


def _backup_location(mes_root: Path, backup_root: Path, *, fresh: bool) -> Path:
    backup_root = backup_root.absolute()
    resolved = backup_root.resolve()
    if resolved.is_relative_to(mes_root) or mes_root.is_relative_to(resolved) or any(p.name.lower() == "wwwroot" for p in (resolved, *resolved.parents)):
        raise WidgetError("備份必須位於網站根目錄之外的獨立目錄。")
    if any(p.is_symlink() or p.is_junction() for p in (backup_root, *backup_root.parents)):
        raise WidgetError("備份路徑不允許符號連結或目錄接合。")
    if fresh and resolved.exists():
        raise WidgetError("備份目錄已存在，請指定全新目錄。")
    return resolved


def _replace(path: Path, data: bytes) -> None:
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".ai-widget-", suffix=".tmp", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, path.stat().st_mode)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def _apply(changes: list[tuple[Path, bytes, bytes]]) -> None:
    for path, before, _ in changes:
        if path.read_bytes() != before:
            raise WidgetError(f"預檢後頁面已被修改，停止整批操作：{path.name}")
    written = []
    try:
        for path, before, after in changes:
            if path.read_bytes() != before:
                raise WidgetError(f"頁面已被其他程序修改：{path.name}")
            if before != after:
                _replace(path, after)
                written.append((path, before, after))
    except Exception:
        for path, before, after in reversed(written):
            if path.read_bytes() == after:
                _replace(path, before)
        raise


def install(mes_root: Path, backup_root: Path) -> dict:
    mes_root = Path(mes_root).resolve(strict=True)
    backup_root = _backup_location(mes_root, Path(backup_root), fresh=True)
    changes = []
    entries = []
    for relative in PAGES:
        path = _path(mes_root, relative)
        if not path.is_file():
            raise WidgetError(f"缺少必要頁面：{relative}")
        old = path.read_bytes()
        new = _insert(old, relative)
        changes.append((path, old, new))
        entries.append({"path": relative, "old_sha256": _hash(old), "new_sha256": _hash(new), "changed": old != new})
    if not any(entry["changed"] for entry in entries):
        return {"status": "already_installed", "changed": 0, "manifest": None}
    backup_root.mkdir(parents=False)
    for entry, (_, original, _) in zip(entries, changes):
        backup = backup_root / "original" / entry["path"]
        backup.parent.mkdir(parents=True, exist_ok=True)
        backup.write_bytes(original)
    manifest = backup_root / "manifest.json"
    manifest.write_text(json.dumps({"schema": 1, "mes_root": str(mes_root), "created_at": datetime.now(timezone.utc).isoformat(), "tag": TAG, "pages": entries}, ensure_ascii=False, indent=2), encoding="utf-8")
    _apply(changes)
    return {"status": "installed", "changed": sum(entry["changed"] for entry in entries), "manifest": str(manifest)}


def restore(manifest_path: Path) -> dict:
    manifest_path = Path(manifest_path).absolute()
    if manifest_path.name != "manifest.json" or manifest_path.is_symlink():
        raise WidgetError("請提供原始備份 manifest.json。")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema") != 1 or manifest.get("tag") != TAG:
        raise WidgetError("備份清單格式或助理標記不符。")
    mes_root = Path(manifest["mes_root"]).resolve(strict=True)
    backup_root = _backup_location(mes_root, manifest_path.parent, fresh=False)
    entries = manifest.get("pages", [])
    if len(entries) != len(PAGES) or {entry.get("path") for entry in entries} != set(PAGES):
        raise WidgetError("備份清單必須完整列出固定八頁，不能增加、缺漏或重複。")
    changes = []
    for entry in entries:
        relative = entry["path"]
        original = _path(backup_root, "original/" + relative).read_bytes()
        path = _path(mes_root, relative)
        current = path.read_bytes()
        if _hash(original) != entry["old_sha256"]:
            raise WidgetError(f"原始備份校驗不符：{relative}")
        if _hash(current) != entry["new_sha256"] or _insert(original, relative) != current:
            raise WidgetError(f"頁面已修改或安裝內容不符，整批還原已停止：{relative}")
        changes.append((path, current, original))
    _apply(changes)
    return {"status": "restored", "changed": sum(before != after for _, before, after in changes), "manifest": str(manifest_path)}


def main() -> None:
    parser = argparse.ArgumentParser(description="安裝或還原 MES 八頁助理入口；須另由操作人員指定網站外全新備份目錄。")
    parser.add_argument("--mes-root", type=Path, help="既有 MES 的 wwwroot")
    parser.add_argument("--backup-root", type=Path, help="網站外全新獨立備份目錄（上層須存在）")
    parser.add_argument("--restore", type=Path, metavar="MANIFEST", help="依原始 manifest.json 還原；拒絕覆蓋安裝後的他人修改")
    args = parser.parse_args()
    if args.restore and (args.mes_root or args.backup_root):
        parser.error("還原時不得同時指定安裝參數。")
    if not args.restore and not (args.mes_root and args.backup_root):
        parser.error("安裝須同時指定 --mes-root 與 --backup-root。")
    try:
        result = restore(args.restore) if args.restore else install(args.mes_root, args.backup_root)
    except (WidgetError, OSError, ValueError, KeyError, TypeError) as error:
        parser.exit(1, f"操作失敗：{error}\n")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
