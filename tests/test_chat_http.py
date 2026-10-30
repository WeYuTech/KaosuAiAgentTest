from fastapi.testclient import TestClient
from app.main import create_app


def test_模型只能準備確認卡不能寫入(tmp_path):
    def model(conversation, state, store):
        return {"content": "請核對這筆人工報工。", "action": "report.add", "args": {"execution_id": "2001", "ok": 20, "defects": [], "comment": ""}}
    with TestClient(create_app(db_path=tmp_path / "chat.db", model=model)) as client:
        client.post("/api/session/demo", json={"identity": "operator"})
        convo = client.post("/api/conversations", json={"module": "report"}).json()
        reply = client.post(f"/api/conversations/{convo['id']}/messages", json={"text": "良品二十個"})
        assert reply.status_code == 200
        assert reply.json()["proposal"]["status"] == "pending"
        assert client.get("/api/audit").json()["records"] == []


def test_補充對話會停用舊確認卡(tmp_path):
    def model(conversation, state, store):
        return {"content": "請確認。", "action": "report.add", "args": {"execution_id": "2001", "ok": 5, "defects": []}}
    with TestClient(create_app(db_path=tmp_path / "replace.db", model=model)) as client:
        client.post("/api/session/demo", json={"identity": "operator"})
        cid = client.post("/api/conversations", json={"module": "report"}).json()["id"]
        old = client.post(f"/api/conversations/{cid}/messages", json={"text": "良品5個"}).json()["proposal"]
        client.post(f"/api/conversations/{cid}/messages", json={"text": "先不要，重新整理草稿"})
        result = client.post(f"/api/proposals/{old['id']}/confirm", json={"digest": old["digest"], "approved": True})
        assert result.json()["status"] == "superseded"
        assert client.get("/api/audit").json()["records"] == []
