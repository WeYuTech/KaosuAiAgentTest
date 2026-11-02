"""以公開 HTTP 驗證持久化引導草稿；不呼叫付費模型。"""
from fastapi.testclient import TestClient
from app.main import create_app as _create_app


def create_app(*args, **kwargs):
    """既有業務回歸固定為修改意圖，分類器由 Issue27 的獨立測試驗證。"""
    kwargs.setdefault("intent_classifier", lambda _: {"intent": "change"})
    return _create_app(*args, **kwargs)

import pytest


@pytest.mark.parametrize("locale,expected", [("en", "Please provide"), ("th", "โปรดระบุ")])
@pytest.mark.parametrize("exhausted", [False, True])
def test_模型空回覆或工具輪次用盡依對話語言補問(tmp_path, monkeypatch, locale, expected, exhausted):
    from types import SimpleNamespace
    from test_live_dialogue_validation import model_tool
    from app import model
    monkeypatch.setenv("OPENAI_API_KEY", "synthetic-no-network")
    calls = []
    def response(payload):
        calls.append(payload)
        return model_tool("query_workspace", {"execution_id": "2001"}, len(calls)) if exhausted else SimpleNamespace(output=[], output_text="")
    monkeypatch.setattr(model, "invoke", response)
    with TestClient(create_app(tmp_path / "fallback.db")) as client:
        client.post("/api/session/demo", json={"identity": "operator"})
        cid = client.post("/api/conversations", json={"module": "report", "locale": locale}).json()["id"]
        reply = client.post(f"/api/conversations/{cid}/messages", json={"text": "MC37"})
        assert reply.status_code == 200, reply.text
        content = reply.json()["messages"][-1]["content"]
        assert expected in content and "請提供" not in content and "請補充" not in content
        assert not reply.json()["proposal"]
        assert len(calls) == (5 if exhausted else 1)


def test_自然語言不完整需求同步引導並依選定語言補問(tmp_path, monkeypatch):
    from types import SimpleNamespace
    from test_live_dialogue_validation import model_tool
    from app import model
    monkeypatch.setenv("OPENAI_API_KEY", "synthetic-no-network")
    calls = []
    def response(payload):
        calls.append(payload)
        assert "English" in payload["instructions"]
        if len(calls) == 1:
            assert any(t["name"] == "update_operation_draft" for t in payload["tools"])
            return model_tool("update_operation_draft", {"version": 0, "action": "report.add", "args": {"ok": 20}, "step": "target"}, 1)
        assert '"missing":["execution_id","defects"]' in payload["input"][-1]["output"]
        return SimpleNamespace(output=[], output_text="Which work order? Are there any defects?")
    monkeypatch.setattr(model, "invoke", response)
    with TestClient(create_app(tmp_path / "partial.db")) as client:
        client.post("/api/session/demo", json={"identity": "operator"})
        cid = client.post("/api/conversations", json={"module": "report", "locale": "en"}).json()["id"]
        reply = client.post(f"/api/conversations/{cid}/messages", json={"text": "20 good units"})
        assert reply.status_code == 200, reply.text
        guide = reply.json()["guide"]
        assert guide["args"] == {"ok": 20} and not guide["ready"] and not guide.get("proposal")
        assert client.get(f"/api/conversations/{cid}/guide").json() == guide
        assert "work order" in reply.json()["messages"][-1]["content"]


