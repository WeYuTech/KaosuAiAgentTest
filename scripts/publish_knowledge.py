"""部署管理員在審核、回歸通過後發佈知識；模型沒有此工具。"""
import argparse
from datetime import datetime, timezone
import hashlib
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.store import Store, digest

parser = argparse.ArgumentParser(description="發佈已審核知識，先執行固定回歸測試")
parser.add_argument("feedback_id")
parser.add_argument("--db", type=Path, default=ROOT / ".local" / "operations.db")
args = parser.parse_args()
store = Store(args.db)
with store.transaction() as db:
    entry = store.get(db, "FEEDBACK", args.feedback_id)
if not entry or entry["status"] != "reviewed":
    raise SystemExit("回饋尚未經主管審核，不可發佈。")
approved_hash = digest(entry)
run = subprocess.run([sys.executable, "-m", "pytest", "tests", "-q"], cwd=ROOT, capture_output=True)
if run.returncode:
    raise SystemExit("固定回歸測試未通過，知識保持未發佈。請先處理失敗案例。")
receipt = {"suite": "公開 HTTP 回歸測試", "time": datetime.now(timezone.utc).isoformat(), "sha256": hashlib.sha256(run.stdout + run.stderr).hexdigest()}
with store.transaction() as db:
    fresh = store.get(db, "FEEDBACK", args.feedback_id)
    if digest(fresh) != approved_hash:
        raise SystemExit("審核內容已變動，請重新驗證。")
    knowledge = {"id": entry["id"], "module": entry["module"], "text": entry["text"], "source": entry["source"],
                 "status": "published", "version": approved_hash[:12], "reviewer": entry["reviewer"], "regression": receipt}
    store.put(db, "KNOWLEDGE", entry["id"], knowledge)
    entry["status"] = "published"
    store.put(db, "FEEDBACK", entry["id"], entry)
print("已發佈經審核且回歸通過的知識版本：" + approved_hash[:12])
