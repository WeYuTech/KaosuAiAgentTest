from fastapi.testclient import TestClient
from app.main import create_app


def test_錯誤回饋不會直接污染已發布知識(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "feedback.db")) as client:
        client.post("/api/session/demo", json={"identity": "operator"})
        r = client.post("/api/feedback", json={"module": "report", "message": "剛才把人工良品當成IoT，請修正。"})
        assert r.status_code == 200
        feedback_id = r.json()["id"]
        assert r.json()["status"] == "pending"
        assert client.post(f"/api/feedback/{feedback_id}/review", json={"text": "人工良品與IoT分開。", "source": "docs/inventory/report.md"}).status_code == 403
        client.post("/api/session/demo", json={"identity": "supervisor"})
        result = client.post(f"/api/feedback/{feedback_id}/review", json={"text": "人工良品與IoT分開。", "source": "docs/inventory/report.md"})
        assert result.status_code == 200
        assert result.json()["status"] == "reviewed"
        assert not any(k["id"] == feedback_id for k in client.get("/api/knowledge?module=report").json()["records"])
