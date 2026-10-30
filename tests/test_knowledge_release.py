import pytest
import json
from fastapi.testclient import TestClient
from app.main import create_app


@pytest.fixture
def reviewed(tmp_path, monkeypatch):
    monkeypatch.setenv("MES_MODE", "simulation")
    database = tmp_path / "operations.db"
    with TestClient(create_app(db_path=database)) as client:
        client.post("/api/session/demo", json={"identity": "supervisor"})
        entry = client.post("/api/feedback", json={"module": "mold", "message": "請補充首件識別說明"}).json()
        review = {"text": "換模後首件驗證使用藍色識別卡，完成核對才繼續作業。", "source": "本次合成回歸案例，非正式作業規則"}
        assert client.post(f"/api/feedback/{entry['id']}/review", json=review).status_code == 200
        yield client, database, entry["id"]


def test_發布CLI缺少具體案例不得發布(reviewed):
    from app.knowledge_release import release_cli
    client, database, feedback_id = reviewed
    with pytest.raises(SystemExit) as error:
        release_cli(["--db", str(database), "--", feedback_id])
    assert error.value.code == 2
    assert all(row["id"] != feedback_id for row in client.get("/api/knowledge?module=mold").json()["records"])


def test_候選實際參與檢索與回覆才可發布(reviewed, tmp_path):
    from app.knowledge_release import release_cli
    from app.knowledge import retrieve
    client, database, feedback_id = reviewed
    cases = tmp_path / "cases.json"
    cases.write_text(json.dumps({"cases": [{"question": "換模後首件驗證使用什麼識別卡？", "expected_contains": ["藍色識別卡"], "forbidden_contains": ["直接跳過"]}]}, ensure_ascii=False), encoding="utf-8")
    seen = []

    def model(conversation, state, isolated, **kwargs):
        assert all(row["id"] != feedback_id for row in client.get("/api/knowledge?module=mold").json()["records"])
        knowledge = retrieve(isolated, "mold", conversation["messages"][-1]["content"])
        assert any(row["id"] == feedback_id and len(row["candidate_hash"]) == 64 for row in knowledge)
        seen.append(conversation["messages"][-1]["content"])
        return {"content": "請使用藍色識別卡，完成核對才繼續作業。", "knowledge": knowledge}

    assert release_cli(["--db", str(database), "--case", str(cases), "--", feedback_id], model_caller=model, regression_runner=lambda: {"suite": "測試替身", "sha256": "固定測試收據"}) == 0
    published = next(row for row in client.get("/api/knowledge?module=mold").json()["records"] if row["id"] == feedback_id)
    assert len(seen) == 1
    assert published["regression"]["candidate_hash"] == published["candidate_hash"]
    assert len(published["regression"]["case_hash"]) == 64
    assert len(published["regression"]["cases"][0]["model_result_hash"]) == 64


@pytest.mark.parametrize("failure", ["未使用候選", "回答不符", "包含禁止片段", "產生動作", "產生草稿"])
def test_模型結果不符合候選回歸時不得發布(reviewed, tmp_path, failure):
    from app.knowledge_release import release_cli
    from app.knowledge import retrieve
    client, database, feedback_id = reviewed
    cases = tmp_path / "cases.json"
    cases.write_text(json.dumps({"cases": [{"question": "換模後首件驗證使用什麼識別卡？", "expected_contains": ["藍色識別卡"], "forbidden_contains": ["直接跳過"]}]}, ensure_ascii=False), encoding="utf-8")

    def model(conversation, state, isolated, **kwargs):
        result = {"content": "藍色識別卡", "knowledge": retrieve(isolated, "mold", conversation["messages"][-1]["content"])}
        if failure == "未使用候選":
            result["knowledge"] = []
        elif failure == "回答不符":
            result["content"] = "黃色識別卡"
        elif failure == "包含禁止片段":
            result["content"] += "直接跳過"
        elif failure == "產生動作":
            result["action"] = "mold.mount_start"
        else:
            result["proposal"] = {}
        return result

    with pytest.raises(SystemExit, match="禁止發布"):
        release_cli(["--db", str(database), "--case", str(cases), "--", feedback_id], model_caller=model, regression_runner=lambda: {})
    assert all(row["id"] != feedback_id for row in client.get("/api/knowledge?module=mold").json()["records"])
    assert next(row for row in client.get("/api/feedback").json()["records"] if row["id"] == feedback_id)["status"] == "reviewed"