def test_引導逐步合併不寫入且版本化準備確認卡(tmp_path):
    with TestClient(create_app(tmp_path / "guide.db")) as client:
        client.post("/api/session/demo", json={"identity": "operator"})
        cid = client.post("/api/conversations", json={"module": "report", "locale": "en"}).json()["id"]
        path = f"/api/conversations/{cid}/guide"
        initial = client.get(path).json()
        assert initial["version"] == 0 and initial["missing"] == ["action"]
        selected = client.post(path, json={"version": 0, "action": "report.add", "args": {"execution_id": "2001"}, "step": "details"})
        assert selected.status_code == 200, selected.text
        guide = selected.json()
        assert guide["missing"] == ["ok", "defects"] and not guide["ready"]
        assert client.get(path).json() == guide
        stale = client.post(path, json={"version": 0, "args": {"ok": 100}})
        assert stale.status_code == 409 and stale.json()["code"] == "guide_stale"
        ready = client.post(path, json={"version": guide["version"], "args": {"ok": 20, "defects": []}, "step": "review"}).json()
        assert ready["ready"] and ready["args"] == {"execution_id": "2001", "ok": 20, "defects": []}
        assert not ready.get("proposal")
        assert client.get("/api/workspace?module=report&execution_id=2001").json()["records"][0]["MANUAL_OK"] == 0
        result = client.post(f"/api/conversations/{cid}/proposals", json={"version": ready["version"], "action": ready["action"], "args": ready["args"]})
        assert result.status_code == 200, result.text
        card = result.json()["proposal"]
        assert client.get(path).json()["proposal"]["id"] == card["id"]
        changed = client.post(path, json={"version": client.get(path).json()["version"], "args": {"ok": 21}})
        assert changed.status_code == 200
        assert client.get(f"/api/proposals/{card['id']}").json()["proposal"]["status"] == "superseded"
        assert client.post(f"/api/proposals/{card['id']}/confirm", json={"digest": card["digest"], "approved": True}).json()["status"] == "superseded"


def test_補上第一個目標保留已知數量但換目標與清除會移除關聯(tmp_path):
    with TestClient(create_app(tmp_path / "targets.db")) as client:
        client.post("/api/session/demo", json={"identity": "supervisor"})
        cid = client.post("/api/conversations", json={"module": "report"}).json()["id"]
        path = f"/api/conversations/{cid}/guide"
        first = client.post(path, json={"version": 0, "action": "report.add", "args": {"ok": 20}}).json()
        bound = client.post(path, json={"version": first["version"], "args": {"execution_id": "2001", "defects": []}}).json()
        assert bound["ready"] and bound["args"]["ok"] == 20
        moved = client.post(path, json={"version": bound["version"], "args": {"execution_id": "2002"}}).json()
        assert moved["args"] == {"execution_id": "2002"}
        cleared = client.post(path, json={"version": moved["version"], "args": {"execution_id": None}}).json()
        assert cleared["args"] == {}
        assert client.post(path, json={"version": cleared["version"], "action": "mold.clear"}).status_code == 422
        assert client.post(path, json={"version": cleared["version"], "args": {"sql": "不得執行"}}).status_code == 422


@pytest.mark.parametrize("locale", ["en", "th"])
def test_切換語言保持確認卡與草稿版本且錯誤有穩定代碼(tmp_path, locale):
    with TestClient(create_app(tmp_path / "locale.db")) as client:
        client.post("/api/session/demo", json={"identity": "operator"})
        cid = client.post("/api/conversations", json={"module": "report"}).json()["id"]
        prefix = f"/api/conversations/{cid}"
        card = client.post(prefix + "/proposals", json={"action": "report.add", "args": {"execution_id": "2001", "ok": 5, "defects": []}}).json()["proposal"]
        before = client.get(prefix).json()
        guide = client.get(prefix + "/guide").json()
        assert client.post(prefix + "/locale", json={"locale": locale}).json() == {"locale": locale}
        after = client.get(prefix).json()
        assert after["revision"] == before["revision"] and after["locale"] == locale
        assert client.get(prefix + "/guide").json() == guide
        error = client.post(prefix + "/guide", json={"version": 0, "args": {"ok": 8}})
        assert error.status_code == 409
        assert error.json()["code"] == "guide_stale" and error.json()["params"]["current_version"] == guide["version"]
        assert error.json()["message"] != error.json()["detail"]["message"]
        assert client.post(f"/api/proposals/{card['id']}/confirm", json={"digest": card["digest"], "approved": True}).json()["status"] == "succeeded"
        result = client.get(prefix + "/guide").json()
        assert result["proposal"]["status"] == "succeeded" and result["step"] == "result"


