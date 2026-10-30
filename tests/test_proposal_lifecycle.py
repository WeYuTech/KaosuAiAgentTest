from fastapi.testclient import TestClient
from app.main import create_app
from concurrent.futures import ThreadPoolExecutor
from threading import Event


def test_同一對話重新準備草稿後舊卡失效且查回最新狀態(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "cards.db")) as client:
        client.post("/api/session/demo", json={"identity": "operator"})
        cid = client.post("/api/conversations", json={"module": "report"}).json()["id"]
        def prepare(qty):
            return client.post(f"/api/conversations/{cid}/proposals", json={"action": "report.add", "args": {"execution_id": "2001", "ok": qty, "defects": []}}).json()["proposal"]
        old, fresh = prepare(5), prepare(7)
        result = client.post(f"/api/proposals/{old['id']}/confirm", json={"digest": old["digest"], "approved": True})
        assert result.json()["status"] == "superseded"
        assert client.get("/api/workspace?module=report&execution_id=2001").json()["records"][0]["MANUAL_OK"] == 0
        assert client.post(f"/api/proposals/{fresh['id']}/confirm", json={"digest": fresh["digest"], "approved": True}).json()["status"] == "succeeded"
        assert client.get(f"/api/proposals/{fresh['id']}").json()["proposal"]["status"] == "succeeded"


def test_草稿不可綁定他人對話或不同模組(tmp_path):
    app = create_app(db_path=tmp_path / "ownership.db")
    with TestClient(app) as owner, TestClient(app) as other:
        owner.post("/api/session/demo", json={"identity": "supervisor"})
        other.post("/api/session/demo", json={"identity": "operator"})
        cid = owner.post("/api/conversations", json={"module": "schedule"}).json()["id"]
        body = {"module": "report", "action": "report.add", "args": {"execution_id": "2001", "ok": 5, "defects": []}, "conversation_id": cid}
        assert other.post("/api/proposals", json=body).status_code == 404
        assert owner.post("/api/proposals", json=body).status_code == 422


def test_多服務實例共用對話時不遺失訊息或保留舊草稿(tmp_path):
    entered, release = Event(), Event()
    def slow_model(conversation, state, store):
        entered.set()
        assert release.wait(5)
        return {"content": "已準備", "action": "report.add", "args": {"execution_id": "2001", "ok": 5, "defects": []}}
    def fast_model(conversation, state, store):
        return {"content": "已更新", "action": "report.add", "args": {"execution_id": "2001", "ok": 7, "defects": []}}
    database = tmp_path / "shared.db"
    with TestClient(create_app(database, slow_model)) as first, TestClient(create_app(database, fast_model)) as second:
        first.post("/api/session/demo", json={"identity": "operator"})
        second.cookies.update(first.cookies)
        cid = first.post("/api/conversations", json={"module": "report"}).json()["id"]
        path = f"/api/conversations/{cid}/messages"
        with ThreadPoolExecutor(max_workers=1) as pool:
            running = pool.submit(first.post, path, json={"text": "良品5個"})
            assert entered.wait(5)
            concurrent = second.post(path, json={"text": "改成7個"})
            release.set()
            reply = running.result(timeout=5)
        assert concurrent.status_code == 409
        old = reply.json()["proposal"]
        assert second.post(path, json={"text": "改成7個"}).status_code == 200
        chat = first.get(f"/api/conversations/{cid}").json()
        assert len(chat["messages"]) == 4
        assert chat["messages"][1]["proposal"]["status"] == "superseded"
        assert first.post(f"/api/proposals/{old['id']}/confirm", json={"digest": old["digest"], "approved": True}).json()["status"] == "superseded"
