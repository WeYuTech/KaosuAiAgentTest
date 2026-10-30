"""隔離 MES 模擬領域；主檔為合成資料，無正式資料庫連線。"""

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from calendar import monthrange
import math
import os
import re


SCHEDULE = "ZZ_KAOSU_PROD_SCHEDULE"
DETAIL = "ZZ_KAOSU_PROD_SCHEDULE_DETAIL"
EXECUTION = "WIP_OPI_WDOEACICO_HIST"
OUTPUT = "WIP_OPI_WDOEACICOOUTPUT_HIST"
DEFECT = "WIP_OPI_WDOEACICONG_HIST_DETAIL"
SHIFT = "ZZ_KAOSU_PROD_SHIFT_DAILY_REPORT_BASE"
BUSINESS_TZ = timezone(timedelta(hours=float(os.getenv("MES_SERVER_UTC_OFFSET_HOURS", "7"))))


class BusinessError(Exception):
    def __init__(self, message, code="validation"):
        super().__init__(message)
        self.message = message
        self.code = code


def _schema(properties, required):
    return {"type": "object", "properties": properties, "required": required, "additionalProperties": False}


def actions():
    text = {"type": "string", "minLength": 1}
    count = {"type": "integer", "minimum": 0, "maximum": 2147483647}
    detail = _schema({"detail_id": text, "part_no": text, "wo": {"type": "string"}, "cavities": count}, ["part_no", "wo", "cavities"])
    schemas = {"schedule.save": _schema({
        "schedule_id": text, "equipment": text, "part_no": text, "mold_no": text,
        "start_time": {**text, "description": "MES伺服器當地日期時間 YYYY-MM-DD HH:mm:ss；帶明確 ISO 時區時依伺服器設定換算，無時區輸入保持原數字。"}, "cycle_seconds": {**count, "minimum": 1},
        "target_shots": count, "status": {"type": "string", "enum": ["TRY", "DO", "RUN"]},
        "priority": {"type": "integer", "minimum": 0}, "comment": {"type": "string", "maxLength": 1000},
        "details": {"type": "array", "minItems": 1, "items": detail},
    }, ["equipment", "part_no", "mold_no", "start_time", "cycle_seconds", "target_shots", "status", "details"])}
    schemas["report.add"] = _schema({"execution_id": text, "ok": count, "defects": {"type": "array", "items": _schema({"code": text, "quantity": count}, ["code", "quantity"])}, "comment": {"type": "string", "maxLength": 1000}}, ["execution_id", "ok", "defects"])
    schemas["report.update"] = deepcopy(schemas["report.add"])
    del schemas["report.update"]["properties"]["execution_id"]
    schemas["report.update"]["properties"]["report_id"] = text
    schemas["report.update"]["required"] = ["report_id", "ok", "defects"]
    schemas["report.delete"] = _schema({"report_id": text}, ["report_id"])
    schemas["report.cavities"] = _schema({"execution_id": text, "cavities": count}, ["execution_id", "cavities"])
    schemas["report.complete"] = _schema({"schedule_id": text}, ["schedule_id"])
    for action in ("mount_start", "mount_finish", "unmount_start", "unmount_finish", "clear"):
        schemas["mold." + action] = _schema({"schedule_id": text}, ["schedule_id"])
    return schemas