def test_英文提問可用中文知識詞彙檢索且不吸收未審回饋(tmp_path, monkeypatch):
    from types import SimpleNamespace
    from test_live_dialogue_validation import model_tool
    from app import model
    import json
    monkeypatch.setenv("OPENAI_API_KEY", "synthetic-no-network")
    calls = []
    def response(payload):
        calls.append(payload)
        if len(calls) == 1:
            return model_tool("search_operation_knowledge", {"query": "人工報工 良品 IoT 不良"}, 1)
        knowledge = json.loads(payload["input"][-1]["output"])["records"]
        assert any(row["id"] == "report-semantics" for row in knowledge)
        assert all(row["status"] == "published" for row in knowledge)
        assert "未審核測試建議直接寫入" not in payload["input"][-1]["output"]
        return SimpleNamespace(output=[], output_text="Manual good quantity and IoT inferred good quantity are different.")
    monkeypatch.setattr(model, "invoke", response)
    with TestClient(create_app(tmp_path / "cross-language.db")) as client:
        client.post("/api/session/demo", json={"identity": "operator"})
        client.post("/api/feedback", json={"module": "report", "message": "未審核測試建議直接寫入"})
        cid = client.post("/api/conversations", json={"module": "report", "locale": "en"}).json()["id"]
        reply = client.post(f"/api/conversations/{cid}/messages", json={"text": "How does manual good quantity differ from IoT?"})
        assert reply.status_code == 200, reply.text
        assert any(row["id"] == "report-semantics" for row in reply.json()["messages"][-1]["knowledge"])
        assert not reply.json()["proposal"]


def test_引導三模組完整流程保留原卡控與人工確認(tmp_path):
    with TestClient(create_app(tmp_path / "pipeline.db")) as client:
        client.post("/api/session/demo", json={"identity": "supervisor"})
        def run(cid, action, args):
            path = f"/api/conversations/{cid}"
            version = client.get(path + "/guide").json()["version"]
            intent = {"intent": "update" if args.get("schedule_id") else "create"} if action == "schedule.save" else {}
            saved = client.post(path + "/guide", json={"version": version, "action": action, "args": args, "step": "review", **intent})
            assert saved.status_code == 200, saved.text
            draft = saved.json()
            assert draft["ready"], draft
            prepared = client.post(path + "/proposals", json={"version": draft["version"], "action": action, "args": draft["args"]})
            assert prepared.status_code == 200, prepared.text
            card = prepared.json()["proposal"]
            result = client.post(f"/api/proposals/{card['id']}/confirm", json={"digest": card["digest"], "approved": True})
            assert result.status_code == 200 and result.json()["status"] == "succeeded", result.text
            assert client.get(path + "/guide").json()["step"] == "result"
            return card
        schedule = client.post("/api/conversations", json={"module": "schedule"}).json()["id"]
        args = {"equipment": "MC36", "part_no": "EPS-A", "mold_no": "MOLD-A", "start_time": "2026-10-31 08:00", "cycle_seconds": 60, "target_shots": 10, "status": "DO", "details": [{"part_no": "EPS-A", "wo": "WO-A", "cavities": 2}]}
        created = run(schedule, "schedule.save", args)
        run(schedule, "schedule.save", {**args, "schedule_id": created["target"]["schedule_id"], "target_shots": 11})
        report = client.post("/api/conversations", json={"module": "report"}).json()["id"]
        run(report, "report.add", {"execution_id": "2001", "ok": 20, "defects": []})
        rid = client.get("/api/workspace?module=report&execution_id=2001").json()["records"][0]["REPORTS"][0]["WIP_OPI_WDOEACICOOUTPUT_HIST_SID"]
        run(report, "report.update", {"report_id": rid, "ok": 21, "defects": [{"code": "NG01", "quantity": 1}]})
        run(report, "report.delete", {"report_id": rid})
        run(report, "report.cavities", {"execution_id": "2001", "cavities": 3})
        run(report, "report.complete", {"schedule_id": "1001"})
        mold = client.post("/api/conversations", json={"module": "mold"}).json()["id"]
        for action in ("mount_start", "mount_finish", "unmount_start", "unmount_finish", "clear"):
            run(mold, "mold." + action, {"schedule_id": "1003"})
        assert len([r for r in client.get("/api/audit").json()["records"] if r["status"] == "succeeded"]) == 12


