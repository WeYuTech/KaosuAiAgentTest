import json
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from app.main import create_app as _create_app


def create_app(*args, **kwargs):
    """既有業務回歸固定為修改意圖，分類器由 Issue27 的獨立測試驗證。"""
    kwargs.setdefault("intent_classifier", lambda _: {"intent": "change"})
    return _create_app(*args, **kwargs)

from app.mes import MesBridge, MesError


@pytest.mark.parametrize("tool,code", [("query_workspace", "scope_too_large"), ("prepare_report_add", "validation")])
def test_正式查詢與草稿卡控回饋模型補問並保留對話(tmp_path, monkeypatch, tool, code):
    class Bridge:
        def resolve_identity(self, cookie, module):
            return {"id": "TEST", "roles": ["report"]}
        def snapshot(self, *args):
            raise MesError("請提供設備縮小查詢範圍", code)
        def prepare(self, *args):
            raise MesError("請核對工單與數量", code)
    monkeypatch.setenv("MES_MODE", "live")
    monkeypatch.setenv("OPENAI_API_KEY", "synthetic-no-network")
    monkeypatch.setattr(MesBridge, "from_env", classmethod(lambda cls: Bridge()))
    from app import model
    calls = []
    def response(payload):
        calls.append(payload)
        if len(calls) == 1:
            data = {"type": "function_call", "name": tool, "arguments": json.dumps({} if tool == "query_workspace" else {"execution_id": "2001", "ok": 5, "defects": []}), "call_id": "tool-1"}
            call = SimpleNamespace(**data, model_dump=lambda **kwargs: data)
            return SimpleNamespace(output=[call])
        assert payload["input"][-1]["type"] == "function_call_output"
        assert code in payload["input"][-1]["output"]
        return SimpleNamespace(output=[], output_text="請補充設備或核對工單；先前良品5個的需求已保留。")
    monkeypatch.setattr(model, "invoke", response)
    with TestClient(create_app(tmp_path / "dialogue.db")) as client:
        cid = client.post("/api/conversations", json={"module": "report"}).json()["id"]
        reply = client.post(f"/api/conversations/{cid}/messages", json={"text": "我要報良品5個"})
        assert reply.status_code == 200, reply.text
        assert reply.json()["proposal"] is None
        assert "已保留" in reply.json()["messages"][-1]["content"]
        assert len(client.get(f"/api/conversations/{cid}").json()["messages"]) == 2


def test_模型服務失敗仍保留人員輸入供後續補問(tmp_path):
    def unavailable(*args):
        from fastapi import HTTPException
        raise HTTPException(502, "模型暫時不可用")
    with TestClient(create_app(tmp_path / "failure.db", unavailable)) as client:
        client.post("/api/session/demo", json={"identity": "operator"})
        cid = client.post("/api/conversations", json={"module": "report"}).json()["id"]
        assert client.post(f"/api/conversations/{cid}/messages", json={"text": "MC37良品5個"}).status_code == 502
        assert client.get(f"/api/conversations/{cid}").json()["messages"] == [{"role": "user", "content": "MC37良品5個"}]


class ExpiringBridge:
    """可控秒數模擬短期 proof 與獨立 MES Session，完全不使用網路。"""

    def __init__(self):
        self.seconds = 0
        self.session = "valid"
        self.validations = []
        self.tools = []

    def resolve_identity(self, cookie, module):
        assert cookie == "ASP.NET_SessionId=synthetic-session-cookie"
        if self.session == "expired":
            raise MesError("MES Session 已過期", "unauthorized")
        if module != "report" or self.session == "revoked":
            raise MesError("模組權限已撤回", "forbidden")
        self.validations.append((module, self.seconds))
        return {"id": "OTHER" if self.session == "changed" else "TEST", "user_sid": "2" if self.session in {"changed", "sid_changed"} else "1", "roles": ["report"], "_expires": self.seconds + 60}

    def _check(self, actor, module, tool):
        if actor["_expires"] <= self.seconds:
            raise MesError("可信登入已過期，請重新驗證。", "unauthorized")
        assert actor["id"] == "TEST" and module == "report"
        self.tools.append((tool, self.seconds))

    def snapshot(self, actor, module, filters):
        self._check(actor, module, "query")
        return {"records": [{"WIP_OPI_WDOEACICO_HIST_SID": "2001", "EQP_NO": "MC37"}], "catalogs": {}}

    def prepare(self, actor, module, action, args):
        self._check(actor, module, "prepare")
        return {"changes": [{"table": "合成報工表", "key": "2001", "field": "OK_QTY", "before": 0, "after": 5}], "version": "synthetic-version", "writes_enabled": False}


