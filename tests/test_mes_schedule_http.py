"""只對明確命名的新隔離 SQL 資料庫驗收；絕不寫原 MES。"""

from datetime import datetime, timedelta, timezone
import os
from uuid import uuid4

from dotenv import load_dotenv
from fastapi.testclient import TestClient
import httpx
import pytest

from app.main import create_app
from app.mes import MesBridge, MesConfig
from app.mes_schedule import prepare, execute  # 公開適配器須先存在。


@pytest.fixture
def sql_client(tmp_path, monkeypatch):
    if os.getenv("MES_SQL_ACCEPTANCE") != "1":
        pytest.skip("真實 SQL 驗收需明確設定 MES_SQL_ACCEPTANCE=1。")
    load_dotenv(".local/sql-test.env", override=False)
    connection = os.getenv("MES_TEST_CONNECTION_STRING")
    if not connection:
        pytest.skip("尚未設定獨立 SQL 驗收資料庫；未執行正式寫入。")
    from scripts.sql_acceptance import target_connection
    with target_connection(write=False) as db:
        db.rollback()
    expiry = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={"TokenKey": "synthetic-sql-test-token-with-no-live-value", "Expiration": expiry}))
    bridge = MesBridge(MesConfig("https://isolated-mes.invalid", connection, {"TEST": ["schedule", "report", "mold"]}, writes_enabled=True), transport=transport, connect=target_connection)
    monkeypatch.setenv("MES_MODE", "live")
    monkeypatch.setattr(MesBridge, "from_env", classmethod(lambda cls: bridge))
    with TestClient(create_app(db_path=tmp_path / "local.db")) as client:
        client.cookies.set("ASP.NET_SessionId", "syntheticsession1234567890")
        client.mes_bridge = bridge
        yield client


def save_args():
    return {"equipment": "TEST-MC36", "part_no": "TEST-PART-A", "mold_no": "TEST-MOLD-A", "start_time": "2026-10-31 07:59", "cycle_seconds": 60, "target_shots": 10, "status": "RUN", "comment": "隔離排程驗收-" + uuid4().hex[:8], "details": [{"part_no": "TEST-PART-A", "wo": "TEST-WO-A", "cavities": 2}, {"part_no": "TEST-PART-B", "wo": "TEST-WO-B", "cavities": 1}]}


def preview(client, args):
    response = client.post("/api/proposals", json={"module": "schedule", "action": "schedule.save", "args": args})
    assert response.status_code == 200, response.text
    return response.json()["proposal"]


def confirm(client, proposal):
    response = client.post(f"/api/proposals/{proposal['id']}/confirm", json={"digest": proposal["digest"], "approved": True})
    assert response.status_code == 200, response.text
    return response.json()


def saved_ids(result):
    schedules = {c["key"] for c in result["changes"] if c["table"] == "ZZ_KAOSU_PROD_SCHEDULE"}
    details = {c["after"]: c["key"] for c in result["changes"] if c["table"] == "ZZ_KAOSU_PROD_SCHEDULE_DETAIL" and c["field"] == "PART_NO"}
    return next(iter(schedules)), details


def test_新增排程於同交易觸發歷程並稽核可靠主鍵(sql_client):
    marker = "隔離排程驗收-" + uuid4().hex[:8]
    args = {"equipment": "TEST-MC36", "part_no": "TEST-PART-A", "mold_no": "TEST-MOLD-A", "start_time": "2026-10-31 07:59", "cycle_seconds": 60, "target_shots": 10, "status": "RUN", "comment": marker, "details": [{"part_no": "TEST-PART-A", "wo": "TEST-WO-A", "cavities": 2}]}
    response = sql_client.post("/api/proposals", json={"module": "schedule", "action": "schedule.save", "args": args})
    assert response.status_code == 200, response.text
    proposal = response.json()["proposal"]
    assert any(c["table"] == "WIP_OPI_WDOEACICO_HIST" for c in proposal["changes"])
    response = sql_client.post(f"/api/proposals/{proposal['id']}/confirm", json={"digest": proposal["digest"], "approved": True})
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "succeeded"
    changes = response.json()["changes"]
    schedules = {c["key"] for c in changes if c["table"] == "ZZ_KAOSU_PROD_SCHEDULE"}
    details = {c["key"] for c in changes if c["table"] == "ZZ_KAOSU_PROD_SCHEDULE_DETAIL"}
    executions = {c["key"] for c in changes if c["table"] == "WIP_OPI_WDOEACICO_HIST"}
    assert len(schedules) == 1
    assert details == executions and len(details) == 1
    assert any(c["table"] == "WIP_OPI_WDOEACICO_HIST" and c["field"] == "COMPLETED" and c["after"] == "N" for c in changes)
    replay = sql_client.post(f"/api/proposals/{proposal['id']}/confirm", json={"digest": proposal["digest"], "approved": True})
    assert replay.status_code == 200


