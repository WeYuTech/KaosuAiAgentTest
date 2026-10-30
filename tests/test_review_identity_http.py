"""正式登入橋接與知識審核的公開 HTTP 驗證；來源均為合成資料。"""
import json
from datetime import datetime, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.mes import MesBridge, MesError


@pytest.fixture
def live_review(tmp_path, monkeypatch):
    monkeypatch.setenv("MES_MODE", "mes")
    monkeypatch.setenv("MES_BASE_URL", "https://mes.invalid/KSS_MES")
    monkeypatch.setenv("MES_CONNECTION_STRING", "合成測試連線")
    monkeypatch.setenv("MES_MODULE_ALLOWLIST", json.dumps({"WORKER": ["report", "mold"], "REVIEWER": ["report", "mold"], "LIMITED": ["report"]}))
    monkeypatch.setenv("MES_KNOWLEDGE_REVIEWERS", '["REVIEWER","LIMITED"]')
    bridge = MesBridge.from_env()
    bridge._clock = lambda: datetime(2026, 10, 30, tzinfo=timezone.utc)

    class IdentityDatabase:
        def cursor(self): return self
        def execute(self, sql, *parameters): self.account = parameters[1].removeprefix("synthetic-token-"); return self
        def fetchmany(self, count): return [("1", self.account, "合成測試人員")]
        def rollback(self): pass
        def close(self): pass

    def session_source(request):
        account = request.headers["cookie"].split("=", 1)[1].removeprefix("synthetic-session-")
        return httpx.Response(200, json={"TokenKey": "synthetic-token-" + account, "Expiration": "2026-10-31T00:00:00+00:00"})

    bridge._transport = httpx.MockTransport(session_source)
    bridge._connector = lambda write: IdentityDatabase()
    monkeypatch.setattr(MesBridge, "from_env", classmethod(lambda cls: bridge))
    with TestClient(create_app(db_path=tmp_path / "review.db")) as client:
        def sign_in(account):
            client.cookies.set("ASP.NET_SessionId", "synthetic-session-" + account)
        yield client, sign_in


def test_正式可信主管可審核但不直接發布(live_review):
    client, sign_in = live_review
    sign_in("WORKER")
    entry = client.post("/api/feedback", json={"module": "report", "message": "請說明人工產量"}).json()
    sign_in("REVIEWER")
    assert "review" in client.get("/api/session").json()["actor"]["roles"]
    response = client.post(f"/api/feedback/{entry['id']}/review", json={"text": "人工與 IoT 產量分開。", "source": "合成測試來源"})
    assert response.status_code == 200
    assert response.json()["status"] == "reviewed"
    assert all(row["id"] != entry["id"] for row in client.get("/api/knowledge?module=report").json()["records"])


def test_一般帳號不能以請求聲稱主管身分(live_review):
    client, sign_in = live_review
    sign_in("WORKER")
    entry = client.post("/api/feedback", json={"module": "report", "message": "請補說明"}).json()
    assert "review" not in client.get("/api/session", headers={"X-Role": "review"}).json()["actor"]["roles"]
    assert client.post(f"/api/feedback/{entry['id']}/review", json={"text": "自行宣告核准", "source": "測試"}, headers={"X-Role": "review"}).status_code == 403


def test_主管只能查看及審核獲授權模組(live_review):
    client, sign_in = live_review
    sign_in("WORKER")
    entry = client.post("/api/feedback", json={"module": "mold", "message": "上下模說明"}).json()
    sign_in("LIMITED")
    assert "review" in client.get("/api/session").json()["actor"]["roles"]
    assert all(row["id"] != entry["id"] for row in client.get("/api/feedback").json()["records"])
    assert client.post(f"/api/feedback/{entry['id']}/review", json={"text": "跨模組審核", "source": "測試"}).status_code == 403


@pytest.mark.parametrize("invalid", ['{}', '[true]', '[" "]', '["TEST",null]'])
def test_審核部署清單拒絕無效設定(monkeypatch, invalid):
    monkeypatch.setenv("MES_BASE_URL", "https://mes.invalid/KSS_MES")
    monkeypatch.setenv("MES_CONNECTION_STRING", "合成測試連線")
    monkeypatch.setenv("MES_KNOWLEDGE_REVIEWERS", invalid)
    with pytest.raises(MesError):
        MesBridge.from_env()


def test_正式主管跨人員稽核紀錄也受模組權限限制(live_review, tmp_path, monkeypatch):
    client, sign_in = live_review
    monkeypatch.setenv("MES_MODE", "simulation")
    with TestClient(create_app(db_path=tmp_path / "review.db")) as simulation:
        for identity, module, action, args in [
            ("operator", "report", "report.add", {"execution_id": "2001", "ok": 1, "defects": []}),
            ("technician", "mold", "mold.mount_start", {"schedule_id": "1003"}),
        ]:
            simulation.post("/api/session/demo", json={"identity": identity})
            proposal = simulation.post("/api/proposals", json={"module": module, "action": action, "args": args}).json()["proposal"]
            assert simulation.post(f"/api/proposals/{proposal['id']}/confirm", json={"digest": proposal["digest"], "approved": False}).status_code == 200
    monkeypatch.setenv("MES_MODE", "mes")
    sign_in("LIMITED")
    assert {row["module"] for row in client.get("/api/audit").json()["records"]} == {"report"}
    sign_in("REVIEWER")
    assert {row["module"] for row in client.get("/api/audit").json()["records"]} == {"report", "mold"}


def test_一般帳號只能查看自己的回饋(live_review):
    client, sign_in = live_review
    sign_in("REVIEWER")
    other = client.post("/api/feedback", json={"module": "report", "message": "其他人回饋"}).json()
    sign_in("WORKER")
    own = client.post("/api/feedback", json={"module": "report", "message": "我的回饋"}).json()
    assert {row["id"] for row in client.get("/api/feedback").json()["records"]} == {own["id"]}
    assert own["id"] != other["id"]


def test_未設定清單預設無主管審核授權(monkeypatch):
    monkeypatch.setenv("MES_BASE_URL", "https://mes.invalid/KSS_MES")
    monkeypatch.setenv("MES_CONNECTION_STRING", "合成測試連線")
    monkeypatch.delenv("MES_KNOWLEDGE_REVIEWERS", raising=False)
    assert MesBridge.from_env().config.knowledge_reviewers == ()
