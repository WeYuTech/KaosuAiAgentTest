"""MES 固定 HTTP 來源與 SQL 交易替身測試；不連線正式 MES。"""
from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
import httpx
import pytest

from app import domain
from app.mes import MesBridge, MesConfig, MesError, OUTPUT, DEFECT, EXECUTION

NOW = datetime(2026, 10, 30, 4, tzinfo=timezone.utc)
TOKEN = "synthetic-test-token-with-no-live-value"
COOKIE = "ASP.NET_SessionId=abcdefghijklmnopqrstuvwx"


class IdentityDb:
    def __init__(self, rows=None):
        self.rows = [("1", "TEST", "測試人員")] if rows is None else rows
        self.calls = []

    def cursor(self): return self
    def execute(self, sql, *params): self.calls.append((sql, params)); return self
    def fetchmany(self, count): return self.rows[:count]
    def rollback(self): pass
    def close(self): pass


def bridge_for_identity(rows=None, payload=None, status=200, allow=None):
    requests = []
    db = IdentityDb(rows)
    def respond(request):
        requests.append(request)
        return httpx.Response(status, json=payload if payload is not None else {"TokenKey": TOKEN, "Expiration": "2026-10-30 13:00:00"})
    bridge = MesBridge(MesConfig("https://mes.invalid/KSS_MES", "不含真實憑證", allow if allow is not None else {"TEST": ["report", "mold"]}),
                       transport=httpx.MockTransport(respond), connect=lambda write: db, clock=lambda: NOW)
    return bridge, db, requests


def public_app(bridge):
    app = FastAPI()
    @app.get("/identity/{module}")
    def identity(module: str, request: Request):
        try:
            actor = bridge.resolve_identity(request.headers.get("cookie", ""), module)
            return {k: v for k, v in actor.items() if not k.startswith("_")}
        except MesError as exc:
            return JSONResponse({"code": exc.code, "message": exc.message}, status_code=403 if exc.code == "forbidden" else 401)
    return TestClient(app)


def test_http_uses_fixed_origin_and_only_mes_cookie():
    bridge, db, requests = bridge_for_identity()
    response = public_app(bridge).get("/identity/report?uid=ADMINV2", headers={"Cookie": COOKIE + "; claimed_uid=ADMINV2; other=do-not-relay"})
    assert response.status_code == 200 and response.json()["id"] == "TEST"
    assert str(requests[0].url) == "https://mes.invalid/KSS_MES/api/session/check"
    assert requests[0].headers["cookie"] == COOKIE
    assert "TokenKey" not in response.text and TOKEN not in response.text and "_proof" not in response.text
    sql, params = db.calls[0]
    assert "COLLATE Latin1_General_100_BIN2=?" in sql and TOKEN not in sql and params == ("Y", TOKEN)


@pytest.mark.parametrize("cookie", ["", COOKIE + "; " + COOKIE, "ASP.NET_SessionId=short"])
def test_missing_or_ambiguous_cookie_never_contacts_mes(cookie):
    bridge, _, requests = bridge_for_identity()
    assert public_app(bridge).get("/identity/report", headers={"Cookie": cookie}).status_code == 401
    assert not requests


@pytest.mark.parametrize("payload,status,rows", [
    ({"TokenKey": TOKEN, "Expiration": "2026-10-30 11:00:00"}, 200, None),
    ({"result": False}, 200, None),
    ({}, 302, None),
    (None, 200, []),
    (None, 200, [("1", "TEST", "一"), ("2", "OTHER", "二")]),
])
def test_unverified_session_cannot_become_identity(payload, status, rows):
    bridge, _, _ = bridge_for_identity(rows=rows, payload=payload, status=status)
    assert public_app(bridge).get("/identity/report", headers={"Cookie": COOKIE}).status_code == 401


def test_module_allowlist_denies_by_default_and_actor_cannot_be_forged():
    bridge, _, _ = bridge_for_identity(allow={})
    assert public_app(bridge).get("/identity/report", headers={"Cookie": COOKIE}).status_code == 403
    bridge, _, _ = bridge_for_identity()
    actor = bridge.resolve_identity(COOKIE, "report")
    actor["id"] = "ADMINV2"
    with pytest.raises(MesError, match="可信登入"):
        bridge.snapshot(actor, "report", {"date": "2026-10-30"})