def model_tool(name, args, index):
    data = {"type": "function_call", "name": name, "arguments": json.dumps(args), "call_id": f"synthetic-{index}"}
    call = SimpleNamespace(**data, model_dump=lambda **kwargs: data)
    return SimpleNamespace(output=[call])


def live_client(tmp_path, monkeypatch, bridge, model=None):
    monkeypatch.setenv("MES_MODE", "live")
    monkeypatch.setenv("OPENAI_API_KEY", "synthetic-no-network")
    monkeypatch.setattr(MesBridge, "from_env", classmethod(lambda cls: bridge))
    return TestClient(create_app(tmp_path / "proof-renewal.db", model), headers={"Cookie": "ASP.NET_SessionId=synthetic-session-cookie"})


def test_長對話每次正式查詢與草稿前重新驗證相同身分(tmp_path, monkeypatch):
    bridge = ExpiringBridge()
    from app import model
    calls = []

    def response(payload):
        assert "synthetic-session-cookie" not in json.dumps(payload)
        calls.append(payload)
        bridge.seconds += 61
        if len(calls) < 3:
            return model_tool("query_workspace", {"execution_id": "2001"}, len(calls))
        return model_tool("prepare_report_add", {"execution_id": "2001", "ok": 5, "defects": []}, len(calls))

    monkeypatch.setattr(model, "invoke", response)
    with live_client(tmp_path, monkeypatch, bridge) as client:
        cid = client.post("/api/conversations", json={"module": "report"}).json()["id"]
        reply = client.post(f"/api/conversations/{cid}/messages", json={"text": "MC37良品5個"})
        assert reply.status_code == 200, reply.text
        assert reply.json()["proposal"]["actor_id"] == "TEST"
        assert reply.json()["proposal"]["writes_enabled"] is False
        assert bridge.tools == [("query", 61), ("query", 122), ("prepare", 183)]
        assert all(("report", moment) in bridge.validations for moment in (61, 122, 183))
        assert bridge.validations[-1] == ("report", 183)  # 回傳前仍重新確認可信身分。


@pytest.mark.parametrize("session,status", [("changed", 401), ("sid_changed", 401), ("expired", 401), ("revoked", 403)])
@pytest.mark.parametrize("stage", ["query", "prepare", "fallback"])
def test_模型等待期間切換身分或登入失效不得續接工具(tmp_path, monkeypatch, session, status, stage):
    bridge = ExpiringBridge()
    from app import model

    # 查詢與草稿均在取得模型回覆後才改變登入狀態，不能沿用進入 HTTP 時的 proof。
    def response(payload):
        bridge.session = session
        return model_tool("query_workspace" if stage == "query" else "prepare_report_add", {} if stage == "query" else {"execution_id": "2001", "ok": 5, "defects": []}, 1)

    def fallback(conversation, state, store):
        bridge.session = session
        return {"content": "已整理需求", "action": "report.add", "args": {"execution_id": "2001", "ok": 5, "defects": []}}

    monkeypatch.setattr(model, "invoke", response)
    with live_client(tmp_path, monkeypatch, bridge, fallback if stage == "fallback" else None) as client:
        cid = client.post("/api/conversations", json={"module": "report"}).json()["id"]
        reply = client.post(f"/api/conversations/{cid}/messages", json={"text": "MC37良品5個"})
        assert reply.status_code == status, reply.text
        assert bridge.tools == []
        bridge.session = "valid"
        stored = client.get(f"/api/conversations/{cid}").json()
        assert stored["messages"] == [{"role": "user", "content": "MC37良品5個"}]


def test_替代模型回傳動作也先更新正式身分證明(tmp_path, monkeypatch):
    bridge = ExpiringBridge()

    def response(conversation, state, store):
        bridge.seconds += 61
        return {"content": "已整理需求", "action": "report.add", "args": {"execution_id": "2001", "ok": 5, "defects": []}}

    with live_client(tmp_path, monkeypatch, bridge, response) as client:
        cid = client.post("/api/conversations", json={"module": "report"}).json()["id"]
        reply = client.post(f"/api/conversations/{cid}/messages", json={"text": "MC37良品5個"})
        assert reply.status_code == 200, reply.text
        assert reply.json()["proposal"]["actor_id"] == "TEST"
        assert bridge.tools == [("prepare", 61)]
