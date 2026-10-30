"""對話優先主線的公開 HTTP 回歸；只使用隔離 SQLite 合成資料。"""
from fastapi.testclient import TestClient
from app.main import create_app


def test_報工100改120保留缺料2且僅新增一次(tmp_path, monkeypatch):
    monkeypatch.setenv("MES_MODE", "simulation")
    with TestClient(create_app(tmp_path / "conversation.db")) as c:
        c.post("/api/session/demo", json={"identity": "operator"})
        cid = c.post("/api/conversations", json={"module": "report"}).json()["id"]
        path = f"/api/conversations/{cid}/guide"
        before = c.get("/api/workspace?module=report&execution_id=2001").json()["records"][0]
        assert before["EQP_NO"] == "MC37" and before["WO"] == "WO-A" and before["PART_NO"] == "EPS-A"
        g = c.post(path, json={"version": 0, "action": "report.add", "args": {"execution_id": "2001"}, "step": "details"}).json()
        g = c.post(path, json={"version": g["version"], "args": {"ok": 100, "defects": [{"code": "NG01", "quantity": 2}]}}).json()
        old = c.post(f"/api/conversations/{cid}/proposals", json={"version": g["version"], "action": g["action"], "args": g["args"]}).json()["proposal"]
        g = c.get(path).json()
        g = c.post(path, json={"version": g["version"], "args": {"ok": 120}, "step": "details"}).json()
        assert g["args"]["defects"] == [{"code": "NG01", "quantity": 2}]
        assert c.post(f"/api/proposals/{old['id']}/confirm", json={"digest": old["digest"], "approved": True}).json()["status"] == "superseded"
        assert c.get("/api/workspace?module=report&execution_id=2001").json()["records"][0] == before
        card = c.post(f"/api/conversations/{cid}/proposals", json={"version": g["version"], "action": g["action"], "args": g["args"]}).json()["proposal"]
        for _ in range(2):
            result = c.post(f"/api/proposals/{card['id']}/confirm", json={"digest": card["digest"], "approved": True})
            assert result.status_code == 200 and result.json()["status"] == "succeeded"
        after = c.get("/api/workspace?module=report&execution_id=2001").json()["records"][0]
        assert after["MANUAL_OK"] == before["MANUAL_OK"] + 120
        assert len(after["REPORTS"]) == len(before["REPORTS"]) + 1
        assert after["REPORTS"][-1]["OK_QTY"] == 120
