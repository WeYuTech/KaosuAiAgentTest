from fastapi.testclient import TestClient
from app.main import create_app


def test_模擬登入後才能查看模組資料(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "test.db")) as client:
        assert client.get("/api/workspace?module=schedule").status_code == 401
        result = client.post("/api/session/demo", json={"identity": "planner"})
        assert result.status_code == 200
        assert result.json()["actor"]["id"] == "DEMO_PLANNER"
        assert result.json()["mode"] == "simulation"
        assert client.get("/api/workspace?module=schedule").status_code == 200