def seed_state():
    state = {"mode": "simulation", "label": "隔離模擬資料，非正式 MES", "simulation_date": "2026-10-30", "next_id": 9000, "tables": {}}
    tables = state["tables"]
    tables["EQP_MASTER"] = {
        "37": {"EQP_SID": "37", "EQP_NO": "MC37", "EQP_NAME": "模擬 EPS 成型機 37", "EQP_TYPE": "EPS", "FAB": "fac2"},
        "36": {"EQP_SID": "36", "EQP_NO": "MC36", "EQP_NAME": "模擬 EPS 成型機 36", "EQP_TYPE": "EPS", "FAB": "fac2"},
    }
    tables[SHIFT] = {"7001": {"ZZ_KAOSU_PROD_SHIFT_DAILY_REPORT_BASE_SID": "7001", "FAB": "", "SHIFT_START_DAY": "2020-01-01", "SHIFT_END_DAY": "2099-12-31", "SHIFT_CLASS_1": "日班", "SHIFT_START_TIME_1": "08:00", "SHIFT_END_TIME_1": "20:00", "SHIFT_START_DATE_1": 0, "SHIFT_END_DATE_1": 0, "SHIFT_CLASS_2": "夜班", "SHIFT_START_TIME_2": "20:00", "SHIFT_END_TIME_2": "08:00", "SHIFT_START_DATE_2": 0, "SHIFT_END_DATE_2": 1}}
    state["catalogs"] = {
        "parts": [{"PART_NO": "EPS-A", "PART_SPEC": "模擬左側緩衝件"}, {"PART_NO": "EPS-B", "PART_SPEC": "模擬右側緩衝件"}],
        "molds": [{"TOL_SID": "51", "TOL_NO": "MOLD-A", "PART_NOS": ["EPS-A", "EPS-B"], "DEFAULT_CYCLE_TIME": 60, "DETAILS": [{"TOL_DETALS_SID": "61", "TOL_DETALS_NO": "MOLD-A-L", "PART_NO": "EPS-A", "CUR_CAV": 2}, {"TOL_DETALS_SID": "62", "TOL_DETALS_NO": "MOLD-A-R", "PART_NO": "EPS-B", "CUR_CAV": 1}]}],
        "work_orders": [{"WO_SID": "71", "WO": "WO-A", "PART_NO": "EPS-A", "WO_QTY": 1000, "ACCUMULATED_QTY": 100}, {"WO_SID": "72", "WO": "WO-B", "PART_NO": "EPS-B", "WO_QTY": 1000, "ACCUMULATED_QTY": 50}],
        "defect_reasons": [{"NG_CODE_NO": "NG01", "NG_CODE_NAME": "缺料"}, {"NG_CODE_NO": "NG02", "NG_CODE_NAME": "破損"}],
    }
    tables[SCHEDULE], tables[DETAIL], tables[EXECUTION], tables[OUTPUT], tables[DEFECT] = {}, {}, {}, {}, {}
    for sid, eqp, hour in [("1001", "37", 8), ("1002", "37", 14), ("1003", "36", 8)]:
        tables[SCHEDULE][sid] = {"ZZ_KAOSU_PROD_SCHEDULE_SID": sid, "SCHEDULE_DATE": "2026-10-30", "SCHEDULE_START_TIME": f"2026-10-30 {hour:02d}:00:00", "SCHEDULE_END_TIME": f"2026-10-30 {hour + 2:02d}:00:00", "OPERATION_CODE": "EPS-FORMING", "EQP_SID": eqp, "TOL_SID": "51", "SCHEDULE_CYCLE_TIME": 60, "TARGET_SHOT": 120, "CHANGE_MOLD": "Y", "COMMENT": "合成模擬資料", "PRODUCTION_STATUS": "RUN", "PRIORITY": 3, "CREATE_USER": "DEMO", "CREATE_TIME": "2026-10-30 07:00:00", "EDIT_USER": "DEMO", "EDIT_TIME": "2026-10-30 07:00:00", "ZZ_KAOSU_PROD_SHIFT_DAILY_REPORT_BASE_SID": "7001"}
    for did, sid, part, wo, cav in [("1101", "1001", "EPS-A", "71", 2), ("1102", "1001", "EPS-B", "72", 1), ("1103", "1002", "EPS-A", "71", 2), ("1104", "1003", "EPS-A", "71", 2)]:
        mold_detail = next(r for r in state["catalogs"]["molds"][0]["DETAILS"] if r["PART_NO"] == part)
        tables[DETAIL][did] = {"ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID": did, "ZZ_KAOSU_PROD_SCHEDULE_SID": sid, "TOL_DETALS_SID": mold_detail["TOL_DETALS_SID"], "PART_NO": part, "PART_SPEC": next(p["PART_SPEC"] for p in state["catalogs"]["parts"] if p["PART_NO"] == part), "WO_SID": wo, "WO_QUANTITY": 1000, "SCHEDULE_CUR_CAV": cav, "TARGET_PCS": 120 * cav}
    for eid, did in [("2001", "1101"), ("2002", "1102"), ("2003", "1103"), ("2004", "1104")]:
        detail = tables[DETAIL][did]
        schedule = tables[SCHEDULE][detail["ZZ_KAOSU_PROD_SCHEDULE_SID"]]
        running = schedule["ZZ_KAOSU_PROD_SCHEDULE_SID"] == "1001"
        tables[EXECUTION][eid] = {"WIP_OPI_WDOEACICO_HIST_SID": eid, "ZZ_KAOSU_PROD_SCHEDULE_SID": schedule["ZZ_KAOSU_PROD_SCHEDULE_SID"], "ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID": did, "EQP_NO": "MC" + schedule["EQP_SID"], "WO": "WO-A" if detail["PART_NO"] == "EPS-A" else "WO-B", "SHIFT_DAY": "2026-10-30", "OPERATION_CODE": "EPS-FORMING", "OPI_CAV": detail["SCHEDULE_CUR_CAV"], "COMPLETED": "N", "COMPLETED_TIME": None, "CHECK_IN_TIME": "2026-10-30 08:00:00" if running else None, "REAL_CHECK_IN_TIME": "2026-10-30 08:10:00" if running else None, "CHECK_OUT_TIME": None, "ZZ_MODLE_UPLOAD_START": "2026-10-30 08:00:00" if running else None, "ZZ_MODLE_UPLOAD_END": "2026-10-30 08:10:00" if running else None, "ZZ_MODLE_REMOVE_START": None, "ZZ_MODLE_REMOVE_END": None, "ENABLE_FLAG": "Y"}
    state["iot"] = {"2001": 250, "2002": None, "2003": None, "2004": None}
    return state


def _pick(rows, field, value, label):
    matches = [r for r in rows if str(r.get(field, "")) == str(value)]
    if len(matches) != 1:
        raise BusinessError(f"{label}不存在或不唯一，請選擇明確項目。", "not_found")
    return matches[0]


def _integer(value, label, minimum=0):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or (isinstance(value, float) and not math.isfinite(value)) or int(value) != value or value < minimum or value > 2147483647:
        raise BusinessError(f"{label}須為 {minimum} 至 2147483647 的整數，不接受截斷小數。")
    return int(value)