def test_未知結果鎖定引導與新確認卡直到唯讀核對成功(tmp_path, monkeypatch):
    from app.mes import MesBridge
    from test_operation_reconciliation import UncertainMes
    bridge = UncertainMes()
    monkeypatch.setenv("MES_MODE", "live")
    monkeypatch.setattr(MesBridge, "from_env", classmethod(lambda cls: bridge))
    with TestClient(create_app(tmp_path / "unknown-guide.db")) as client:
        cid = client.post("/api/conversations", json={"module": "report"}).json()["id"]
        path = f"/api/conversations/{cid}"
        body = {"action": "report.cavities", "args": {"execution_id": "2001", "cavities": 3}}
        card = client.post(path + "/proposals", json=body).json()["proposal"]
        assert client.post(f"/api/proposals/{card['id']}/confirm", json={"digest": card["digest"], "approved": True}).json()["status"] == "unknown"
        guide = client.get(path + "/guide").json()
        assert guide["proposal"]["status"] == "unknown" and guide["step"] == "result"
        for suffix, payload in [("/guide", {"version": guide["version"], "args": {"cavities": 4}}), ("/proposals", body), ("/messages", {"text": "再試一次"})]:
            rejected = client.post(path + suffix, json=payload)
            assert rejected.status_code == 409 and rejected.json()["code"] == "outcome_unknown"
        assert client.post(path + "/locale", json={"locale": "th"}).status_code == 200
        bridge.found = True
        assert client.post(f"/api/proposals/{card['id']}/reconcile", json={}).json()["status"] == "succeeded"
        assert client.get(path + "/guide").json()["proposal"]["status"] == "succeeded"
        assert client.post(path + "/guide", json={"version": guide["version"], "args": {"cavities": 4}}).status_code == 200
        assert bridge.writes == 1


def test_英文卡控說明指出欄位原因與下一個換模動作(tmp_path):
    with TestClient(create_app(tmp_path / "explain.db"), headers={"X-AI-Locale": "en"}) as client:
        client.post("/api/session/demo", json={"identity": "supervisor"})
        cid = client.post("/api/conversations", json={"module": "report", "locale": "en"}).json()["id"]
        bad = client.post(f"/api/conversations/{cid}/guide", json={"version": 0, "action": "report.cavities", "args": {"execution_id": "2001", "cavities": -1}})
        assert bad.json()["code"] == "guide_invalid" and bad.json()["params"]["field"] == "cavities"
        assert "Cavities" in bad.json()["message"] and "0" in bad.json()["message"]
        stage = client.post("/api/proposals", json={"module": "mold", "action": "mold.mount_finish", "args": {"schedule_id": "1003"}})
        assert stage.status_code == 422
        assert stage.json()["params"]["expected_action"] == "mold.mount_start"
        assert "Start mounting" in stage.json()["message"]