def test_session_expiration_uses_configured_mes_server_offset():
    bridge, _, _ = bridge_for_identity(payload={"TokenKey":TOKEN,"Expiration":"2026-10-30 11:30:00"})
    with pytest.raises(MesError):
        bridge.resolve_identity(COOKIE,"report")
    bridge.config=replace(bridge.config,server_utc_offset_hours=7)
    assert bridge.resolve_identity(COOKIE,"report")["id"]=="TEST"


class Database:
    def __init__(self):
        self.state = domain.seed_state()
        self.state["mode"] = "live"
        self.operations = {}
        self.calls = []
        self.fail_audit = False
        self.zero_rows = False
        self.commits = 0
        self.allocated = 700000000000000

    def connect(self, write): return Transaction(self)


class Transaction:
    def __init__(self, owner):
        self.owner = owner
        self.state, self.operations = deepcopy(owner.state), deepcopy(owner.operations)
        self.result, self.rowcount = [], 1

    def cursor(self): return self
    def execute(self, sql, *params):
        self.owner.calls.append((sql, params))
        self.rowcount, self.result = (0 if self.owner.zero_rows else 1), []
        if sql.startswith("SELECT REQUEST_HASH"):
            previous = self.operations.get(params[0]); self.result = [previous] if previous else []
        elif sql == "SELECT dbo.GET_DATETIME_STRING()": self.result = [(datetime(2026,10,30,12,0,0),)]
        elif sql == "SELECT dbo.GetSid()":
            self.owner.allocated += 1; self.result = [(self.owner.allocated,)]
        elif sql.startswith("INSERT INTO dbo.ZZ_AI_AGENT_OPERATION_OPERATION"):
            self.operations[params[0]] = (params[5], params[7])
        elif sql.startswith("INSERT INTO dbo.ZZ_AI_AGENT_OPERATION_CHANGE") and self.owner.fail_audit:
            raise RuntimeError("模擬稽核失敗")
        return self
    def fetchone(self): return self.result[0] if self.result else None
    def commit(self):
        self.owner.state, self.owner.operations = deepcopy(self.state), deepcopy(self.operations)
        self.owner.commits += 1
    def rollback(self): pass
    def close(self): pass


class TransactionBridge(MesBridge):
    def _load_state(self, cursor, action, args, lock=False): return deepcopy(cursor.state)
    def _apply_rows(self, cursor, before, after):
        super()._apply_rows(cursor, before, after)
        cursor.state = deepcopy(after)
    def _select(self, cursor, table, where="1=1", parameters=(), lock=False):
        key = str(parameters[0])
        row = cursor.state["tables"][table].get(key)
        return {key: deepcopy(row)} if row else {}


def transaction_bridge(enabled=True):
    db = Database()
    bridge = TransactionBridge(MesConfig("https://mes.invalid", "不含真實憑證", {"TEST":["report","mold"]}, writes_enabled=enabled), connect=db.connect, clock=lambda:NOW)
    actor = {"id":"TEST", "name":"測試", "modules":["report","mold"], "_expires":NOW.timestamp()+30}
    actor["_proof"] = bridge._sign(actor)
    return bridge, actor, db


def test_transaction_add_parameters_audit_and_idempotent_replay():
    bridge, actor, db = transaction_bridge()
    args = {"execution_id":"2001", "ok":12, "defects":[{"code":"NG01","quantity":2}], "comment":"備註'; 不應執行為 SQL"}
    preview = bridge.prepare(actor,"report","report.add",args)
    operation = str(uuid4())
    result = bridge.execute(actor,"report","report.add",args,preview["version"],operation)
    assert result["status"] == "executed" and db.commits == 1
    assert len(db.state["tables"][OUTPUT]) == 1 and len(db.state["tables"][DEFECT]) == 1
    assert any("INSERT INTO dbo.ZZ_AI_AGENT_OPERATION_CHANGE" in sql for sql, _ in db.calls)
    assert all(args["comment"] not in sql for sql, _ in db.calls)
    assert any(args["comment"] in params for _, params in db.calls)
    again = bridge.execute(actor,"report","report.add",args,preview["version"],operation)
    assert again["replayed"] and db.commits == 1
    with pytest.raises(MesError) as exc:
        bridge.execute(actor,"report","report.add",{**args,"ok":13},preview["version"],operation)
    assert exc.value.code == "conflict"


