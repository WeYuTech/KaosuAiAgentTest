"""隔離資料上的真實模型驗收；費用一律使用全專案累計帳本。"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from app.main import create_app
from app.model import budget_summary

scenarios = [
    ("schedule", "請列出 MC36 的排程，我先查詢不要更動。", None),
    ("report", "請幫 MC37 的 WO-A 報工，人工良品20個，缺料2個。先讓我確認。", "report.add"),
    ("mold", "幫MC36排程1003上模開始，給我確認卡。", "mold.mount_start"),
]
results = []
with tempfile.TemporaryDirectory() as folder:
    with TestClient(create_app(db_path=Path(folder) / "evaluation.db")) as client:
        client.post("/api/session/demo", json={"identity": "supervisor"}).raise_for_status()
        for module, prompt, expected in scenarios:
            convo = client.post("/api/conversations", json={"module": module}).json()
            r = client.post(f"/api/conversations/{convo['id']}/messages", json={"text": prompt})
            body = r.json()
            if module == "report" and r.status_code == 200 and not body.get("proposal"):
                r = client.post(f"/api/conversations/{convo['id']}/messages", json={"text": "選執行列2001，沿用剛才的良品20與缺料2，請產生確認卡。"})
                body = r.json()
            actual = (body.get("proposal") or {}).get("action")
            passed = r.status_code == 200 and actual == expected
            results.append({"module": module, "prompt": prompt, "http": r.status_code, "expected_action": expected,
                            "actual_action": actual, "passed": passed, "response": body})
            print(json.dumps({"module": module, "http": r.status_code, "passed": passed, "actual": actual}, ensure_ascii=False), flush=True)
        assert client.get("/api/audit").json()["records"] == [], "模型不應執行寫入"
report = {"results": results, "budget": budget_summary(), "business_writes": 0}
output = Path(__file__).resolve().parents[1] / ".local" / "model-evaluation.json"
output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report["budget"], ensure_ascii=False))
sys.exit(0 if all(r["passed"] for r in results) else 1)
