"""正式查詢以 SQL 替身驗證報工頁上下文，不連線現場資料庫。"""
from datetime import datetime, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.mes import MesBridge, MesConfig


@pytest.mark.parametrize("module,history,source", [
    ("schedule", "all", "dbo.V_ZZ_KAOSU_PROD_SCHEDULE_OPI AS v"),
    ("mold", "all", "dbo.GET_ZZ_WIP_OPI_WDOEACICO_HIST_SCHEDULE(?,?)"),
    ("mold", "running", "dbo.GET_ZZ_WIP_OPI_WDOEACICO_HIST_SCHEDULE_MOLD_EQP(?,?)"),
    ("mold", "history", "dbo.GET_ZZ_WIP_OPI_WDOEACICO_HIST_SCHEDULE_CLEAR(?)"),
    ("report", "all", "dbo.GET_ZZ_WIP_OPI_WDOEACICO_HIST_SCHEDULE_NG_OPI(?) AS v"),
])
def test_正式HTTP保留原來源並參數化定位執行歷程所屬排程(tmp_path, monkeypatch, module, history, source):
    statements = []

    class ReadDatabase:
        description = []
        result = []

        def cursor(self): return self
        def execute(self, sql, *params):
            statements.append((sql, params))
            assert sql.startswith("SELECT"), "唯讀驗收不得產生寫入語句"
            self.result, self.description = [], []
            if " AS v WHERE " in sql:
                assert source in sql
                assert "2002" not in sql and params[-1] == "2002"
                if module == "report":
                    assert "v.[WIP_OPI_WDOEACICO_HIST_SID]=?" in sql
                else:
                    assert "FROM dbo.WIP_OPI_WDOEACICO_HIST h" in sql
                    assert "h.WIP_OPI_WDOEACICO_HIST_SID=?" in sql
                    assert "h.ZZ_KAOSU_PROD_SCHEDULE_SID=v.ZZ_KAOSU_PROD_SCHEDULE_SID" in sql
                row = {"ZZ_KAOSU_PROD_SCHEDULE_SID": "1001", "EQP_NO": "MC37", "PRIORITY": 1, "EQP_CREATE_TIME": None, "CHECK_IN_TIME": None}
                if module == "report":
                    row["WIP_OPI_WDOEACICO_HIST_SID"] = "2002"
                self.description = [(key,) for key in row]
                self.result = [tuple(row.values())]
            return self
        def fetchmany(self, count): return [("1", "TEST", "合成測試人員")]
        def fetchall(self): return self.result
        def rollback(self): pass
        def close(self): pass

    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={"TokenKey": "synthetic-context-test-token", "Expiration": "2026-10-30T12:00:00+07:00"}))
    bridge = MesBridge(MesConfig("https://mes.invalid/KSS_MES", "合成測試連線", {"TEST": ["schedule", "report", "mold"]}),
                       transport=transport, connect=lambda write: ReadDatabase(), clock=lambda: datetime(2026, 10, 30, 4, tzinfo=timezone.utc))
    monkeypatch.setenv("MES_MODE", "live")
    monkeypatch.setattr(MesBridge, "from_env", classmethod(lambda cls: bridge))
    with TestClient(create_app(tmp_path / "execution-context.db")) as client:
        client.cookies.set("ASP.NET_SessionId", "synthetic-context-session-001")
        response = client.get("/api/workspace", params={"module": module, "history": history, "execution_id": "2002"})
        assert response.status_code == 200, response.text
        assert [row["ZZ_KAOSU_PROD_SCHEDULE_SID"] for row in response.json()["records"]] == ["1001"]
        assert len([sql for sql, _ in statements if " AS v WHERE " in sql]) == 1
