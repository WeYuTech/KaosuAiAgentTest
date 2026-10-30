from fastapi.testclient import TestClient
from app.main import create_app
from app.mes import MesBridge, MesError
from test_mes_schedule_http import sql_client


class UncertainMes:
    def __init__(self):
        self.writes = 0
        self.found = False
        self.changes = [{"table": "WIP_OPI_WDOEACICO_HIST", "key": "2001", "field": "OPI_CAV", "before": 2, "after": 3}]

    def resolve_identity(self, cookie, module):
        return {"id": "TEST", "name": "驗收", "roles": ["report"], "source": "mes"}

    def prepare(self, actor, module, action, args):
        return {"changes": self.changes, "version": "original-version", "writes_enabled": True}

    def execute(self, *args):
        self.writes += 1
        raise MesError("提交回應中斷", "outcome_unknown")

    def operation_result(self, actor, module, action, args, version, operation_id):
        assert version == "original-version"
        return {"operation_id": operation_id, "status": "executed", "changes": self.changes} if self.found else None


def test_結果未知僅查核既有操作紀錄且不重送業務(tmp_path, monkeypatch):
    bridge = UncertainMes()
    monkeypatch.setenv("MES_MODE", "live")
    monkeypatch.setattr(MesBridge, "from_env", classmethod(lambda cls: bridge))
    with TestClient(create_app(tmp_path / "unknown.db")) as client:
        card = client.post("/api/proposals", json={"module": "report", "action": "report.cavities", "args": {"execution_id": "2001", "cavities": 3}}).json()["proposal"]
        path = f"/api/proposals/{card['id']}"
        assert client.post(path + "/confirm", json={"digest": card["digest"], "approved": True}).json()["status"] == "unknown"
        unresolved = client.post(path + "/reconcile", json={})
        assert unresolved.status_code == 200
        assert unresolved.json()["status"] == "unknown"
        bridge.found = True
        resolved = client.post(path + "/reconcile", json={})
        assert resolved.json()["status"] == "succeeded"
        assert resolved.json()["changes"] == bridge.changes
        assert client.get(path).json()["proposal"]["status"] == "succeeded"
        assert client.post(path + "/reconcile", json={}).json()["status"] == "succeeded"
        assert bridge.writes == 1
        audit = client.get("/api/audit").json()["records"]
        assert len(audit) == 1 and audit[0]["status"] == "succeeded"
        assert audit[0]["previous_status"] == "unknown" and audit[0]["changes"] == bridge.changes


def test_SQL已提交但回應中斷可查核且不重複寫入(sql_client, monkeypatch):
    from scripts.sql_acceptance import target_connection, seed_scenario
    with target_connection() as db:
        ids = seed_scenario(db)
    real_execute = sql_client.mes_bridge.execute
    calls = []
    def lose_response(*args):
        result = real_execute(*args)
        calls.append(result)
        raise MesError("模擬提交後回應中斷", "outcome_unknown")
    monkeypatch.setattr(sql_client.mes_bridge, "execute", lose_response)
    card = sql_client.post("/api/proposals", json={"module": "report", "action": "report.cavities", "args": {"execution_id": ids["2001"], "cavities": 3}}).json()["proposal"]
    path = f"/api/proposals/{card['id']}"
    assert sql_client.post(path + "/confirm", json={"digest": card["digest"], "approved": True}).json()["status"] == "unknown"
    assert sql_client.post(path + "/confirm", json={"digest": card["digest"], "approved": True}).json()["status"] == "unknown"
    result = sql_client.post(path + "/reconcile", json={})
    assert result.status_code == 200, result.text
    assert result.json()["status"] == "succeeded"
    assert result.json()["changes"] == calls[0]["changes"]
    assert len(calls) == 1
    with target_connection(False) as db:
        assert db.cursor().execute("SELECT COUNT(*) FROM dbo.ZZ_AI_AGENT_OPERATION_OPERATION WHERE OPERATION_ID=?", card["id"]).fetchone()[0] == 1
        assert int(db.cursor().execute("SELECT OPI_CAV FROM dbo.WIP_OPI_WDOEACICO_HIST WHERE WIP_OPI_WDOEACICO_HIST_SID=?", ids["2001"]).fetchone()[0]) == 3
    from pathlib import Path
    import json
    Path(".local/sql-reconciliation-result.json").write_text(json.dumps({"status": "passed", "operation_id": card["id"], "business_commands": len(calls), "database": "ZZ_AI_AGENT_OPERATION_TEST_20261030", "source_business_writes": 0}), encoding="utf-8")


def test_SQL指定品號與模具必須相容才回選項(sql_client):
    response = sql_client.get("/api/workspace", params={"module": "schedule", "catalog": "molds", "part_no": "不存在的驗收品號", "mold_no": "TEST-MOLD-A"})
    assert response.status_code == 200, response.text
    assert response.json()["catalogs"]["molds"] == []
