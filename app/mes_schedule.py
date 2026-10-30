"""EPS 排程交易：重驗主檔、核對已盤點觸發器、讀回實際連動後同交易稽核。"""

from copy import deepcopy
from datetime import date, datetime, time
from decimal import Decimal
import hashlib
import hmac
import json
import re
from uuid import UUID

from app import domain
from app.mes import MesError, PREFIX
from app.store import changes, digest, dumps

SCHEDULE, DETAIL, HIST, OUTPUT = domain.SCHEDULE, domain.DETAIL, domain.EXECUTION, domain.OUTPUT
PK = {SCHEDULE: "ZZ_KAOSU_PROD_SCHEDULE_SID", DETAIL: "ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID", HIST: "WIP_OPI_WDOEACICO_HIST_SID", OUTPUT: "WIP_OPI_WDOEACICOOUTPUT_HIST_SID"}
HEADER_COLUMNS = (PK[SCHEDULE], "SCHEDULE_DATE", "SCHEDULE_START_TIME", "SCHEDULE_END_TIME", "OPERATION_CODE", "EQP_SID", "TOL_SID", "SCHEDULE_CYCLE_TIME", "TARGET_SHOT", "CHANGE_MOLD", "COMMENT", "SHIFT_TYPE", "SHIFT_CLASS_1", "SHIFT_START_TIME_1", "SHIFT_END_TIME_1", "SHIFT_CLASS_2", "SHIFT_START_TIME_2", "SHIFT_END_TIME_2", "CREATE_USER", "CREATE_TIME", "EDIT_USER", "EDIT_TIME", "ZZ_KAOSU_PROD_SHIFT_DAILY_REPORT_BASE_SID", "PRODUCTION_STATUS", "PRIORITY")
DETAIL_COLUMNS = (PK[DETAIL], PK[SCHEDULE], "TOL_DETALS_SID", "SCHEDULE_CUR_CAV", "PART_NO", "PART_SPEC", "WO_SID", "WO_QUANTITY", "TARGET_PCS", "CREATE_USER", "CREATE_TIME", "EDIT_USER", "EDIT_TIME")
HIST_COLUMNS = (PK[HIST], PK[SCHEDULE], PK[DETAIL], "WO", "DEPT_NO", "OPERATION_CODE", "EQP_NO", "ENABLE_FLAG", "CREATE_USER", "CREATE_TIME", "EDIT_USER", "EDIT_TIME", "TOL_SID", "SCHEDULE_CUR_CAV", "SHIFT_CLASS_1", "SHIFT_START_TIME_1", "SHIFT_END_TIME_1", "SHIFT_CLASS_2", "SHIFT_START_TIME_2", "SHIFT_END_TIME_2", "SCHEDULE_EDIT_USER", "SCHEDULE_EDIT_TIME", "SHIFT_DAY", "OPI_CAV", "COMPLETED", "ZZ_TOL_DETALS_NO", "CHECK_IN_TIME", "CHECK_OUT_TIME", "REAL_CHECK_IN_TIME", "COMPLETED_USER", "COMPLETED_TIME", "ZZ_MODLE_UPLOAD_START", "ZZ_MODLE_UPLOAD_END", "ZZ_MODLE_REMOVE_START", "ZZ_MODLE_REMOVE_END")
READ_COLUMNS = {SCHEDULE: HEADER_COLUMNS, DETAIL: DETAIL_COLUMNS, HIST: HIST_COLUMNS, OUTPUT: (PK[OUTPUT], PK[HIST], "OK_QTY", "NG_QTY", "ENABLE_FLAG", "EDIT_TIME")}
TRIGGER = "ZZ_KAOSU_PROD_SCHEDULE_DETAIL_OPI_InsertUpdate"
TRIGGER_HASH = "00d6dcb6dfcd6d6011214aa3353d63b3882e5a60887918345f546784da2fd6aa"