@pytest.mark.parametrize("failure", ["audit", "zero_rows", "stale"])
def test_failure_never_commits_partial_business_change(failure):
    bridge, actor, db = transaction_bridge()
    args = {"schedule_id":"1001"}
    preview = bridge.prepare(actor,"mold","mold.unmount_start",args)
    before = deepcopy(db.state)
    if failure == "audit": db.fail_audit = True
    if failure == "zero_rows": db.zero_rows = True
    if failure == "stale": db.state["tables"][EXECUTION]["2001"]["OPI_CAV"] = 99; before=deepcopy(db.state)
    with pytest.raises(MesError):
        bridge.execute(actor,"mold","mold.unmount_start",args,preview["version"],str(uuid4()))
    assert db.state == before and db.commits == 0 and not db.operations


def test_default_gate_and_schedule_block_before_business_database():
    bridge, actor, db = transaction_bridge(enabled=False)
    with pytest.raises(MesError) as exc:
        bridge.execute(actor,"mold","mold.clear",{"schedule_id":"1001"},"untrusted",str(uuid4()))
    assert exc.value.code == "live_write_locked" and not db.calls
    actor["modules"].append("schedule"); actor["_proof"] = bridge._sign(actor)
    with pytest.raises(MesError) as exc:
        bridge.prepare(actor,"schedule","schedule.delete",{})
    assert exc.value.code == "unverified_contract"


def test_fractional_cavities_and_oversized_real_comment_rejected():
    bridge, actor, _ = transaction_bridge()
    with pytest.raises(domain.BusinessError):
        bridge.prepare(actor,"report","report.cavities",{"execution_id":"2001","cavities":1.2})
    with pytest.raises(MesError):
        bridge.prepare(actor,"report","report.add",{"execution_id":"2001","ok":1,"defects":[],"comment":"字"*256})


def test_complete_preview_contains_next_schedule_side_effect():
    bridge, actor, _ = transaction_bridge()
    preview=bridge.prepare(actor,"report","report.complete",{"schedule_id":"1001"})
    assert any(c["key"]=="2003" and c["field"]=="REAL_CHECK_IN_TIME" for c in preview["changes"])


def run_command(bridge, actor, module, action, args):
    preview = bridge.prepare(actor, module, action, args)
    return bridge.execute(actor, module, action, args, preview["version"], str(uuid4()))


def test_report_update_new_reason_delete_and_cavity_are_atomic():
    bridge, actor, db = transaction_bridge()
    run_command(bridge, actor, "report", "report.add", {"execution_id":"2001","ok":5,"defects":[{"code":"NG01","quantity":1}]})
    report_id = next(iter(db.state["tables"][OUTPUT]))
    run_command(bridge, actor, "report", "report.update", {"report_id":report_id,"ok":8,"defects":[{"code":"NG02","quantity":3}]})
    assert db.state["tables"][OUTPUT][report_id]["NG_QTY"] == 3
    assert {r["NG_CODE"] for r in db.state["tables"][DEFECT].values()} == {"NG02"}
    run_command(bridge, actor, "report", "report.cavities", {"execution_id":"2001","cavities":4})
    assert db.state["tables"][EXECUTION]["2001"]["OPI_CAV"] == 4
    deleted = run_command(bridge, actor, "report", "report.delete", {"report_id":report_id})
    assert not db.state["tables"][OUTPUT] and not db.state["tables"][DEFECT]
    assert any(c["table"] == OUTPUT and c["before"] is not None and c["after"] is None for c in deleted["changes"])


def test_mold_four_stages_and_clear_preserve_completion_side_effects():
    bridge, actor, db = transaction_bridge()
    for step in ("mount_start", "mount_finish", "unmount_start", "unmount_finish"):
        run_command(bridge, actor, "mold", "mold." + step, {"schedule_id":"1002"})
    row = db.state["tables"][EXECUTION]["2003"]
    assert row["COMPLETED"] == "Y" and row["CHECK_OUT_TIME"]
    result = run_command(bridge, actor, "mold", "mold.clear", {"schedule_id":"1002"})
    row = db.state["tables"][EXECUTION]["2003"]
    assert row["COMPLETED"] == "N" and row["CHECK_OUT_TIME"] is None
    assert any(c["field"] == "COMPLETED" and c["before"] == "Y" and c["after"] == "N" for c in result["changes"])


