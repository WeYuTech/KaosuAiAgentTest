from fastapi.testclient import TestClient
from app.main import create_app


def test_MES子路徑反向代理保留同源確認請求(tmp_path):
    with TestClient(create_app(tmp_path / "prefix.db"), root_path="/KSS_MES/ai-agent") as client:
        headers = {"Origin": "http://testserver"}
        response = client.post("/api/session/demo", json={"identity": "operator"}, headers=headers)
        assert response.status_code == 200
        response = client.post("/api/proposals", json={"module": "report", "action": "report.add", "args": {"execution_id": "2001", "ok": 2, "defects": []}}, headers=headers)
        assert response.status_code == 200
        card = response.json()["proposal"]
        assert client.post(f"/api/proposals/{card['id']}/confirm", json={"digest": card["digest"], "approved": True}, headers=headers).json()["status"] == "succeeded"
        assert client.post("/api/session/demo", json={"identity": "operator"}, headers={"Origin": "https://other.invalid"}).status_code == 403