def _time(value):
    try:
        result = datetime.fromisoformat(value)
        if result.tzinfo is not None:
            result = result.astimezone(BUSINESS_TZ).replace(tzinfo=None)
        return result
    except (ValueError, TypeError, OverflowError):
        raise BusinessError("時間須為MES伺服器當地日期時間，例如 2026-10-30 08:00。") from None


def _date(value):
    text = str(value).strip().replace("/", "-")
    if re.fullmatch(r"\d{8}", text):
        text = text[:4] + "-" + text[4:6] + "-" + text[6:]
    try:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
            raise ValueError()
        return datetime.strptime(text, "%Y-%m-%d").date().isoformat()
    except ValueError:
        raise BusinessError("查詢日期不合法，請使用有效的年月日。") from None


def _stamp(value):
    return value.strftime("%Y-%m-%d %H:%M:%S")


def _new_id(state):
    state["next_id"] += 1
    return str(state["next_id"])


def _row(state, table, sid):
    if str(sid) not in state["tables"][table]:
        raise BusinessError("找不到指定資料，請重新查詢並選擇。", "not_found")
    return state["tables"][table][str(sid)]


def _catalogs(state):
    result = deepcopy(state["catalogs"])
    result["shift_settings"] = sorted(deepcopy(list(state["tables"][SHIFT].values())), key=lambda r: r["ZZ_KAOSU_PROD_SHIFT_DAILY_REPORT_BASE_SID"])
    result["equipment"] = sorted(deepcopy(list(state["tables"]["EQP_MASTER"].values())), key=lambda r: r["EQP_NO"])
    result["schedules"] = [{"schedule_id": r["ZZ_KAOSU_PROD_SCHEDULE_SID"], "equipment": _row(state, "EQP_MASTER", r["EQP_SID"])["EQP_NO"], "start_time": r["SCHEDULE_START_TIME"]} for r in sorted(state["tables"][SCHEDULE].values(), key=lambda r: r["ZZ_KAOSU_PROD_SCHEDULE_SID"])]
    return result


