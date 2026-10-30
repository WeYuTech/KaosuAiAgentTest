"""由 Windows 工作排程器啟動，僅接受本機 IIS 轉送。"""
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)


def main():
    import uvicorn

    logs = ROOT / ".local" / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(logs / "service.log", maxBytes=2_000_000, backupCount=5, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    logging.basicConfig(level=logging.INFO, handlers=[handler])
    # 不記錄 URL 查詢參數、Cookie、權杖或模型請求。
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    uvicorn.run("app.main:app", host="127.0.0.1", port=8765, workers=1,
                root_path="/KSS_MES/ai-agent", proxy_headers=True,
                forwarded_allow_ips="127.0.0.1", access_log=False, log_config=None)


if __name__ == "__main__":
    main()
