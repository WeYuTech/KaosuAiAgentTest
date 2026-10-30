"""真實模型對話驅動隔離資料完整生命週期，保留確認前後證據。"""
import json
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from app.main import create_app
from app.model import budget_summary

evidence = []
with tempfile.TemporaryDirectory() as folder, TestClient(create_app(db_path=Path(folder) / "lifecycle.db")) as client:
    client.post("/api/session/demo", json={"identity": "supervisor"}).raise_for_status()

    def operate(module, text, action):
        convo = client.post("/api/conversations", json={"module": module}).json()
        before = client.get(f"/api/workspace?module={module}").json()
        response = client.post(f"/api/conversations/{convo['id']}/messages", json={"text": text})
        data = response.json()
        p = data.get("proposal")
        evidence.append({"module": module, "prompt": text, "expected": action, "http": response.status_code, "response": data})
        assert response.status_code == 200, data
        assert p and p["action"] == action, "未建立預期確認卡，完整對話已保存至 .local/model-lifecycle.json"
        assert client.get(f"/api/workspace?module={module}").json() == before
        confirmed = client.post(f"/api/proposals/{p['id']}/confirm", json={"digest": p["digest"], "approved": True})
        assert confirmed.status_code == 200, confirmed.text
        assert confirmed.json()["status"] == "succeeded"
        evidence[-1]["confirmed"] = confirmed.json()
        print(json.dumps({"action": action, "status": "passed"}, ensure_ascii=False), flush=True)
        return confirmed.json()

    try:
        operate("schedule", "幫我新增排程：MC36，品號EPS-A，模具MOLD-A，2026年10月31日上午8點開始，週期60秒，10模，RUN，優先序3，備註模型驗收，明細只有EPS-A、工單WO-A、2穴。請給確認卡。", "schedule.save")
        saved = next(r for r in client.get("/api/workspace?module=schedule").json()["records"] if r["COMMENT"] == "模型驗收")
        sid, did = saved["ZZ_KAOSU_PROD_SCHEDULE_SID"], saved["DETAILS"][0]["ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID"]
        operate("schedule", f"修改排程{sid}的目標模次為12，其餘不變。保留原明細{did}（EPS-A、WO-A、2穴），請查詢原設定後準備確認卡。", "schedule.save")
        operate("mold", f"排程{sid}，MC36，現在上模開始。請給確認卡。", "mold.mount_start")
        operate("mold", f"排程{sid}，MC36，現在上模完成。請給確認卡。", "mold.mount_finish")
        execution = next(r for r in client.get("/api/workspace?module=report").json()["records"] if r["ZZ_KAOSU_PROD_SCHEDULE_SID"] == sid)
        eid = execution["WIP_OPI_WDOEACICO_HIST_SID"]
        operate("report", f"執行列{eid}報工：良品20個、缺料2個、破損1個。請給確認卡。", "report.add")
        execution = next(r for r in client.get("/api/workspace?module=report").json()["records"] if r["WIP_OPI_WDOEACICO_HIST_SID"] == eid)
        rid = execution["REPORTS"][0]["WIP_OPI_WDOEACICOOUTPUT_HIST_SID"]
        operate("report", f"修改單筆報工{rid}，人工良品改成19，缺料1個、破損3個。請給確認卡。", "report.update")
        operate("report", f"執行列{eid}模穴數改為3，請給確認卡。", "report.cavities")
        operate("report", f"刪除單筆人工報工{rid}，不是刪除工單，請給獨立確認卡。", "report.delete")
        operate("report", "請將排程1001完工，已知會影響同排程工單與下一排程時間，請給獨立確認卡。", "report.complete")
        operate("mold", f"排程{sid}，MC36，現在下模開始，請給確認卡。", "mold.unmount_start")
        operate("mold", f"排程{sid}，MC36，現在下模完成，同步出站與完工，請給獨立確認卡。", "mold.unmount_finish")
        operate("mold", f"清除排程{sid}的換模記錄。我知道會清四個換模時間、進出站時間並取消完工，請給獨立確認卡。", "mold.clear")
    finally:
        report = {"mode": "simulation", "evidence": evidence, "budget": budget_summary(), "audit": client.get("/api/audit").json()}
        output = Path(__file__).resolve().parents[1] / ".local" / "model-lifecycle.json"
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        with (output.parent / "evaluation-history.jsonl").open("a", encoding="utf-8") as history:
            history.write(json.dumps(report, ensure_ascii=False) + "\n")