def test_complete_changes_all_current_rows_and_next_schedule_together():
    bridge, actor, db = transaction_bridge()
    run_command(bridge, actor, "report", "report.complete", {"schedule_id":"1001"})
    assert all(db.state["tables"][EXECUTION][key]["COMPLETED"] == "Y" for key in ("2001","2002"))
    assert db.state["tables"][EXECUTION]["2003"]["REAL_CHECK_IN_TIME"] == "2026-10-30 12:00:00"


def test_preview_new_ids_are_not_presented_as_real_and_target_is_explicit():
    bridge, actor, _ = transaction_bridge()
    preview=bridge.prepare(actor,"report","report.add",{"execution_id":"2001","ok":2,"defects":[]})
    assert preview["target"]["equipment"]=="MC37" and preview["target"]["work_order"]=="WO-A"
    assert "執行時" in preview["time_policy"]
    assert all(not str(c["key"]).startswith("900000000000") for c in preview["changes"])


# 此 fixture 只有明確 MES_SQL_ACCEPTANCE=1 才會啟用，並硬驗新測試庫名稱與標記。
from test_mes_schedule_http import sql_client


def test_SQL公開HTTP完成報工與模具生命週期(sql_client):
    from scripts.sql_acceptance import target_connection,seed_scenario
    with target_connection() as db:
        ids=seed_scenario(db)
    results=[]
    def invoke(module,action,args):
        response=sql_client.post("/api/proposals",json={"module":module,"action":action,"args":args})
        assert response.status_code==200,response.text
        proposal=response.json()["proposal"]
        response=sql_client.post(f"/api/proposals/{proposal['id']}/confirm",json={"digest":proposal["digest"],"approved":True})
        assert response.status_code==200,response.text
        result=response.json();assert result["status"]=="succeeded"
        results.append({"action":action,"operation_id":proposal["id"],"status":result["status"]})
        return result
    sid,eid=ids["1002"],ids["2003"]
    invoke("mold","mold.mount_start",{"schedule_id":sid})
    invoke("mold","mold.mount_finish",{"schedule_id":sid})
    added=invoke("report","report.add",{"execution_id":eid,"ok":10,"defects":[{"code":"NG01","quantity":1}]})
    rid=next(c["after"] for c in added["changes"] if c["table"]==OUTPUT and c["field"]=="WIP_OPI_WDOEACICOOUTPUT_HIST_SID")
    invoke("report","report.update",{"report_id":rid,"ok":12,"defects":[{"code":"NG02","quantity":2}]})
    invoke("report","report.cavities",{"execution_id":eid,"cavities":3})
    invoke("report","report.delete",{"report_id":rid})
    invoke("report","report.complete",{"schedule_id":sid})
    invoke("mold","mold.unmount_start",{"schedule_id":sid})
    invoke("mold","mold.unmount_finish",{"schedule_id":sid})
    invoke("mold","mold.clear",{"schedule_id":sid})
    with target_connection(False) as db:
        row=db.cursor().execute("SELECT COMPLETED,CHECK_IN_TIME,CHECK_OUT_TIME,OPI_CAV FROM dbo.WIP_OPI_WDOEACICO_HIST WHERE WIP_OPI_WDOEACICO_HIST_SID=?",eid).fetchone()
        assert row[0]=="N" and row[1] is None and row[2] is None and int(row[3])==3
        count=db.cursor().execute("SELECT COUNT(*) FROM dbo.ZZ_AI_AGENT_OPERATION_OPERATION WHERE OPERATION_ID IN ("+",".join("?" for _ in results)+")",*(r["operation_id"] for r in results)).fetchone()[0]
        assert count==len(results)
        db.rollback()
    from pathlib import Path
    import json
    Path(".local/sql-http-lifecycle-result.json").write_text(json.dumps({"database":"ZZ_AI_AGENT_OPERATION_TEST_20261030","transport":"FastAPI 公開 HTTP 介面與真實 SQL Server；MES session/check 使用合成 token 替身","operations":results,"source_business_writes":0},ensure_ascii=False,indent=2),encoding="utf-8")