def test_模型驗證期間主管更改審核內容不得發布舊版(reviewed, tmp_path):
    from app.knowledge_release import release_cli
    from app.knowledge import retrieve
    client, database, feedback_id = reviewed
    cases = tmp_path / "cases.json"
    cases.write_text(json.dumps({"cases": [{"question": "換模後首件驗證使用什麼識別卡？", "expected_contains": ["藍色識別卡"]}]}, ensure_ascii=False), encoding="utf-8")

    def model(conversation, state, isolated, **kwargs):
        assert client.post(f"/api/feedback/{feedback_id}/review", json={"text": "改為黃色識別卡。", "source": "更新合成案例"}).status_code == 200
        return {"content": "藍色識別卡", "knowledge": retrieve(isolated, "mold", conversation["messages"][-1]["content"])}

    with pytest.raises(SystemExit, match="審核內容已變動"):
        release_cli(["--db", str(database), "--case", str(cases), "--", feedback_id], model_caller=model, regression_runner=lambda: {})
    assert all(row["id"] != feedback_id for row in client.get("/api/knowledge?module=mold").json()["records"])


def test_案例缺少回答判準不呼叫模型(reviewed, tmp_path):
    from app.knowledge_release import release_cli
    client, database, feedback_id = reviewed
    cases = tmp_path / "cases.json"
    cases.write_text(json.dumps({"cases": [{"question": "首件驗證？", "expected_contains": []}]}, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(SystemExit, match="expected_contains 不可為空"):
        release_cli(["--db", str(database), "--case", str(cases), "--", feedback_id], model_caller=lambda *a, **k: pytest.fail("不可呼叫模型"))
    assert all(row["id"] != feedback_id for row in client.get("/api/knowledge?module=mold").json()["records"])


def test_候選未進入檢索結果時不呼叫模型也不發布(reviewed, tmp_path):
    from app.knowledge_release import release_cli
    from app.store import Store
    client, database, feedback_id = reviewed
    store = Store(database)
    with store.transaction() as db:
        for index in range(4):
            item = {"id": f"existing-{index}", "module": "mold", "text": "螺絲扭力規範", "source": "合成既有知識", "version": "fixture", "status": "published"}
            store.put(db, "KNOWLEDGE", item["id"], item)
    cases = tmp_path / "cases.json"
    cases.write_text(json.dumps({"cases": [{"question": "螺絲扭力規範", "expected_contains": ["藍色識別卡"]}]}, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(SystemExit, match="未檢索到此次候選內容"):
        release_cli(["--db", str(database), "--case", str(cases), "--", feedback_id], model_caller=lambda *a, **k: pytest.fail("不可呼叫模型"), regression_runner=lambda: {})
    published = client.get("/api/knowledge?module=mold").json()["records"]
    assert {f"existing-{index}" for index in range(4)} <= {row["id"] for row in published}
    assert all(row["id"] != feedback_id for row in published)


def test_模型嘗試建立草稿時立即拒絕且不發布(reviewed, tmp_path):
    from app.knowledge_release import release_cli
    client, database, feedback_id = reviewed
    cases = tmp_path / "cases.json"
    cases.write_text(json.dumps({"cases": [{"question": "換模後首件驗證使用什麼識別卡？", "expected_contains": ["藍色識別卡"]}]}, ensure_ascii=False), encoding="utf-8")

    def model(conversation, state, isolated, **kwargs):
        kwargs["prepare_fn"]("mold.mount_start", {"schedule_id": 1003})

    with pytest.raises(SystemExit, match="不得建立操作草稿"):
        release_cli(["--db", str(database), "--case", str(cases), "--", feedback_id], model_caller=model, regression_runner=lambda: {})
    assert all(row["id"] != feedback_id for row in client.get("/api/knowledge?module=mold").json()["records"])