def _normal(value, column):
    if value is None:
        return None
    if column.endswith("SID"):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat(sep=" ", timespec="seconds")
    if isinstance(value, (date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return int(value) if value == int(value) else float(value)
    return value


def _rows(cursor, sql, parameters=()):
    cursor.execute(sql, *parameters)
    columns = [d[0] for d in cursor.description]
    values = cursor.fetchmany(1002)
    if len(values) > 1000:
        raise MesError("排程關聯資料超過1000筆，請縮小範圍。", "scope_too_large")
    return [{c: _normal(v, c) for c, v in zip(columns, row)} for row in values]


def _table(cursor, table, sid, lock=False):
    hint = " WITH (UPDLOCK,HOLDLOCK)" if lock else ""
    key = PK[SCHEDULE] if table != OUTPUT else PK[HIST]
    if table == OUTPUT:
        where = f"[{key}] IN (SELECT [{PK[HIST]}] FROM dbo.[{HIST}]{hint} WHERE [{PK[SCHEDULE]}]=?)"
    else:
        where = f"[{key}]=?"
    sql = "SELECT " + ",".join(f"[{c}]" for c in READ_COLUMNS[table]) + f" FROM dbo.[{table}]{hint} WHERE {where} ORDER BY [{PK[table]}]"
    return {r[PK[table]]: r for r in _rows(cursor, sql, (sid,))}


def _one(rows, label):
    if len(rows) != 1:
        raise MesError(f"{label}不存在或不唯一，請重新查詢。", "validation")
    return rows[0]


def _validate_input(args):
    domain._validate_schema(args, domain.actions()["schedule.save"])
    if len(args.get("comment", "").encode("utf-16-le")) // 2 > 255:
        raise MesError("排程備註最多255個UTF-16字元單位。", "validation")
    if len(args["details"]) > 100:
        raise MesError("單次排程最多100筆明細。", "validation")


def _load(cursor, args, lock=False):
    _validate_input(args)
    hint = " WITH (UPDLOCK,HOLDLOCK)" if lock else ""
    cursor.execute("SELECT m.definition,t.is_disabled FROM sys.triggers t JOIN sys.sql_modules m ON m.object_id=t.object_id WHERE t.name=? AND t.parent_id=OBJECT_ID(?)", TRIGGER, "dbo." + DETAIL)
    trigger = cursor.fetchone()
    if not trigger or trigger[1] or hashlib.sha256(re.sub(r"\s+", " ", trigger[0]).strip().lower().encode()).hexdigest() != TRIGGER_HASH:
        raise MesError("排程明細觸發器與已驗證版本不同或未啟用，禁止自動寫入。", "unverified_contract")
    equipment = _one(_rows(cursor, f"SELECT EQP_SID,EQP_NO,EQP_NAME,EQP_TYPE,FAB FROM dbo.EQP_MASTER{hint} WHERE EQP_NO=? AND EQP_TYPE=?", (args["equipment"], "EPS")), "EPS設備")
    if not str(equipment.get("FAB") or "").strip():
        raise MesError("設備尚未設定FAB。", "validation")
    mold = _one(_rows(cursor, f"SELECT TOL_SID,TOL_NO,TOL_OPERATION,DEFAULT_CYCLE_TIME FROM dbo.TOL_MASTER{hint} WHERE TOL_NO=? AND TOL_OPERATION=? AND ENABLE_FLAG=?", (args["mold_no"], "EPS-FORMING", "Y")), "有效EPS模具")
    mold_details = _rows(cursor, f"SELECT d.TOL_DETALS_SID,d.TOL_DETALS_NAME,d.TOL_DETALS_NO,d.CUR_CAV,d.PART_NO,p.PART_SPEC FROM dbo.TOL_MASTER_DETAILS d{hint} JOIN dbo.BAS_PARTNO p{hint} ON p.PART_NO=d.PART_NO WHERE d.TOL_NO=? AND d.ENABLE_FLAG=? ORDER BY d.TOL_DETALS_SID", (mold["TOL_NO"], "Y"))
    mold["DETAILS"] = mold_details
    mold["PART_NOS"] = sorted({d["PART_NO"] for d in mold_details})
    parts = [{"PART_NO": d["PART_NO"], "PART_SPEC": d["PART_SPEC"]} for d in mold_details]
    orders = []
    for wo in sorted({d["wo"] for d in args["details"] if d["wo"]}):
        orders.append(_one(_rows(cursor, f"SELECT WO_SID,WO,PART_NO,QUANTITY AS WO_QTY,ISNULL(ACCUMULATED_QUANTITY,0) AS ACCUMULATED_QTY FROM dbo.WOR_MASTER{hint} WHERE WO=? AND STATUS=? AND ISNULL(ACCUMULATED_QUANTITY,0)<QUANTITY*1.1", (wo, "Release")), "可排工單"))
    start = domain._time(args["start_time"])
    try:
        day = (start - domain.timedelta(days=1) if start.hour < 8 else start).date().isoformat()
    except OverflowError:
        raise MesError("開始時間超出可處理日期範圍。", "validation") from None
    shift_columns = ("ZZ_KAOSU_PROD_SHIFT_DAILY_REPORT_BASE_SID", "FAB", "SHIFT_START_DAY", "SHIFT_END_DAY", "SHIFT_CLASS_1", "SHIFT_START_DATE_1", "SHIFT_START_TIME_1", "SHIFT_END_DATE_1", "SHIFT_END_TIME_1", "SHIFT_CLASS_2", "SHIFT_START_DATE_2", "SHIFT_START_TIME_2", "SHIFT_END_DATE_2", "SHIFT_END_TIME_2")
    shifts = _rows(cursor, "SELECT " + ",".join(shift_columns) + f" FROM dbo.[{domain.SHIFT}]{hint} WHERE (LTRIM(RTRIM(FAB))=? AND CAST(SHIFT_START_DAY AS date)=?) OR ((FAB IS NULL OR LTRIM(RTRIM(FAB))='') AND ? BETWEEN CAST(SHIFT_START_DAY AS date) AND CAST(SHIFT_END_DAY AS date))", (equipment["FAB"].strip(), day, day))
    for shift in shifts:
        shift["FAB"] = str(shift["FAB"] or "").strip()
        for field in ("SHIFT_START_DAY", "SHIFT_END_DAY"):
            shift[field] = str(shift[field])[:10]
        for n in (1, 2):
            for edge in ("START", "END"):
                key = f"SHIFT_{edge}_DATE_{n}"
                try:
                    shift[key] = int(shift[key] or 0)
                except (TypeError, ValueError):
                    raise MesError("班別日期位移不是有效整數。", "validation") from None
    sid = args.get("schedule_id")
    tables = {table: _table(cursor, table, sid, lock) if sid else {} for table in (SCHEDULE, DETAIL, HIST, OUTPUT)}
    if sid and (sid not in tables[SCHEDULE] or tables[SCHEDULE][sid]["OPERATION_CODE"] != "EPS-FORMING"):
        raise MesError("目標EPS排程不存在。", "not_found")
    if sid and set(tables[DETAIL]) != set(tables[HIST]):
        raise MesError("排程明細與執行歷程不是同鍵一對一，請先修復來源資料。", "unverified_contract")
    tables[domain.DEFECT] = {}
    tables["EQP_MASTER"] = {equipment["EQP_SID"]: equipment}
    tables[domain.SHIFT] = {s["ZZ_KAOSU_PROD_SHIFT_DAILY_REPORT_BASE_SID"]: s for s in shifts}
    return {"mode": "live", "next_id": 900000000000000000, "tables": tables, "catalogs": {"parts": parts, "molds": [mold], "work_orders": orders, "defect_reasons": []}, "iot": {}, "trigger_hash": TRIGGER_HASH}


def _clock(cursor):
    cursor.execute("SELECT dbo.GET_DATETIME_STRING()")
    return domain._time(str(cursor.fetchone()[0]))


def _plan(state, identity, args, now):
    after = domain.execute(state, "schedule", "schedule.save", args, identity, now)
    deleted = set(state["tables"][DETAIL]) - set(after["tables"][DETAIL])
    protected = {r[PK[HIST]] for r in state["tables"][OUTPUT].values()}
    if deleted & protected:
        raise MesError("將刪除的排程明細已有人工報工；觸發器會留下孤兒報工，請先採獨立核准的清理流程。", "linked_reports")
    for key in protected & set(after["tables"][DETAIL]):
        old, new = state["tables"][DETAIL][key], after["tables"][DETAIL][key]
        if any(old[f] != new[f] for f in ("WO_SID", "PART_NO", "TOL_DETALS_SID")):
            raise MesError("已有人工報工的明細不能直接換工單、品號或模具明細。", "linked_reports")
    _predict_trigger(state, after, now)
    return after


def _predict_trigger(before, after, now):
    hist = after["tables"][HIST]
    for key in set(before["tables"][DETAIL]) - set(after["tables"][DETAIL]):
        hist.pop(key, None)
    for key, detail in after["tables"][DETAIL].items():
        schedule = after["tables"][SCHEDULE][detail[PK[SCHEDULE]]]
        old = before["tables"][HIST].get(key)
        row = deepcopy(old) if old else {column: None for column in HIST_COLUMNS}
        wo = next((w["WO"] for w in after["catalogs"]["work_orders"] if w["WO_SID"] == detail["WO_SID"]), None)
        mold_detail = next(d for d in after["catalogs"]["molds"][0]["DETAILS"] if d["TOL_DETALS_SID"] == detail["TOL_DETALS_SID"])
        row.update({PK[HIST]: key, PK[SCHEDULE]: detail[PK[SCHEDULE]], PK[DETAIL]: key, "WO": wo, "EQP_NO": after["tables"]["EQP_MASTER"][schedule["EQP_SID"]]["EQP_NO"], "TOL_SID": schedule["TOL_SID"], "SCHEDULE_CUR_CAV": detail["SCHEDULE_CUR_CAV"], "OPI_CAV": detail["SCHEDULE_CUR_CAV"], "SHIFT_DAY": schedule["SCHEDULE_DATE"], "SCHEDULE_EDIT_USER": detail["EDIT_USER"], "SCHEDULE_EDIT_TIME": detail["EDIT_TIME"], "ZZ_TOL_DETALS_NO": mold_detail["TOL_DETALS_NO"]})
        for n in (1, 2):
            for field in (f"SHIFT_CLASS_{n}", f"SHIFT_START_TIME_{n}", f"SHIFT_END_TIME_{n}"):
                row[field] = schedule[field]
        if not old:
            row.update(DEPT_NO=schedule["OPERATION_CODE"], OPERATION_CODE=schedule["OPERATION_CODE"], ENABLE_FLAG="Y", CREATE_USER="SQLtrigger_user", EDIT_USER="SQLtrigger_user", CREATE_TIME=domain._stamp(now), EDIT_TIME=domain._stamp(now), COMPLETED="N")
        hist[key] = row


def prepare(bridge, identity, args):
    bridge._authorize(identity, "schedule")
    try:
        with bridge._db() as db:
            cursor = db.cursor()
            cursor.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
            state = _load(cursor, args)
            after = _plan(state, identity, args, _clock(cursor))
            return {"module": "schedule", "action": "schedule.save", "args": deepcopy(args), "version": bridge._version(state, identity, "schedule", "schedule.save", args), "changes": changes(state, after), "writes_enabled": bridge.config.writes_enabled, "live_write_verified": False, "label": "排程與觸發器連動預覽；新增識別碼於執行時分配", "trigger_effects": True}
    except (MesError, domain.BusinessError):
        raise
    except Exception:
        raise MesError("排程預覽失敗，未執行寫入。", "mes_unavailable") from None


def _allocate(cursor, reserved):
    for _ in range(12):
        cursor.execute("SELECT dbo.GetSid()")
        key = str(cursor.fetchone()[0])
        if not re.fullmatch(r"[1-9][0-9]{0,17}", key) or key in reserved:
            continue
        cursor.execute(f"SELECT 1 FROM dbo.[{SCHEDULE}] WITH(UPDLOCK,HOLDLOCK) WHERE [{PK[SCHEDULE]}]=? UNION ALL SELECT 1 FROM dbo.[{DETAIL}] WITH(UPDLOCK,HOLDLOCK) WHERE [{PK[DETAIL]}]=? UNION ALL SELECT 1 FROM dbo.[{HIST}] WITH(UPDLOCK,HOLDLOCK) WHERE [{PK[HIST]}]=?", key, key, key)
        if not cursor.fetchone():
            reserved.add(key)
            return key
    raise MesError("無法取得唯一排程識別碼，交易已取消。", "conflict")


def _remap(cursor, before, after, now):
    reserved = set()
    for table in (SCHEDULE, DETAIL):
        for temporary in sorted(set(after["tables"][table]) - set(before["tables"][table])):
            key = _allocate(cursor, reserved)
            row = after["tables"][table].pop(temporary)
            row[PK[table]] = key
            after["tables"][table][key] = row
            if table == SCHEDULE:
                for detail in after["tables"][DETAIL].values():
                    if detail[PK[SCHEDULE]] == temporary:
                        detail[PK[SCHEDULE]] = key
    after["tables"][HIST] = deepcopy(before["tables"][HIST])
    _predict_trigger(before, after, now)


def _apply(cursor, before, after):
    for table in (SCHEDULE, DETAIL):
        old, new = before["tables"][table], after["tables"][table]
        if table == DETAIL:
            for key in sorted(set(old) - set(new)):
                cursor.execute(f"DELETE FROM dbo.[{DETAIL}] WHERE [{PK[DETAIL]}]=? AND [{PK[SCHEDULE]}]=?", key, old[key][PK[SCHEDULE]])
                if cursor.rowcount != 1:
                    raise MesError("排程明細刪除筆數不符。", "conflict")
        for key, row in new.items():
            columns = [c for c in READ_COLUMNS[table] if c != PK[table]]
            if key not in old:
                columns = [PK[table]] + columns
                cursor.execute(f"INSERT INTO dbo.[{table}] (" + ",".join(f"[{c}]" for c in columns) + ") VALUES (" + ",".join("?" for _ in columns) + ")", *(row.get(c) for c in columns))
            else:
                columns = [c for c in columns if c not in {"CREATE_USER", "CREATE_TIME"}]
                # 即使模穴值不變，也需 UPDATE 明細以觸發原有同步。
                cursor.execute(f"UPDATE dbo.[{table}] SET " + ",".join(f"[{c}]=?" for c in columns) + f" WHERE [{PK[table]}]=?", *(row.get(c) for c in columns), key)
            if cursor.rowcount != 1:
                raise MesError("排程寫入影響筆數不符，交易已取消。", "conflict")


def execute(bridge, identity, args, expected_version, operation_id):
    bridge._authorize(identity, "schedule")
    if not bridge.config.writes_enabled:
        raise MesError("正式排程寫入預設鎖閉，需獨立環境驗收與部署啟用。", "live_write_locked")
    try:
        operation_id = str(UUID(operation_id))
    except (ValueError, TypeError, AttributeError):
        raise MesError("操作識別碼必須是UUID。", "validation") from None
    fingerprint = digest({"actor": identity["id"], "module": "schedule", "action": "schedule.save", "args": args, "version": expected_version})
    commit_started = False
    try:
        with bridge._db(write=True) as db:
            cursor = db.cursor()
            cursor.execute("SET XACT_ABORT ON; SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
            cursor.execute("DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=N'ZZ_AI_AGENT_OPERATION_SCHEDULE_WRITE',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000; SELECT @r")
            if cursor.fetchone()[0] < 0:
                raise MesError("排程操作忙碌，請稍後重新確認。", "conflict")
            cursor.execute(f"SELECT REQUEST_HASH,RESULT_JSON FROM dbo.{PREFIX}OPERATION WITH(UPDLOCK,HOLDLOCK) WHERE OPERATION_ID=?", operation_id)
            previous = cursor.fetchone()
            if previous:
                if previous[0] != fingerprint:
                    raise MesError("操作識別碼已用於不同內容。", "conflict")
                return {**json.loads(previous[1]), "replayed": True}
            state = _load(cursor, args, lock=True)
            version = bridge._version(state, identity, "schedule", "schedule.save", args)
            if not isinstance(expected_version, str) or not hmac.compare_digest(version, expected_version):
                raise MesError("排程、主檔或班別已變更，請重新產生確認卡。", "stale")
            now = _clock(cursor)
            after = _plan(state, identity, args, now)
            _remap(cursor, state, after, now)
            _apply(cursor, state, after)
            sid = next(iter(after["tables"][SCHEDULE]))
            observed = deepcopy(after)
            for table in (SCHEDULE, DETAIL, HIST):
                observed["tables"][table] = _table(cursor, table, sid, lock=True)
                if set(observed["tables"][table]) != set(after["tables"][table]):
                    raise MesError("排程觸發後資料筆數不符，交易已取消。", "verification_failed")
                for key, row in observed["tables"][table].items():
                    for column in READ_COLUMNS[table]:
                        expected = after["tables"][table][key].get(column)
                        if table == HIST and key not in state["tables"][HIST] and column in {"CREATE_TIME", "EDIT_TIME"}:
                            if row[column] is None or abs((domain._time(row[column]) - now).total_seconds()) > 60:
                                raise MesError("觸發器建立時間不符，交易已取消。", "verification_failed")
                            continue
                        actual = row.get(column)
                        if column in {"SCHEDULE_DATE", "SHIFT_DAY"} and actual is not None:
                            actual = str(actual)[:10]
                            row[column] = actual
                        if actual != expected:
                            raise MesError(f"排程讀回欄位 {column} 與預期不符，交易已取消。", "verification_failed")
            actual_changes = changes(state, observed)
            result = {"operation_id": operation_id, "status": "executed", "schedule_id": sid, "changes": actual_changes, "replayed": False, "trigger_verified": True}
            cursor.execute(f"INSERT INTO dbo.{PREFIX}OPERATION(OPERATION_ID,OCCURRED_AT,MODULE,ACTOR_ID,ACTION,REQUEST_HASH,RESULT,RESULT_JSON) VALUES (?,?,?,?,?,?,?,?)", operation_id, now, "schedule", identity["id"], "schedule.save", fingerprint, "executed", dumps(result))
            audit_rows = [(operation_id, index, change["table"], change["key"], change["field"], dumps(change["before"]), dumps(change["after"])) for index, change in enumerate(actual_changes)]
            # 每批最多1400個參數，保持同交易並避免每個欄位各做一次網路往返。
            for offset in range(0, len(audit_rows), 200):
                batch = audit_rows[offset:offset + 200]
                cursor.execute(f"INSERT INTO dbo.{PREFIX}CHANGE(OPERATION_ID,SEQ,TABLE_NAME,ROW_KEY,COLUMN_NAME,BEFORE_JSON,AFTER_JSON) VALUES " + ",".join("(?,?,?,?,?,?,?)" for _ in batch), *(value for row in batch for value in row))
            commit_started = True
            db.commit()
            return result
    except (MesError, domain.BusinessError):
        raise
    except Exception:
        if commit_started:
            raise MesError("提交結果待確認，保留原操作識別碼，不得換新識別碼重送。", "outcome_unknown") from None
        raise MesError("排程交易失敗並已要求回復，未宣稱成功。", "transaction_failed") from None
