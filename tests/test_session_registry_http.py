"""原 ASP.NET Session 登記表身分橋接；只用 HTTP 與 SQL 替身。"""
from datetime import datetime, timezone
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.mes import MesBridge

SESSION_ID = "11111111-1111-4111-8111-111111111111"


@pytest.fixture
def registry_client(tmp_path, monkeypatch):
    monkeypatch.setenv("MES_MODE", "live")
    monkeypatch.setenv("MES_IDENTITY_CONTRACT", "session-registry-v1")
    monkeypatch.setenv("MES_BASE_URL", "http://127.0.0.1/KSS_MES")
    monkeypatch.setenv("MES_CONNECTION_STRING", "合成測試連線")
    monkeypatch.setenv("MES_MODULE_ALLOWLIST", json.dumps({"TEST": ["schedule", "report", "mold"]}))
    monkeypatch.setenv("MES_SERVER_UTC_OFFSET_HOURS", "7")
    config = MesBridge.from_env().config
    state = {"payload": {"SessionId": SESSION_ID, "Expiration": "2026-10-30 12:00:00"}, "status": 200, "deleted": False, "enabled": True, "requests": [], "sql": []}

    class RegistryDatabase:
        def cursor(self): return self
        def execute(self, sql, *params):
            state["sql"].append((sql, params))
            assert "SEC_APP_SESSION_REGISTRY" in sql
            assert "r.IS_DELETE=0" in sql and "u.ENABLE_FLAG=?" in sql
            assert "REFRESH_TOKEN" not in sql
            assert params == (SESSION_ID, "Y")
            return self
        def fetchmany(self, count):
            return [("1", "TEST", "可信測試帳號")] if state["enabled"] and not state["deleted"] else []
        def rollback(self): pass
        def close(self): pass

    def response(request):
        state["requests"].append(request)
        return httpx.Response(state["status"], json=state["payload"])

    bridge = MesBridge(config, transport=httpx.MockTransport(response), connect=lambda write: RegistryDatabase(), clock=lambda: datetime(2026, 10, 30, 4, tzinfo=timezone.utc))
    monkeypatch.setattr(MesBridge, "from_env", classmethod(lambda cls: bridge))
    with TestClient(create_app(tmp_path / "registry.db")) as client:
        client.cookies.set("ASP.NET_SessionId", "synthetic-session-cookie-001")
        yield client, state


def test_原查詢輪替Token後仍依可信Session登記辨識帳號(registry_client):
    client, state = registry_client
    for token in ("synthetic-original-token", "synthetic-renewed-token"):
        state["payload"]["TokenKey"] = token
        result = client.get("/api/session?UID=ATTACKER", headers={"X-User": "ATTACKER"})
        assert result.status_code == 200
        assert result.json()["actor"]["id"] == "TEST"
        assert token not in result.text and SESSION_ID not in result.text
    assert all(str(request.url) == "http://127.0.0.1/KSS_MES/AiAgentSession.ashx" for request in state["requests"])
    assert len(state["sql"]) == 2


@pytest.mark.parametrize("payload", [
    {"Expiration": "2026-10-30 12:00:00"},
    {"SessionId": "not-a-guid", "Expiration": "2026-10-30 12:00:00"},
    {"SessionId": "00000000-0000-0000-0000-000000000000", "Expiration": "2026-10-30 12:00:00"},
    {"SessionId": SESSION_ID, "Expiration": "2026-10-30 10:00:00"},
])
def test_缺少可信登記或期限失效不查SQL也不回退舊契約(registry_client, payload):
    client, state = registry_client
    state["payload"] = payload
    assert client.get("/api/session").status_code == 401
    assert state["sql"] == []
    assert len(state["requests"]) == 1
    assert state["requests"][0].url.path.endswith("/AiAgentSession.ashx")


@pytest.mark.parametrize("changed", [{"deleted": True}, {"enabled": False}, {"status": 403}])
def test_已刪登記停用帳號或橋接拒絕均拒絕身分(registry_client, changed):
    client, state = registry_client
    state.update(changed)
    assert client.get("/api/session").status_code == 401
    assert len(state["requests"]) == 1
    assert state["requests"][0].url.path.endswith("/AiAgentSession.ashx")
