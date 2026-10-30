"""真實模型以設備、工單與口語指代完成多輪作業；不在提示中提供資料庫 SID。"""
import json
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from fastapi.testclient import TestClient
from app.main import create_app
from app.model import budget_summary


evidence = []
with tempfile.TemporaryDirectory() as folder, TestClient(create_app(Path(folder) / "multiturn.db")) as client:
    client.post("/api/session/demo", json={"identity": "supervisor"}).raise_for_status()
    def chat(module, context=None):
        return client.post("/api/conversations", json={"module": module, "context": context or {}}).json()["id"]
    def say(cid, module, text):
        before = client.get("/api/workspace", params={"module": module}).json()
        response = client.post(f"/api/conversations/{cid}/messages", json={"text": text})
        entry = {"module": module, "conversation": cid, "prompt": text, "http": response.status_code, "response": response.json()}
        evidence.append(entry)
        assert response.status_code == 200, response.text
        assert client.get("/api/workspace", params={"module": module}).json() == before, "對話不得直接寫入業務資料"
        return response.json().get("proposal")
    def approve(card, action):
        assert card and card["action"] == action, f"未取得 {action} 確認卡"
        result = client.post(f"/api/proposals/{card['id']}/confirm", json={"digest": card["digest"], "approved": True})
        assert result.status_code == 200 and result.json()["status"] == "succeeded", result.text
        evidence.append({"approved_action": action, "operation_id": card["id"], "status": "passed"})
        print(json.dumps({"action": action, "status": "passed"}), flush=True)
    try:
        report = chat("report", {"EQP_NO": "MC37"})
        assert say(report, "report", "我想報工，先幫我確認機台上的工單。") is None
        card = say(report, "report", "MC37目前已上模、正在生產的WO-A，人工良品八個，缺料兩個。")
        assert card and card["args"]["execution_id"] == "2001"
        updated = say(report, "report", "先不要送，良品改九個，缺料改三個，請重新給確認卡。")
        assert updated and updated["args"]["ok"] == 9 and updated["args"]["defects"][0]["quantity"] == 3
        assert client.get(f"/api/proposals/{card['id']}").json()["proposal"]["status"] == "superseded"
        approve(updated, "report.add")
        approve(say(report, "report", "剛才那一筆報工良品改成十個，不良仍是缺料三個。"), "report.update")
        approve(say(report, "report", "刪除剛才那筆人工報工，請給我單獨確認卡。"), "report.delete")
        approve(say(report, "report", "目前這筆WO-A的報工模穴改成三穴。"), "report.cavities")
        approve(say(report, "report", "將目前這張排程完工，請列出全部受影響工單給我確認。"), "report.complete")

        schedule = chat("schedule")
        assert say(schedule, "schedule", "幫我新增MC36排程，模具MOLD-SPLIT，品號EPS-A，工單WO-A，2026-10-31早上九點開始，週期60秒、目標10模、狀態RUN，我要分配兩穴。") is None
        card = say(schedule, "schedule", "先用左邊那組模穴，兩穴都給WO-A。")
        assert card and card["args"]["details"][0]["mold_detail_id"] == "63"
        card = say(schedule, "schedule", "右邊那組也加進來，同一張WO-A，右邊一穴，左邊維持兩穴。")
        assert len(card["args"]["details"]) == 2
        approve(card, "schedule.save")
        approve(say(schedule, "schedule", "修改剛新增的排程：左邊三穴、右邊兩穴，工單和其他設定不變。"), "schedule.save")

        mold = chat("mold", {"EQP_NO": "MC36"})
        approve(say(mold, "mold", "MC36剛剛排的MOLD-SPLIT，現在開始上模。"), "mold.mount_start")
        approve(say(mold, "mold", "這副模具現在上模完成。"), "mold.mount_finish")
        approve(say(mold, "mold", "這副模具現在開始下模。"), "mold.unmount_start")
        approve(say(mold, "mold", "現在下模完成，請列出出站與完工影響讓我確認。"), "mold.unmount_finish")
        approve(say(mold, "mold", "清除剛才這張排程的換模紀錄，包含進出站與完工狀態，請獨立確認。"), "mold.clear")
    finally:
        result = {"mode": "simulation", "scenario": "同一對話保留上下文、口語指代與同品號多模穴歧義", "evidence": evidence,
                  "budget": budget_summary(), "audit": client.get("/api/audit").json()}
        (ROOT / ".local" / "model-multiturn.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        with (ROOT / ".local" / "evaluation-history.jsonl").open("a", encoding="utf-8") as history:
            history.write(json.dumps(result, ensure_ascii=False) + "\n")