def test_共用對話處理中禁止競爭改稿但允許語言切換且拒絕舊版本準備(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    entered, release = Event(), Event()
    def slow_model(*args):
        entered.set()
        assert release.wait(5)
        return {"content": "請選擇工單。"}
    database = tmp_path / "race.db"
    with TestClient(create_app(database, slow_model)) as first, TestClient(create_app(database)) as second:
        first.post("/api/session/demo", json={"identity": "operator"})
        second.cookies.update(first.cookies)
        cid = first.post("/api/conversations", json={"module": "report"}).json()["id"]
        path = f"/api/conversations/{cid}"
        with ThreadPoolExecutor(max_workers=1) as pool:
            running = pool.submit(first.post, path + "/messages", json={"text": "開始報工"})
            assert entered.wait(5)
            conflict = second.post(path + "/guide", json={"version": 0, "action": "report.add"})
            assert conflict.status_code == 409 and conflict.json()["code"] == "conversation_busy"
            assert second.post(path + "/locale", json={"locale": "th"}).status_code == 200
            release.set()
            assert running.result(5).status_code == 200
        assert first.get(path).json()["locale"] == "th"
        assert first.get(path + "/guide").json()["version"] == 0
        first.post(path + "/guide", json={"version": 0, "action": "report.add", "args": {"execution_id": "2001", "ok": 5, "defects": []}})
        stale = second.post(path + "/proposals", json={"version": 0, "action": "report.add", "args": {"execution_id": "2001", "ok": 7, "defects": []}})
        assert stale.status_code == 409 and stale.json()["code"] == "guide_stale"
        assert first.get(path + "/guide").json()["args"]["ok"] == 5


def test_自然語言更新引導工具前重新驗證MES登入(tmp_path, monkeypatch):
    from test_live_dialogue_validation import ExpiringBridge, live_client, model_tool
    from app import model
    bridge = ExpiringBridge()
    def response(payload):
        bridge.session = "changed"
        return model_tool("update_operation_draft", {"version": 0, "action": "report.add", "args": {"ok": 5}}, 1)
    monkeypatch.setattr(model, "invoke", response)
    with live_client(tmp_path, monkeypatch, bridge) as client:
        cid = client.post("/api/conversations", json={"module": "report"}).json()["id"]
        path = f"/api/conversations/{cid}"
        assert client.post(path + "/messages", json={"text": "良品5個"}).status_code == 401
        bridge.session = "valid"
        assert client.get(path + "/guide").json()["args"] == {}


def test_引導不信任新識別且不允他人讀改對話(tmp_path):
    app = create_app(tmp_path / "ownership-guide.db")
    with TestClient(app) as owner, TestClient(app) as other:
        owner.post("/api/session/demo", json={"identity": "supervisor"})
        other.post("/api/session/demo", json={"identity": "operator"})
        cid = owner.post("/api/conversations", json={"module": "report"}).json()["id"]
        path = f"/api/conversations/{cid}"
        assert other.get(path + "/guide").status_code == 404
        assert other.post(path + "/guide", json={"version": 0, "action": "report.add"}).status_code == 404
        assert other.post(path + "/locale", json={"locale": "en"}).status_code == 404
        draft = owner.post(path + "/guide", json={"version": 0, "action": "report.add", "args": {"execution_id": "虛構識別", "ok": 5, "defects": []}}).json()
        assert draft["ready"]
        rejected = owner.post(path + "/proposals", json={"version": draft["version"], "action": draft["action"], "args": draft["args"]})
        assert rejected.status_code == 422 and rejected.json()["code"] == "not_found"
        assert not owner.get(path + "/guide").json().get("proposal")


def test_修改排程尚未選目標時刷新仍保留修改意圖(tmp_path):
    with TestClient(create_app(tmp_path / "intent.db")) as client:
        client.post("/api/session/demo", json={"identity": "planner"})
        cid = client.post("/api/conversations", json={"module": "schedule"}).json()["id"]
        path = f"/api/conversations/{cid}/guide"
        edited = client.post(path, json={"version": 0, "action": "schedule.save", "intent": "update", "step": "target"})
        assert edited.status_code == 200, edited.text
        assert edited.json()["intent"] == "update" and "schedule_id" in edited.json()["missing"]
        restored = client.get(path).json()
        assert restored == edited.json() and not restored["ready"]
        bad_args = {"equipment": "MC36", "part_no": "EPS-A", "mold_no": "MOLD-A", "start_time": "2026-10-31 08:00", "cycle_seconds": 60, "target_shots": 10, "status": "DO", "details": [{"part_no": "EPS-A", "wo": "WO-A", "cavities": 2}]}
        disguised_create = client.post(f"/api/conversations/{cid}/proposals", json={"action": "schedule.save", "args": bad_args})
        assert disguised_create.status_code == 422
        selected = client.post(path, json={"version": restored["version"], "args": {"schedule_id": "1001", "comment": "舊目標"}}).json()
        created = client.post(path, json={"version": selected["version"], "intent": "create", "step": "target"}).json()
        assert created["intent"] == "create" and created["args"] == {}


@pytest.mark.parametrize("intent", ["create", "update"])
def test_首次補充排程意圖保留已知設備品號(tmp_path, intent):
    with TestClient(create_app(tmp_path / "first-intent.db")) as client:
        client.post("/api/session/demo", json={"identity": "planner"})
        cid = client.post("/api/conversations", json={"module": "schedule"}).json()["id"]
        path = f"/api/conversations/{cid}/guide"
        known = client.post(path, json={"version": 0, "action": "schedule.save", "args": {"equipment": "MC36", "part_no": "EPS-A"}}).json()
        assert known["intent"] is None and "intent" in known["missing"]
        completed = client.post(path, json={"version": known["version"], "intent": intent})
        assert completed.status_code == 200, completed.text
        assert completed.json()["args"] == {"equipment": "MC36", "part_no": "EPS-A"}
        assert completed.json()["intent"] == intent
