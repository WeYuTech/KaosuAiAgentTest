from fastapi.testclient import TestClient
from app.main import create_app


def test_重複確認只寫一次且其他操作者不可確認(tmp_path):
    app = create_app(db_path=tmp_path / "confirm.db")
    with TestClient(app) as client, TestClient(app) as other:
        client.post("/api/session/demo", json={"identity": "operator"})
        other.post("/api/session/demo", json={"identity": "supervisor"})
        p = client.post("/api/proposals", json={"module": "report", "action": "report.add", "args": {"execution_id": "2001", "ok": 15, "defects": []}}).json()["proposal"]
        body = {"digest": p["digest"], "approved": True}
        assert other.post(f"/api/proposals/{p['id']}/confirm", json=body).status_code == 404
        assert client.post(f"/api/proposals/{p['id']}/confirm", json=body).json()["status"] == "succeeded"
        assert client.post(f"/api/proposals/{p['id']}/confirm", json=body).json()["status"] == "succeeded"
        logs = client.get("/api/audit").json()["records"]
        assert len([r for r in logs if r["status"] == "succeeded"]) == 1
        row = next(r for r in client.get("/api/workspace?module=report").json()["records"] if r["WIP_OPI_WDOEACICO_HIST_SID"] == "2001")
        assert row["MANUAL_OK"] == 15


def test_取消與他人修改後的舊確認卡不會寫入(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "stale.db")) as client:
        client.post("/api/session/demo", json={"identity": "operator"})
        def proposal(qty):
            return client.post("/api/proposals", json={"module": "report", "action": "report.add", "args": {"execution_id": "2001", "ok": qty, "defects": []}}).json()["proposal"]
        first, second, cancelled = proposal(10), proposal(20), proposal(30)
        def confirm(p, approved):
            return client.post(f"/api/proposals/{p['id']}/confirm", json={"digest": p["digest"], "approved": approved})
        assert confirm(cancelled, False).json()["status"] == "cancelled"
        assert confirm(first, True).status_code == 200
        assert confirm(second, True).status_code == 409
        row = next(r for r in client.get("/api/workspace?module=report").json()["records"] if r["WIP_OPI_WDOEACICO_HIST_SID"] == "2001")
        assert row["MANUAL_OK"] == 10
