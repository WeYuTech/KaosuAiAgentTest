"""建立 IIS 發行封裝；僅打包白名單檔案，不連線、不部署、不讀取環境設定。"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
from pathlib import Path
import re
import zipfile


DIRECTORIES = {
    "app": {".py"},
    "docs": {".md"},
    "tests": {".py"},
    "scripts": {".py", ".ps1", ".ashx"},
    "migrations": {".sql"},
    "frontend/dist": {".html", ".js", ".css", ".svg", ".png", ".jpg", ".jpeg", ".ico", ".woff", ".woff2", ".ttf", ".txt"},
}
ROOT_FILES = ("pyproject.toml", "requirements.lock.txt", "AGENTS.md", "CONTEXT.md", "README.md")
EXCLUDED_PARTS = {".local", ".git", ".venv", "venv", "node_modules", "__pycache__", ".pytest_cache", ".cache", "cache", "credentials", "secrets"}
TEXT_EXTENSIONS = {".py", ".ps1", ".ashx", ".md", ".sql", ".html", ".js", ".css", ".svg", ".txt", ".toml"}


class PackageError(ValueError):
    """封裝檢查未通過；訊息不包含敏感內容。"""


def _linked(path: Path) -> bool:
    return path.is_symlink() or path.is_junction()


def _excluded(path: Path) -> bool:
    return any(part.lower() in EXCLUDED_PARTS or part.lower().startswith(".env") for part in path.parts)


def _check_text(name: str, data: bytes) -> None:
    if Path(name).suffix.lower() not in TEXT_EXTENSIONS:
        return
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise PackageError(f"文字檔不是 UTF-8，無法檢查敏感資料：{name}") from None
    patterns = (
        r"sk-" + r"(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}",
        r"-----BEGIN " + r"(?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
        r"(?i)\bBearer\s+" + r"[A-Za-z0-9_.-]{24,}",
        r"(?i)\b(?:Password|Pwd)\s*=\s*" + r"[^;\s\"'{}<>$]{4,}",
        r"(?i)\b(?:api_key|access_token|refresh_token|client_secret)\s*[:=]\s*[\"']" + r"[A-Za-z0-9_./+-]{24,}[\"']",
    )
    if any(re.search(pattern, text) for pattern in patterns):
        raise PackageError(f"發現疑似憑證，已停止封裝；請檢查檔案：{name}")


def _collect(root: Path) -> dict[str, bytes]:
    files: dict[str, bytes] = {}

    def add(path: Path) -> None:
        relative = path.relative_to(root)
        if _excluded(relative):
            return
        if _linked(path) or any(_linked(parent) for parent in path.parents if parent != root and root in parent.parents):
            raise PackageError(f"不允許連結或目錄接合：{relative.as_posix()}")
        data = path.read_bytes()
        _check_text(relative.as_posix(), data)
        files[relative.as_posix()] = data

    def walk(directory: Path, extensions: set[str]) -> None:
        for path in sorted(directory.iterdir()):
            if _excluded(path.relative_to(root)):
                continue
            if _linked(path):
                raise PackageError(f"不允許連結或目錄接合：{path.relative_to(root).as_posix()}")
            if path.is_dir():
                walk(path, extensions)
            elif path.suffix.lower() in extensions:
                add(path)

    for name in ROOT_FILES:
        path = root / name
        if not path.is_file():
            raise PackageError(f"缺少必要檔案：{name}")
        add(path)
    for name, extensions in DIRECTORIES.items():
        directory = root / name
        if not directory.is_dir() or _linked(directory):
            raise PackageError(f"缺少必要目錄或目錄為連結：{name}")
        if any(_linked(parent) for parent in directory.parents if parent != root and root in parent.parents):
            raise PackageError(f"上層目錄不允許連結：{name}")
        walk(directory, extensions)
    if "frontend/dist/index.html" not in files:
        raise PackageError("缺少前端建置入口 frontend/dist/index.html，請先完成建置。")
    return files


def create_release(root: Path, release_name: str | None = None) -> dict[str, str | int]:
    """先檢查全部內容，再將 ZIP 與 SHA256 清單寫入 .local/releases。"""
    root = Path(root).resolve(strict=True)
    name = release_name or "kaosu-agent-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", name):
        raise PackageError("封裝名稱僅允許英數字、底線與連字號，長度不得超過80。")
    files = _collect(root)
    manifest = "".join(f"{hashlib.sha256(data).hexdigest()}  {path}\n" for path, data in sorted(files.items())).encode("utf-8")
    output = root / ".local" / "releases"
    for directory in (root / ".local", output):
        if _linked(directory):
            raise PackageError("輸出目錄不允許連結或目錄接合。")
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f"{name}.zip"
    checksums = output / f"{name}.sha256"
    file_checksums = output / f"{name}.files.sha256"
    if any(path.exists() for path in (archive, checksums, file_checksums)):
        raise PackageError("同名發行檔已存在，不允許覆寫；請使用新名稱。")
    with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
        for path, data in sorted(files.items()):
            bundle.writestr(path, data)
        bundle.writestr("SHA256SUMS.txt", manifest)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    with checksums.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(f"{digest}  {archive.name}\n")
    with file_checksums.open("xb") as stream:
        stream.write(manifest)
    return {"archive": str(archive), "sha256": digest, "checksums": str(checksums), "file_checksums": str(file_checksums), "file_count": len(files)}


def main() -> None:
    parser = argparse.ArgumentParser(description="建立白名單 IIS 發行 ZIP 與 SHA256 清單，不含環境設定或業務資料。")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1], help="專案根目錄")
    parser.add_argument("--name", help="唯一發行名稱，不含副檔名")
    args = parser.parse_args()
    try:
        result = create_release(args.root, args.name)
    except (PackageError, OSError) as error:
        parser.exit(1, f"封裝失敗：{error}\n")
    print(f"封裝完成：{result['archive']}\n來源檔案數：{result['file_count']}\nSHA256：{result['sha256']}\n校驗清單：{result['checksums']}\n逐檔清單：{result['file_checksums']}")


if __name__ == "__main__":
    main()