def test_修改觸發器同步模穴保留上下模時間且刪除明細連動歷程(sql_client):
    from scripts.sql_acceptance import target_connection
    args = save_args()
    created = confirm(sql_client, preview(sql_client, args))
    sid, ids = saved_ids(created)
    a, b = ids["TEST-PART-A"], ids["TEST-PART-B"]
    with target_connection() as db:
        db.cursor().execute("UPDATE dbo.WIP_OPI_WDOEACICO_HIST SET OPI_CAV=9,ZZ_MODLE_UPLOAD_START='2026-10-30T09:00:00',CHECK_IN_TIME='2026-10-30T09:00:00' WHERE WIP_OPI_WDOEACICO_HIST_SID=?", a)
        db.commit()
    args.update(schedule_id=sid, details=[{"detail_id": a, "part_no": "TEST-PART-A", "wo": "TEST-WO-A", "cavities": 3}])
    result = confirm(sql_client, preview(sql_client, args))
    assert any(c["table"] == "WIP_OPI_WDOEACICO_HIST" and c["key"] == a and c["field"] == "OPI_CAV" and c["before"] == 9 and c["after"] == 3 for c in result["changes"])
    assert any(c["table"] == "WIP_OPI_WDOEACICO_HIST" and c["key"] == b and c["field"] == "WIP_OPI_WDOEACICO_HIST_SID" and c["after"] is None for c in result["changes"])
    with target_connection(write=False) as db:
        row = db.cursor().execute("SELECT OPI_CAV,ZZ_MODLE_UPLOAD_START,CHECK_IN_TIME FROM dbo.WIP_OPI_WDOEACICO_HIST WHERE WIP_OPI_WDOEACICO_HIST_SID=?", a).fetchone()
        assert int(row[0]) == 3 and str(row[1]).startswith("2026-10-30 09:00:00") and str(row[2]).startswith("2026-10-30 09:00:00")
        assert db.cursor().execute("SELECT COUNT(*) FROM dbo.WIP_OPI_WDOEACICO_HIST WHERE WIP_OPI_WDOEACICO_HIST_SID=?", b).fetchone()[0] == 0
        db.rollback()


def test_過期確認卡及已有報工明細刪除不寫入(sql_client):
    from scripts.sql_acceptance import target_connection, insert_synthetic
    args = save_args()
    sid, ids = saved_ids(confirm(sql_client, preview(sql_client, args)))
    args.update(schedule_id=sid, details=[{**d, "detail_id": ids[d["part_no"]]} for d in args["details"]])
    proposal = preview(sql_client, args)
    with target_connection() as db:
        db.cursor().execute("UPDATE dbo.WIP_OPI_WDOEACICO_HIST SET OPI_CAV=8 WHERE WIP_OPI_WDOEACICO_HIST_SID=?", ids["TEST-PART-A"])
        db.commit()
    response = sql_client.post(f"/api/proposals/{proposal['id']}/confirm", json={"digest": proposal["digest"], "approved": True})
    assert response.status_code == 409, response.text
    with target_connection() as db:
        cursor = db.cursor()
        output_id = cursor.execute("SELECT dbo.GetSid()").fetchone()[0]
        insert_synthetic(cursor, "WIP_OPI_WDOEACICOOUTPUT_HIST", {"WIP_OPI_WDOEACICOOUTPUT_HIST_SID": output_id, "WIP_OPI_WDOEACICO_HIST_SID": ids["TEST-PART-B"], "OK_QTY": 1, "NG_QTY": 0})
        db.commit()
    args["details"] = [args["details"][0]]
    response = sql_client.post("/api/proposals", json={"module": "schedule", "action": "schedule.save", "args": args})
    assert response.status_code == 409, response.text
    assert response.json()["detail"]["code"] == "linked_reports"
    with target_connection(write=False) as db:
        cursor = db.cursor()
        assert cursor.execute("SELECT COUNT(*) FROM dbo.WIP_OPI_WDOEACICO_HIST WHERE WIP_OPI_WDOEACICO_HIST_SID=?", ids["TEST-PART-B"]).fetchone()[0] == 1
        assert cursor.execute("SELECT COUNT(*) FROM dbo.ZZ_AI_AGENT_OPERATION_OPERATION WHERE OPERATION_ID=?", proposal["id"]).fetchone()[0] == 0
        db.rollback()


def test_稽核失敗表頭明細與觸發歷程一併回復(sql_client):
    from scripts.sql_acceptance import target_connection
    args = save_args()
    proposal = preview(sql_client, args)
    with target_connection() as db:
        db.cursor().execute("CREATE OR ALTER TRIGGER dbo.ZZ_AI_AGENT_OPERATION_TEST_AUDIT_FAILURE ON dbo.ZZ_AI_AGENT_OPERATION_CHANGE AFTER INSERT AS BEGIN IF SESSION_CONTEXT(N'AI_TEST_FAIL_AUDIT')=1 THROW 51000,N'隔離驗收故障注入',1; END")
        db.commit()

    def failing_connection(write):
        db = target_connection(write)
        if write:
            db.cursor().execute("EXEC sys.sp_set_session_context @key=N'AI_TEST_FAIL_AUDIT',@value=1")
        return db

    sql_client.mes_bridge._connector = failing_connection
    response = sql_client.post(f"/api/proposals/{proposal['id']}/confirm", json={"digest": proposal["digest"], "approved": True})
    assert response.status_code == 503, response.text
    assert response.json()["detail"]["code"] == "transaction_failed"
    with target_connection(write=False) as db:
        cursor = db.cursor()
        assert cursor.execute("SELECT COUNT(*) FROM dbo.ZZ_KAOSU_PROD_SCHEDULE WHERE COMMENT=?", args["comment"]).fetchone()[0] == 0
        assert cursor.execute("SELECT COUNT(*) FROM dbo.ZZ_AI_AGENT_OPERATION_OPERATION WHERE OPERATION_ID=?", proposal["id"]).fetchone()[0] == 0
        # 所有新表身與 HIST 都在同一交易，且同鍵；無表頭的新增孤兒必須不存在。
        assert cursor.execute("SELECT COUNT(*) FROM dbo.ZZ_KAOSU_PROD_SCHEDULE_DETAIL d LEFT JOIN dbo.ZZ_KAOSU_PROD_SCHEDULE h ON h.ZZ_KAOSU_PROD_SCHEDULE_SID=d.ZZ_KAOSU_PROD_SCHEDULE_SID WHERE h.ZZ_KAOSU_PROD_SCHEDULE_SID IS NULL").fetchone()[0] == 0
        db.rollback()
