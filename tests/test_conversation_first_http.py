"""對話優先主線的公開 HTTP 回歸；只使用隔離 SQLite 合成資料。"""
from fastapi.testclient import TestClient
from app.main import create_app
import pytest


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


@pytest.mark.parametrize("first_approval", [True, False])
def test_兩個登入連線反向確認仍採原終態(tmp_path, monkeypatch, first_approval):
    monkeypatch.setenv("MES_MODE", "simulation")
    app = create_app(tmp_path / "ordered-confirmation.db")
    with TestClient(app) as first, TestClient(app) as second:
        for client in (first, second):
            assert client.post("/api/session/demo", json={"identity": "operator"}).status_code == 200
        before = first.get("/api/workspace?module=report&execution_id=2001").json()["records"][0]
        cid = first.post("/api/conversations", json={"module": "report"}).json()["id"]
        guide = first.post(f"/api/conversations/{cid}/guide", json={"version": 0, "action": "report.add", "args": {"execution_id": "2001", "ok": 7, "defects": []}, "step": "details"}).json()
        card = first.post(f"/api/conversations/{cid}/proposals", json={"version": guide["version"], "action": guide["action"], "args": guide["args"]}).json()["proposal"]
        path = f"/api/proposals/{card['id']}/confirm"
        expected = "succeeded" if first_approval else "cancelled"
        # 明確控制到達順序，不以sleep推測競爭結果。
        for client, approved in ((first, first_approval), (second, not first_approval)):
            response = client.post(path, json={"digest": card["digest"], "approved": approved})
            assert response.status_code == 200
            assert response.json()["status"] == expected
            assert response.json()["proposal"]["id"] == card["id"]
        after = second.get("/api/workspace?module=report&execution_id=2001").json()["records"][0]
        assert len(after["REPORTS"]) == len(before["REPORTS"]) + int(first_approval)
        assert after["MANUAL_OK"] == before["MANUAL_OK"] + (7 if first_approval else 0)
        logs = second.get("/api/audit").json()["records"]
        assert len([row for row in logs if row["id"] == card["id"]]) == 1