def query(state, module, filters=None):
    filters = filters or {}
    history = str(filters.get("history") or "all").lower()
    if module not in {"schedule", "report", "mold"}:
        raise BusinessError("未知模組。")
    records = []
    if module == "schedule":
        for source in state["tables"][SCHEDULE].values():
            row = deepcopy(source)
            row["EQP_NO"] = _row(state, "EQP_MASTER", row["EQP_SID"])["EQP_NO"]
            row["TOL_NO"] = _pick(state["catalogs"]["molds"], "TOL_SID", row["TOL_SID"], "模具")["TOL_NO"]
            row["DETAILS"] = []
            executions = [r for r in state["tables"][EXECUTION].values() if r["ZZ_KAOSU_PROD_SCHEDULE_SID"] == row["ZZ_KAOSU_PROD_SCHEDULE_SID"]]
            row["COMPLETED"] = "Y" if executions and all(r["COMPLETED"] == "Y" for r in executions) else "N"
            for source_detail in state["tables"][DETAIL].values():
                if source_detail["ZZ_KAOSU_PROD_SCHEDULE_SID"] == row["ZZ_KAOSU_PROD_SCHEDULE_SID"]:
                    detail = deepcopy(source_detail)
                    detail["WO"] = next((w["WO"] for w in state["catalogs"]["work_orders"] if w["WO_SID"] == detail["WO_SID"]), "")
                    row["DETAILS"].append(detail)
            records.append(row)
    else:
        records = list(deepcopy(state["tables"][EXECUTION]).values())
        for row in records:
            detail = state["tables"][DETAIL].get(row.get("ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID"))
            row["PART_NO"] = detail["PART_NO"] if detail else None
        if module == "report":
            for row in records:
                eid = row["WIP_OPI_WDOEACICO_HIST_SID"]
                schedule = _row(state, SCHEDULE, row["ZZ_KAOSU_PROD_SCHEDULE_SID"])
                row["TOL_NO"] = _pick(state["catalogs"]["molds"], "TOL_SID", schedule["TOL_SID"], "模具")["TOL_NO"]
                reports = [deepcopy(r) for r in state["tables"][OUTPUT].values() if r["WIP_OPI_WDOEACICO_HIST_SID"] == eid and r["ENABLE_FLAG"] == "Y"]
                reports.sort(key=lambda r: (r["CREATE_TIME"], r["WIP_OPI_WDOEACICOOUTPUT_HIST_SID"]))
                for report in reports:
                    report["DEFECTS"] = sorted([deepcopy(d) for d in state["tables"][DEFECT].values() if d["WIP_OPI_WDOEACICOOUTPUT_HIST_SID"] == report["WIP_OPI_WDOEACICOOUTPUT_HIST_SID"]], key=lambda d: d["NG_CODE"])
                row["REPORTS"] = reports
                row["MANUAL_OK"] = sum(r["OK_QTY"] for r in reports)
                row["MANUAL_NG"] = sum(r["NG_QTY"] for r in reports)
                row["IOT_QUANTITY"] = state["iot"].get(eid)
                row["IOT_INFERRED_OK"] = None if row["IOT_QUANTITY"] is None else row["IOT_QUANTITY"] - row["MANUAL_NG"]
        else:
            grouped = []
            for schedule in state["tables"][SCHEDULE].values():
                rows = [r for r in records if r["ZZ_KAOSU_PROD_SCHEDULE_SID"] == schedule["ZZ_KAOSU_PROD_SCHEDULE_SID"]]
                row = deepcopy(schedule)
                row.update({field: rows[0].get(field) if rows else None for field in ("CHECK_IN_TIME", "CHECK_OUT_TIME", "ZZ_MODLE_UPLOAD_START", "ZZ_MODLE_UPLOAD_END", "ZZ_MODLE_REMOVE_START", "ZZ_MODLE_REMOVE_END", "COMPLETED_TIME")})
                row["COMPLETED"] = "Y" if rows and all(r["COMPLETED"] == "Y" for r in rows) else "N"
                row["EQP_NO"] = _row(state, "EQP_MASTER", schedule["EQP_SID"])["EQP_NO"]
                row["TOL_NO"] = _pick(state["catalogs"]["molds"], "TOL_SID", schedule["TOL_SID"], "模具")["TOL_NO"]
                row["EXECUTIONS"] = rows
                row["NEXT_ACTION"] = _mold_next(rows)
                grouped.append(row)
            records = grouped
            if history == "running":
                board = []
                for equipment in state["tables"]["EQP_MASTER"].values():
                    active = sorted([r for r in records if r["EQP_NO"] == equipment["EQP_NO"] and r["COMPLETED"] == "N" and r.get("ZZ_MODLE_UPLOAD_START")], key=lambda r: (r["SCHEDULE_START_TIME"], r["ZZ_KAOSU_PROD_SCHEDULE_SID"]), reverse=True)
                    row = active[0] if active else {"EQP_NO": equipment["EQP_NO"], "EQP_SID": equipment["EQP_SID"], "ZZ_KAOSU_PROD_SCHEDULE_SID": None, "TOL_NO": "", "COMPLETED": "N", "NEXT_ACTION": "mold.mount_start", "EXECUTIONS": []}
                    row["CANDIDATES"] = _mold_candidates(state, equipment["EQP_NO"])
                    board.append(row)
                records = board
            elif history in {"history", "true"}:
                today = _time(state.get("simulation_date", datetime.now(BUSINESS_TZ).date().isoformat()))
                month_index = today.year * 12 + today.month - 1 - 3
                year, month_zero = divmod(month_index, 12)
                cutoff = today.replace(year=year, month=month_zero + 1, day=min(today.day, monthrange(year, month_zero + 1)[1])).date().isoformat()
                records = [r for r in records if r.get("ZZ_MODLE_UPLOAD_START") and str(r.get("CREATE_TIME", "")) >= cutoff]
    equipment = filters.get("equipment") or filters.get("eqp_no")
    date = filters.get("date") or filters.get("schedule_date")
    wo = filters.get("wo")
    if equipment:
        records = [r for r in records if r.get("EQP_NO") == equipment]
    if date:
        dates = str(date).split("~")
        if len(dates) > 2:
            raise BusinessError("日期區間只能有開始與結束兩個日期。")
        start, end = _date(dates[0]), _date(dates[-1])
        if end < start:
            raise BusinessError("結束日期不得早於開始日期。")
        records = [r for r in records if start <= r.get("SCHEDULE_DATE", r.get("SHIFT_DAY", "")) <= end]
    if wo:
        records = [r for r in records if r.get("WO") == wo or any(d.get("WO") == wo for d in r.get("DETAILS", []) + r.get("EXECUTIONS", []))]
    fac = filters.get("factory") or filters.get("fac")
    if fac:
        bounds = {"fac1": (1, 20), "fac2": (21, 46), "fac3": (47, 60)}.get(str(fac).lower())
        def in_factory(row):
            match = re.search(r"\d+", row.get("EQP_NO", ""))
            return bounds and match and bounds[0] <= int(match.group()) <= bounds[1]
        records = [r for r in records if in_factory(r)]
    mold = filters.get("mold") or filters.get("tol_no")
    if mold:
        records = [r for r in records if str(mold).lower() in str(r.get("TOL_NO", "")).lower()]
    completed = str(filters.get("completed") or "").upper()
    if completed:
        if completed not in {"Y", "N"}:
            raise BusinessError("完工篩選僅接受 Y 或 N。")
        records = [r for r in records if r.get("COMPLETED") == completed]
    if history == "running":
        if module != "mold":
            records = [r for r in records if r.get("CHECK_IN_TIME") and r.get("COMPLETED") == "N"]
    elif history == "pending":
        records = [r for r in records if not r.get("ZZ_MODLE_UPLOAD_START") and r.get("COMPLETED") == "N"]
    elif history == "completed":
        records = [r for r in records if r.get("COMPLETED") == "Y"]
    elif history not in {"all", "history", "true"}:
        raise BusinessError("歷史篩選須為 all、running、pending 或 completed。")
    sort = str(filters.get("sort") or ("SCHEDULE_START_TIME" if module in {"schedule", "mold"} else "WIP_OPI_WDOEACICO_HIST_SID"))
    for sort_field in reversed([part.strip() for part in sort.split(",") if part.strip()]):
        descending = sort_field.startswith("-") or sort_field.lower().endswith(":desc")
        key = sort_field.lstrip("-").split(":")[0]
        def sort_value(row):
            value = row.get(key)
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                return (1, value)
            return (0 if value is None else 2, str(value or ""))
        records.sort(key=sort_value, reverse=descending)
    try:
        page = max(1, int(filters.get("page", 1)))
        page_size = min(100, max(1, int(filters.get("page_size", 20))))
    except (TypeError, ValueError):
        raise BusinessError("頁碼與每頁筆數須為整數。") from None
    total = len(records)
    page = min(page, max(1, (total + page_size - 1) // page_size))
    return {"module": module, "mode": "simulation", "label": state["label"], "records": records[(page - 1) * page_size:page * page_size], "total": total, "page": page, "page_size": page_size, "catalogs": _catalogs(state)}


def _mold_candidates(state, equipment):
    result = []
    for schedule in state["tables"][SCHEDULE].values():
        if _row(state, "EQP_MASTER", schedule["EQP_SID"])["EQP_NO"] != equipment or schedule["SCHEDULE_DATE"] < "2026-07-01":
            continue
        rows = _executions(state, schedule["ZZ_KAOSU_PROD_SCHEDULE_SID"])
        if rows and not any(r["COMPLETED"] == "N" and not r.get("ZZ_MODLE_UPLOAD_START") for r in rows):
            continue
        if not rows:
            continue
        result.append({"schedule_id": schedule["ZZ_KAOSU_PROD_SCHEDULE_SID"], "equipment": equipment, "start_time": schedule["SCHEDULE_START_TIME"], "priority": schedule["PRIORITY"]})
    return sorted(result, key=lambda r: (r["priority"], r["start_time"], r["schedule_id"]))


def execute(state, module, action, args, actor, now):
    if action not in actions() or action.split(".")[0] != module:
        raise BusinessError("此模組不允許該動作。")
    _validate_schema(args, actions()[action])
    result = deepcopy(state)
    if now.tzinfo is not None:
        now = now.astimezone(BUSINESS_TZ).replace(tzinfo=None)
    if action == "schedule.save":
        sid = _save_schedule(result, args, actor, now)
        if state.get("mode") == "simulation":
            _sync_simulated_schedule_trigger(state, result, sid, now)
    elif action in {"report.add", "report.update"}:
        _save_report(result, args, actor, now)
    elif action == "report.delete":
        report = _row(result, OUTPUT, args["report_id"])
        if report["ENABLE_FLAG"] != "Y":
            raise BusinessError("報工紀錄已停用。")
        _delete_defects(result, args["report_id"])
        del result["tables"][OUTPUT][args["report_id"]]
    elif action == "report.cavities":
        row = _row(result, EXECUTION, args["execution_id"])
        row["OPI_CAV"] = _integer(args["cavities"], "報工模穴（資料庫整數精度）")
    elif action == "report.complete":
        _complete(result, args["schedule_id"], actor, now)
    elif module == "mold":
        _mold(result, action, args["schedule_id"], actor, now)
    return result


def _validate_schema(value, schema, field="操作參數"):
    kind = schema["type"]
    if kind == "object":
        if not isinstance(value, dict):
            raise BusinessError(f"{field}須為欄位物件。")
        missing = [k for k in schema["required"] if k not in value]
        if missing:
            raise BusinessError("缺少必要資料：" + "、".join(missing))
        if set(value) - set(schema["properties"]):
            raise BusinessError("含未允許的操作參數。")
        for key, child in value.items():
            _validate_schema(child, schema["properties"][key], key)
    elif kind == "array":
        if not isinstance(value, list) or len(value) < schema.get("minItems", 0):
            raise BusinessError(f"{field}須為有效明細清單。")
        if len(value) > 500:
            raise BusinessError("單次明細不可超過500筆。")
        for child in value:
            _validate_schema(child, schema["items"], field)
    elif kind == "string":
        if not isinstance(value, str) or len(value.strip()) < schema.get("minLength", 0) or len(value) > schema.get("maxLength", 1000):
            raise BusinessError(f"{field}須為有效文字，且不得超出長度限制。")
    elif kind in {"integer", "number"}:
        if isinstance(value, bool) or not isinstance(value, (int, float)) or (isinstance(value, float) and not math.isfinite(value)):
            raise BusinessError(f"{field}須為有效數字。")
        if kind == "integer" and int(value) != value:
            raise BusinessError(f"{field}須為整數，不接受截斷小數。")
        if value < schema.get("minimum", float("-inf")) or value > schema.get("maximum", float("inf")):
            raise BusinessError(f"{field}超出允許範圍。")
    if "enum" in schema and value not in schema["enum"]:
        raise BusinessError(f"{field}不在允許選項中。")


MOLD_FIELDS = ("ZZ_MODLE_UPLOAD_START", "ZZ_MODLE_UPLOAD_END", "ZZ_MODLE_REMOVE_START", "ZZ_MODLE_REMOVE_END")
MOLD_ACTIONS = ("mold.mount_start", "mold.mount_finish", "mold.unmount_start", "mold.unmount_finish")


def _mold_next(rows):
    if not rows:
        return "mold.mount_start"
    stages = set()
    for row in rows:
        stages.add(next((i for i, field in enumerate(MOLD_FIELDS) if not row.get(field)), 4))
    if len(stages) != 1:
        return None
    stage = stages.pop()
    return MOLD_ACTIONS[stage] if stage < 4 else None


def _mold(state, action, sid, actor, now):
    rows = _executions(state, sid)
    if action == "mold.clear":
        if not rows or not any(r.get("ZZ_MODLE_UPLOAD_START") for r in rows):
            raise BusinessError("沒有上模紀錄可清除。", "state_conflict")
        for row in rows:
            row.update({field: None for field in MOLD_FIELDS + ("CHECK_IN_TIME", "CHECK_OUT_TIME", "COMPLETED_TIME")})
            row.update(COMPLETED="N", EDIT_USER=actor["id"], EDIT_TIME=_stamp(now))
        return
    if _mold_next(rows) != action:
        raise BusinessError("換模階段不符或多筆工單狀態不一致，請重新查詢。", "state_conflict")
    if not rows:
        raise BusinessError("排程尚無執行紀錄，不能執行換模。", "not_found")
    stage = MOLD_ACTIONS.index(action)
    stamp = _stamp(now)
    for row in rows:
        if stage and _time(row[MOLD_FIELDS[stage - 1]]) > now:
            raise BusinessError("本次時間早於上一階段，請核對伺服器時間。", "state_conflict")
        row[MOLD_FIELDS[stage]] = stamp
        row.update(EDIT_USER=actor["id"], EDIT_TIME=stamp)
        if stage == 0:
            row["CHECK_IN_TIME"] = stamp
        if stage == 3:
            row.update(CHECK_OUT_TIME=stamp, COMPLETED="Y", COMPLETED_TIME=stamp)


def _sync_simulated_schedule_trigger(before, state, sid, now):
    """重現已核對的 DETAIL 觸發器；正式 SQL 模式由資料庫本身執行。"""
    schedule = _row(state, SCHEDULE, sid)
    eqp = _row(state, "EQP_MASTER", schedule["EQP_SID"])
    mold = _pick(state["catalogs"]["molds"], "TOL_SID", schedule["TOL_SID"], "模具")
    old_hist = {r["ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID"]: r for r in before["tables"][EXECUTION].values() if r["ZZ_KAOSU_PROD_SCHEDULE_SID"] == sid}
    protected = {r["WIP_OPI_WDOEACICO_HIST_SID"] for r in before["tables"][OUTPUT].values()}
    for did, row in old_hist.items():
        if row["WIP_OPI_WDOEACICO_HIST_SID"] in protected:
            new = state["tables"][DETAIL].get(did)
            old = before["tables"][DETAIL].get(did)
            if new is None:
                raise BusinessError("將刪除的排程明細已有人工報工；請先採獨立核准的清理流程。", "linked_reports")
            if not old or any(old[field] != new[field] for field in ("WO_SID", "PART_NO", "TOL_DETALS_SID")):
                raise BusinessError("已有人工報工的明細不能直接換工單、品號或模具明細。", "linked_reports")
        if did not in state["tables"][DETAIL]:
            state["tables"][EXECUTION].pop(row["WIP_OPI_WDOEACICO_HIST_SID"], None)
            state["iot"].pop(row["WIP_OPI_WDOEACICO_HIST_SID"], None)
    for did, detail in state["tables"][DETAIL].items():
        if detail["ZZ_KAOSU_PROD_SCHEDULE_SID"] != sid:
            continue
        wo = next((w["WO"] for w in state["catalogs"]["work_orders"] if w["WO_SID"] == detail["WO_SID"]), None)
        mold_detail = _pick(mold["DETAILS"], "TOL_DETALS_SID", detail["TOL_DETALS_SID"], "模具明細")
        old = old_hist.get(did)
        if did in before["tables"][DETAIL] and not old:
            raise BusinessError("排程明細缺少執行歷程，請先修復資料關聯。", "state_conflict")
        eid = old["WIP_OPI_WDOEACICO_HIST_SID"] if old else did
        row = deepcopy(old) if old else {}
        row.update({"WIP_OPI_WDOEACICO_HIST_SID": eid, "ZZ_KAOSU_PROD_SCHEDULE_SID": sid, "ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID": did, "EQP_NO": eqp["EQP_NO"], "WO": wo, "SHIFT_DAY": schedule["SCHEDULE_DATE"], "TOL_SID": schedule["TOL_SID"], "SCHEDULE_CUR_CAV": detail["SCHEDULE_CUR_CAV"], "OPI_CAV": detail["SCHEDULE_CUR_CAV"], "ZZ_TOL_DETALS_NO": mold_detail["TOL_DETALS_NO"], "SCHEDULE_EDIT_USER": detail["EDIT_USER"], "SCHEDULE_EDIT_TIME": detail["EDIT_TIME"]})
        for n in (1, 2):
            for field in (f"SHIFT_CLASS_{n}", f"SHIFT_START_TIME_{n}", f"SHIFT_END_TIME_{n}"):
                row[field] = schedule[field]
        if not old:
            row.update({"DEPT_NO": schedule["OPERATION_CODE"], "OPERATION_CODE": schedule["OPERATION_CODE"], "COMPLETED": "N", "COMPLETED_USER": None, "COMPLETED_TIME": None, "CHECK_IN_TIME": None, "REAL_CHECK_IN_TIME": None, "CHECK_OUT_TIME": None, "ENABLE_FLAG": "Y", "CREATE_USER": "SQLtrigger_user", "EDIT_USER": "SQLtrigger_user", "CREATE_TIME": _stamp(now), "EDIT_TIME": _stamp(now)})
            row.update({field: None for field in MOLD_FIELDS})
            state["iot"][eid] = None
        state["tables"][EXECUTION][eid] = row


def _executions(state, schedule_id):
    _row(state, SCHEDULE, schedule_id)
    return [r for r in state["tables"][EXECUTION].values() if r["ZZ_KAOSU_PROD_SCHEDULE_SID"] == schedule_id]


def _complete(state, schedule_id, actor, now):
    rows = _executions(state, schedule_id)
    if not rows:
        raise BusinessError("排程沒有執行紀錄，不能宣稱已完工。")
    if all(r["COMPLETED"] == "Y" for r in rows):
        raise BusinessError("此排程已完工，不重複覆寫完工時間。", "state_conflict")
    stamp = _stamp(now)
    for row in rows:
        row.update(COMPLETED="Y", COMPLETED_USER=actor["id"], COMPLETED_TIME=stamp)
    candidates = sorted([r for r in state["tables"][EXECUTION].values() if r["COMPLETED"] == "N" and r["EQP_NO"] == rows[0]["EQP_NO"] and r["SHIFT_DAY"] == rows[0]["SHIFT_DAY"]], key=lambda r: (r.get("CHECK_IN_TIME") or "", r["WIP_OPI_WDOEACICO_HIST_SID"]))
    if candidates:
        next_sid = candidates[0]["ZZ_KAOSU_PROD_SCHEDULE_SID"]
        for row in _executions(state, next_sid):
            row["REAL_CHECK_IN_TIME"] = stamp


def _save_report(state, args, actor, now):
    previous = _row(state, OUTPUT, args["report_id"]) if args.get("report_id") else None
    if previous and previous["ENABLE_FLAG"] != "Y":
        raise BusinessError("報工紀錄已停用。")
    execution = _row(state, EXECUTION, previous["WIP_OPI_WDOEACICO_HIST_SID"] if previous else args["execution_id"])
    ok = _integer(args["ok"], "人工良品數")
    if not isinstance(args["defects"], list):
        raise BusinessError("不良原因須為清單。")
    defects, seen = [], set()
    for supplied in args["defects"]:
        if not isinstance(supplied, dict) or set(supplied) != {"code", "quantity"}:
            raise BusinessError("不良原因須提供原因代碼與數量。")
        code = supplied["code"]
        _pick(state["catalogs"]["defect_reasons"], "NG_CODE_NO", code, "不良原因")
        if code in seen:
            raise BusinessError("不良原因不可重複，請合併同原因數量。")
        seen.add(code)
        defects.append((code, _integer(supplied["quantity"], "不良數")))
    ng = _integer(sum(q for _, q in defects), "總不良數")
    oid = args.get("report_id") or _new_id(state)
    stamp = _stamp(now)
    state["tables"][OUTPUT][oid] = {"WIP_OPI_WDOEACICOOUTPUT_HIST_SID": oid, "WIP_OPI_WDOEACICO_HIST_SID": execution["WIP_OPI_WDOEACICO_HIST_SID"], "OK_QTY": ok, "NG_QTY": ng, "ENABLE_FLAG": "Y", "COMMENT": args.get("comment", previous.get("COMMENT", "") if previous else ""), "CREATE_USER": previous["CREATE_USER"] if previous else actor["id"], "CREATE_TIME": previous["CREATE_TIME"] if previous else stamp, "EDIT_USER": actor["id"], "EDIT_TIME": stamp}
    _delete_defects(state, oid)
    for code, quantity in defects:
        did = _new_id(state)
        state["tables"][DEFECT][did] = {"WDOEACICONG_NG_HIST_DETAIL_SID": did, "WIP_OPI_WDOEACICOOUTPUT_HIST_SID": oid, "NG_CODE": code, "NG_CODE_QTY": quantity, "CREATE_USER": actor["id"], "CREATE_TIME": stamp, "EDIT_USER": actor["id"], "EDIT_TIME": stamp}


def _delete_defects(state, report_id):
    for did in [key for key, row in state["tables"][DEFECT].items() if row["WIP_OPI_WDOEACICOOUTPUT_HIST_SID"] == report_id]:
        del state["tables"][DEFECT][did]


def _save_schedule(state, args, actor, now):
    eqp = _pick(state["tables"]["EQP_MASTER"].values(), "EQP_NO", args["equipment"], "設備")
    mold = _pick(state["catalogs"]["molds"], "TOL_NO", args["mold_no"], "模具")
    if args["part_no"] not in mold["PART_NOS"]:
        raise BusinessError("品號不屬於所選模具。")
    start = _time(args["start_time"])
    shots = _integer(args["target_shots"], "目標模次")
    cycle = _integer(args["cycle_seconds"], "週期秒數", 1)
    priority = _integer(args.get("priority", 3), "優先序")
    try:
        end = start + timedelta(seconds=shots * cycle)
        day = (start - timedelta(days=1) if start.hour < 8 else start).date().isoformat()
    except (OverflowError, ValueError):
        raise BusinessError("模次乘以週期超出有效日期範圍，請調整排程時間或數量。") from None
    if args["status"] not in {"TRY", "DO", "RUN"}:
        raise BusinessError("生產狀態只能為 TRY、DO、RUN。")
    shifts = list(state["tables"][SHIFT].values())
    specific = [r for r in shifts if r["FAB"].strip() == eqp["FAB"] and r["SHIFT_START_DAY"] == day]
    fallback = [r for r in shifts if not r["FAB"].strip() and r["SHIFT_START_DAY"] <= day <= r["SHIFT_END_DAY"]]
    candidates = specific or fallback
    if len(candidates) != 1:
        raise BusinessError("找不到唯一班別設定，請確認廠別與生產日期。")
    shift = candidates[0]
    sid = args.get("schedule_id") or _new_id(state)
    previous = _row(state, SCHEDULE, sid) if args.get("schedule_id") else None
    if not args["details"]:
        raise BusinessError("至少需要一筆排程明細。")
    details, has_wo, seen = [], False, set()
    for supplied in args["details"]:
        if not isinstance(supplied, dict) or set(supplied) - {"detail_id", "part_no", "wo", "cavities"}:
            raise BusinessError("排程明細含不合法欄位。")
        cav = _integer(supplied.get("cavities"), "模穴數")
        if shots * cav > 999999999999999999:
            raise BusinessError("目標模次乘以模穴數超過資料庫目標件數的18位整數上限。")
        part = _pick(state["catalogs"]["parts"], "PART_NO", supplied.get("part_no"), "品號")
        mold_detail = _pick(mold["DETAILS"], "PART_NO", part["PART_NO"], "模具明細")
        if part["PART_NO"] in seen:
            raise BusinessError("同一模具明細不可重複。")
        seen.add(part["PART_NO"])
        wo = _pick(state["catalogs"]["work_orders"], "WO", supplied["wo"], "工單") if supplied.get("wo") else None
        if (wo and wo["PART_NO"] != part["PART_NO"]) or (cav and not wo):
            raise BusinessError("工單須對應該品號，非零模穴必須選擇工單。")
        has_wo = has_wo or bool(wo)
        did = supplied.get("detail_id") or _new_id(state)
        old = _row(state, DETAIL, did) if supplied.get("detail_id") else None
        if old and old["ZZ_KAOSU_PROD_SCHEDULE_SID"] != sid:
            raise BusinessError("明細不屬於本排程。")
        details.append({"ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID": did, "ZZ_KAOSU_PROD_SCHEDULE_SID": sid, "TOL_DETALS_SID": mold_detail["TOL_DETALS_SID"], "SCHEDULE_CUR_CAV": cav, "PART_NO": part["PART_NO"], "PART_SPEC": part["PART_SPEC"], "WO_SID": wo["WO_SID"] if wo else "0", "WO_QUANTITY": wo["WO_QTY"] if wo else 0, "TARGET_PCS": shots * cav, "CREATE_USER": old.get("CREATE_USER") if old else actor["id"], "CREATE_TIME": old.get("CREATE_TIME") if old else _stamp(now), "EDIT_USER": actor["id"], "EDIT_TIME": _stamp(now)})
    if not has_wo:
        raise BusinessError("至少一筆明細須有有效工單，零模穴的合法工單亦可。")
    row = {"ZZ_KAOSU_PROD_SCHEDULE_SID": sid, "SCHEDULE_DATE": day, "SCHEDULE_START_TIME": _stamp(start), "SCHEDULE_END_TIME": _stamp(end), "OPERATION_CODE": "EPS-FORMING", "EQP_SID": eqp["EQP_SID"], "TOL_SID": mold["TOL_SID"], "SCHEDULE_CYCLE_TIME": cycle, "TARGET_SHOT": shots, "CHANGE_MOLD": "Y", "COMMENT": args.get("comment", ""), "PRODUCTION_STATUS": args["status"], "PRIORITY": priority, "SHIFT_TYPE": None, "ZZ_KAOSU_PROD_SHIFT_DAILY_REPORT_BASE_SID": shift["ZZ_KAOSU_PROD_SHIFT_DAILY_REPORT_BASE_SID"], "CREATE_USER": previous.get("CREATE_USER") if previous else actor["id"], "CREATE_TIME": previous.get("CREATE_TIME") if previous else _stamp(now), "EDIT_USER": actor["id"], "EDIT_TIME": _stamp(now)}
    for n in (1, 2):
        row[f"SHIFT_CLASS_{n}"] = shift[f"SHIFT_CLASS_{n}"]
        times = []
        for edge in ("START", "END"):
            value = shift.get(f"SHIFT_{edge}_TIME_{n}")
            parsed = _time(value) if value and "-" in value else (_time(day + " " + value) + timedelta(days=shift.get(f"SHIFT_{edge}_DATE_{n}", 0)) if value else None)
            row[f"SHIFT_{edge}_TIME_{n}"] = _stamp(parsed) if parsed else None
            times.append(parsed)
        if (times[0] is None) != (times[1] is None) or (times[0] and times[1] <= times[0]):
            raise BusinessError("班別起迄必須成對，結束須晚於開始。")
    state["tables"][SCHEDULE][sid] = row
    for did in [k for k, r in state["tables"][DETAIL].items() if r["ZZ_KAOSU_PROD_SCHEDULE_SID"] == sid]:
        del state["tables"][DETAIL][did]
    for detail in details:
        state["tables"][DETAIL][detail["ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID"]] = detail
    return sid
