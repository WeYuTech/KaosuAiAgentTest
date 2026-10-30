"""固定 MES 來源、可信登入、唯讀快照與預設鎖閉的交易適配器。

正式部署預設禁止寫入；隔離測試與環境開關不代表正式環境已獲准上線。
"""
from contextlib import contextmanager
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import hashlib
import hmac
from http.cookies import SimpleCookie
import json
import os
import re
import secrets
from urllib.parse import urlsplit
from uuid import UUID

import httpx

from app import domain
from app.store import changes, digest, dumps

MODULES = frozenset({"schedule", "report", "mold"})
PREFIX = "ZZ_AI_AGENT_OPERATION_"
EXECUTION = domain.EXECUTION
OUTPUT = domain.OUTPUT
DEFECT = domain.DEFECT
SCHEDULE = domain.SCHEDULE
DETAIL = domain.DETAIL
PK = {EXECUTION: "WIP_OPI_WDOEACICO_HIST_SID", OUTPUT: "WIP_OPI_WDOEACICOOUTPUT_HIST_SID",
      DEFECT: "WDOEACICONG_NG_HIST_DETAIL_SID", SCHEDULE: "ZZ_KAOSU_PROD_SCHEDULE_SID",
      DETAIL: "ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID", "EQP_MASTER": "EQP_SID"}
READ_COLUMNS = {
    EXECUTION: (PK[EXECUTION], "ZZ_KAOSU_PROD_SCHEDULE_SID", "ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID",
                "EQP_NO", "WO", "OPERATION_CODE", "SHIFT_DAY", "ENABLE_FLAG", "OPI_CAV",
                "CHECK_IN_TIME", "REAL_CHECK_IN_TIME", "CHECK_OUT_TIME", "COMPLETED", "COMPLETED_TIME",
                "COMPLETED_USER", "ZZ_MODLE_UPLOAD_START", "ZZ_MODLE_UPLOAD_END", "ZZ_MODLE_REMOVE_START",
                "ZZ_MODLE_REMOVE_END", "EDIT_USER", "EDIT_TIME"),
    OUTPUT: (PK[OUTPUT], PK[EXECUTION], "OK_QTY", "NG_QTY", "COMMENT", "ENABLE_FLAG", "CREATE_USER", "CREATE_TIME", "EDIT_USER", "EDIT_TIME"),
    DEFECT: (PK[DEFECT], PK[OUTPUT], "NG_CODE", "NG_CODE_QTY", "COMMENT", "ENABLE_FLAG", "CREATE_USER", "CREATE_TIME", "EDIT_USER", "EDIT_TIME"),
    SCHEDULE: (PK[SCHEDULE], "SCHEDULE_DATE", "SCHEDULE_START_TIME", "SCHEDULE_END_TIME", "OPERATION_CODE", "EQP_SID", "TOL_SID", "TOL_NO", "SCHEDULE_CYCLE_TIME", "TARGET_SHOT", "PRIORITY", "PRODUCTION_STATUS", "EDIT_USER", "EDIT_TIME"),
    DETAIL: (PK[DETAIL], PK[SCHEDULE], "TOL_DETALS_SID", "PART_NO", "PART_SPEC", "WO_SID", "WO", "SCHEDULE_CUR_CAV", "TARGET_PCS"),
    "EQP_MASTER": ("EQP_SID", "EQP_NO", "EQP_NAME", "EQP_TYPE", "FAB"),
}
# 可回寫欄位明確列舉，不能把查詢投影或模型給的欄名寫回。
WRITE_COLUMNS = {
    EXECUTION: frozenset({"OPI_CAV", "CHECK_IN_TIME", "REAL_CHECK_IN_TIME", "CHECK_OUT_TIME", "COMPLETED", "COMPLETED_TIME", "COMPLETED_USER", "ZZ_MODLE_UPLOAD_START", "ZZ_MODLE_UPLOAD_END", "ZZ_MODLE_REMOVE_START", "ZZ_MODLE_REMOVE_END", "EDIT_USER", "EDIT_TIME"}),
    OUTPUT: frozenset(READ_COLUMNS[OUTPUT]), DEFECT: frozenset(READ_COLUMNS[DEFECT]),
}


class MesError(Exception):
    def __init__(self, message, code="mes_unavailable"):
        super().__init__(message)
        self.message, self.code = message, code


@dataclass(frozen=True)
class MesConfig:
    base_url: str
    connection_string: str = field(repr=False)
    module_allowlist: dict
    session_cookie: str = "ASP.NET_SessionId"
    writes_enabled: bool = False
    timeout: float = 10.0
    max_rows: int = 1000
    server_utc_offset_hours: float = 8


class MesBridge:
    def __init__(self, config, *, transport=None, connect=None, clock=None):
        self.config = config
        parsed = urlsplit(config.base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise MesError("MES 固定服務網址設定不合法。", "configuration")
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", config.session_cookie):
            raise MesError("MES Cookie 名稱設定不合法。", "configuration")
        if not -14 <= config.server_utc_offset_hours <= 14:
            raise MesError("MES 伺服器 UTC 時差設定不合法。", "configuration")
        self._transport, self._connector = transport, connect
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._signing_key = secrets.token_bytes(32)

    @classmethod
    def from_env(cls):
        base, conn = os.getenv("MES_BASE_URL", ""), os.getenv("MES_CONNECTION_STRING", "")
        if not base or not conn:
            raise MesError("尚未設定 MES 固定網址與伺服器端資料庫連線。", "configuration")
        try:
            allow = json.loads(os.getenv("MES_MODULE_ALLOWLIST", "{}"))
            if not isinstance(allow, dict) or any(not isinstance(v, list) or set(v) - MODULES for v in allow.values()):
                raise ValueError()
            server_offset = float(os.getenv("MES_SERVER_UTC_OFFSET_HOURS", "8"))
        except (ValueError, TypeError):
            raise MesError("MES 模組授權清單格式錯誤。", "configuration") from None
        return cls(MesConfig(base.rstrip("/"), conn, allow,
                             os.getenv("MES_SESSION_COOKIE", "ASP.NET_SessionId"),
                             os.getenv("MES_ENABLE_WRITES") == "1" and os.getenv("MES_WRITE_CONTRACT") == "transaction-v1",
                             server_utc_offset_hours=server_offset))

    @contextmanager
    def _db(self, write=False):
        connection = None
        try:
            if self._connector:
                connection = self._connector(write)
            else:
                import pyodbc
                options = {} if write else {"attrs_before": {101: 1}}
                connection = pyodbc.connect(self.config.connection_string, autocommit=False, timeout=8, **options)
            connection.timeout = 30
            yield connection
        finally:
            if connection is not None:
                try:
                    connection.rollback()
                finally:
                    connection.close()

    def resolve_identity(self, cookie_header, module):
        """每次請求重新驗證；不接受瀏覽器聲稱的 uid、角色或 localStorage。"""
        if module not in MODULES:
            raise MesError("未知模組。", "forbidden")
        if not isinstance(cookie_header, str) or len(cookie_header) > 8192:
            raise MesError("缺少有效 MES 登入。", "unauthorized")
        name = self.config.session_cookie
        if len(re.findall(r"(?:^|;)\s*" + re.escape(name) + r"=", cookie_header)) != 1:
            raise MesError("MES 登入 Cookie 不明確。", "unauthorized")
        cookies = SimpleCookie()
        try:
            cookies.load(cookie_header)
            value = cookies[name].value
        except Exception:
            raise MesError("MES 登入 Cookie 無效。", "unauthorized") from None
        if not re.fullmatch(r"[A-Za-z0-9_-]{16,128}", value):
            raise MesError("MES 登入 Cookie 無效。", "unauthorized")
        try:
            with httpx.Client(transport=self._transport, timeout=self.config.timeout, follow_redirects=False, trust_env=False) as client:
                response = client.get(self.config.base_url.rstrip("/") + "/api/session/check", headers={"Cookie": f"{name}={value}"})
            if response.status_code != 200 or len(response.content) > 16384:
                raise ValueError()
            payload = response.json()
            token = payload.get("TokenKey")
            expiry = datetime.fromisoformat(payload["Expiration"])
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone(timedelta(hours=self.config.server_utc_offset_hours)))
            if expiry <= self._clock() or not isinstance(token, str) or not 16 <= len(token) <= 4096:
                raise ValueError()
            # 舊 SessionHelper 可能多加固定標記；只去掉有證據的前置標記。
            for _ in range(8):
                if token.startswith("WeyuTech"):
                    token = token[8:]
            with self._db() as db:
                cursor = db.cursor()
                cursor.execute("SELECT USER_SID,ACCOUNT_NO,USER_NAME FROM dbo.SEC_USER WHERE ENABLE_FLAG=? AND REFRESH_TOKEN COLLATE Latin1_General_100_BIN2=?", "Y", token)
                rows = cursor.fetchmany(2)
            if len(rows) != 1:
                raise ValueError()
            account = str(rows[0][1]).strip()
            modules = tuple(self.config.module_allowlist.get(account, []))
            if module not in modules:
                raise MesError("登入者未獲此模組的部署授權。", "forbidden")
            actor = {"id": account, "name": str(rows[0][2]), "user_sid": str(rows[0][0]),
                     "modules": list(modules), "roles": list(modules), "source": "mes_session",
                     "_expires": min(expiry.timestamp(), self._clock().timestamp() + 60)}
            actor["_proof"] = self._sign(actor)
            return actor
        except MesError:
            raise
        except Exception:
            raise MesError("MES 登入無法驗證；請重新登入或洽管理員。", "unauthorized") from None

    def _sign(self, actor):
        return hmac.new(self._signing_key, dumps({k: v for k, v in actor.items() if k != "_proof"}).encode(), hashlib.sha256).hexdigest()

    def _authorize(self, actor, module):
        if not isinstance(actor, dict) or not hmac.compare_digest(str(actor.get("_proof", "")), self._sign(actor)) or actor.get("_expires", 0) <= self._clock().timestamp():
            raise MesError("可信登入已過期，請重新驗證。", "unauthorized")
        if module not in MODULES or module not in actor.get("modules", []):
            raise MesError("沒有此模組權限。", "forbidden")

    @staticmethod
    def _normal(value, column):
        if value is None:
            return None
        if isinstance(value, (datetime, date)):
            return value.isoformat(sep=" ") if isinstance(value, datetime) else value.isoformat()
        if column.endswith("SID"):
            return str(value)
        if isinstance(value, Decimal):
            return int(value) if value == int(value) else float(value)
        return value

    def _select(self, cursor, table, where="1=1", parameters=(), lock=False):
        columns = READ_COLUMNS[table]
        hint = " WITH (UPDLOCK,HOLDLOCK)" if lock else ""
        sql = f"SELECT TOP ({self.config.max_rows + 1}) " + ",".join(f"[{c}]" for c in columns) + f" FROM dbo.[{table}]{hint} WHERE {where} ORDER BY [{PK[table]}]"
        cursor.execute(sql, *parameters)
        rows = cursor.fetchall()
        if len(rows) > self.config.max_rows:
            raise MesError("資料範圍過大，請縮小日期或設備範圍。", "scope_too_large")
        return {str(row[0]): {c: self._normal(v, c) for c, v in zip(columns, row)} for row in rows}

    def snapshot(self, identity, module, filters=None):
        self._authorize(identity, module)
        filters = filters or {}
        allowed = {"equipment", "eqp_no", "date", "schedule_date", "schedule_id", "execution_id", "page", "page_size",
                   "history", "factory", "fac", "mold", "tol_no", "completed", "wo", "sort", "part_no", "mold_no", "catalog", "search"}
        if set(filters) - allowed:
            raise MesError("正式查詢包含未允許的條件。", "validation")
        try:
            page, size = int(filters.get("page", 1)), int(filters.get("page_size", 20))
            if page < 1 or not 1 <= size <= 100:
                raise MesError("頁碼需大於零，每頁筆數須為 1 至 100。", "validation")
            with self._db() as db:
                cursor = db.cursor()
                rows = [] if filters.get("catalog") else self._display_rows(cursor, module, filters)
                self._sort_rows(rows, filters.get("sort"), module)
                total = len(rows)
                selected = rows[(page-1)*size:page*size]
                self._enrich_rows(cursor, module, selected)
                catalogs = self._catalogs(cursor, module, filters, selected)
                if module == "mold":
                    candidates = catalogs.get("schedules", [])
                    for row in selected:
                        row["CANDIDATES"] = [r for r in candidates if r.get("equipment") == row.get("EQP_NO")]
            return {"mode": "live_readonly", "module": module, "label": "正式 MES 唯讀資料（既有查詢與人工報工分列）", "records": selected,
                    "total": total, "page": page, "page_size": size, "version": digest({"records": selected,"catalogs":catalogs}), "catalogs": catalogs,
                    "live_write_verified": False, "query_source": "既有白名單 TVF／檢視；不接受任意 SQL"}
        except MesError:
            raise
        except domain.BusinessError:
            raise
        except Exception:
            raise MesError("正式 MES 查詢失敗，未執行寫入。") from None

    def model_snapshot_query(self, identity, module, filters=None):
        return self.snapshot(identity, module, filters)

    def _query_rows(self, cursor, source, parameters=(), where="1=1", conditions=(), limit=None):
        """source／where 只由下方固定程式片段構成，所有外部值皆為參數。"""
        maximum = limit or self.config.max_rows
        cursor.execute(f"SELECT TOP ({maximum + 1}) * FROM {source} WHERE {where}", *parameters, *conditions)
        names = [c[0] for c in cursor.description]
        rows = [{key: self._normal(value, key) for key, value in zip(names, row)} for row in cursor.fetchall()]
        if len(rows) > maximum and limit is None:
            raise MesError("資料範圍過大，請縮小日期或設備範圍。", "scope_too_large")
        return rows

    @staticmethod
    def _like(value):
        return "%" + str(value).replace("[", "[[]").replace("%", "[%]").replace("_", "[_]") + "%"

    def _display_rows(self, cursor, module, filters):
        history = str(filters.get("history") or "all").lower()
        if history not in {"all", "running", "history", "true", "pending", "completed"}:
            raise MesError("未知歷史篩選。", "validation")
        parameters = []
        if module == "schedule":
            source = "dbo.V_ZZ_KAOSU_PROD_SCHEDULE_OPI AS v"
            clauses, values = ["v.OPERATION_CODE=?"], ["EPS-FORMING"]
        elif module == "report":
            source = "dbo.GET_ZZ_WIP_OPI_WDOEACICO_HIST_SCHEDULE_NG_OPI(?) AS v"
            parameters, clauses, values = ["EPS-FORMING"], [], []
        else:
            if history == "running":
                inner = "SELECT *,CAST(N'N' AS nvarchar(10)) AS COMPLETED FROM dbo.GET_ZZ_WIP_OPI_WDOEACICO_HIST_SCHEDULE_MOLD_EQP(?,?)"
                parameters = ["EPS-FORMING", "EPS"]
            elif history in {"history", "true"}:
                inner = "SELECT * FROM dbo.GET_ZZ_WIP_OPI_WDOEACICO_HIST_SCHEDULE_CLEAR(?)"
                parameters = ["EPS-FORMING"]
            else:
                inner = "SELECT * FROM dbo.GET_ZZ_WIP_OPI_WDOEACICO_HIST_SCHEDULE(?,?) UNION ALL SELECT * FROM dbo.GET_ZZ_WIP_OPI_WDOEACICO_HIST_SCHEDULE(?,?)"
                parameters = ["EPS-FORMING", "N", "EPS-FORMING", "Y"]
            source = f"(SELECT b.*,s.SCHEDULE_DATE FROM ({inner}) b LEFT JOIN dbo.ZZ_KAOSU_PROD_SCHEDULE s ON b.ZZ_KAOSU_PROD_SCHEDULE_SID=s.ZZ_KAOSU_PROD_SCHEDULE_SID) AS v"
            clauses, values = [], []
        for key, column in (("equipment", "EQP_NO"), ("eqp_no", "EQP_NO"), ("schedule_id", PK[SCHEDULE]), ("execution_id", PK[EXECUTION])):
            if filters.get(key):
                if key == "execution_id" and module != "report":
                    raise MesError("只有報工查詢接受作業識別碼。", "validation")
                clauses.append(f"v.[{column}]=?"); values.append(str(filters[key]))
        day = filters.get("date") or filters.get("schedule_date")
        if day:
            pieces = str(day).split("~")
            if len(pieces)>2:
                raise MesError("日期區間只能有開始與結束兩日。", "validation")
            start, end = domain._date(pieces[0]), domain._date(pieces[-1])
            if start > end:
                raise MesError("日期區間結束不得早於開始。", "validation")
            clauses.append("v." + ("SHIFT_DAY" if module == "report" else "SCHEDULE_DATE") + " BETWEEN ? AND ?")
            values.extend([start,end])
        if filters.get("wo"):
            if module == "report":
                clauses.append("v.WO=?")
            else:
                clauses.append("EXISTS(SELECT 1 FROM dbo.V_ZZ_KAOSU_PROD_SCHEDULE_DETAIL d WHERE d.ZZ_KAOSU_PROD_SCHEDULE_SID=v.ZZ_KAOSU_PROD_SCHEDULE_SID AND d.WO=?)")
            values.append(str(filters["wo"]))
        if filters.get("part_no"):
            if module == "report":
                clauses.append("v.PART_NO=?")
            else:
                clauses.append("EXISTS(SELECT 1 FROM dbo.ZZ_KAOSU_PROD_SCHEDULE_DETAIL d WHERE d.ZZ_KAOSU_PROD_SCHEDULE_SID=v.ZZ_KAOSU_PROD_SCHEDULE_SID AND d.PART_NO=?)")
            values.append(str(filters["part_no"]))
        mold = filters.get("mold") or filters.get("tol_no") or filters.get("mold_no")
        if mold:
            clauses.append("v.TOL_NO LIKE ?"); values.append(self._like(mold))
        factory = filters.get("factory") or filters.get("fac")
        if factory:
            bounds = {"fac1":(1,20),"fac2":(21,46),"fac3":(47,60)}.get(str(factory).lower())
            if not bounds:
                raise MesError("廠別只能為 fac1、fac2、fac3。", "validation")
            clauses.append("TRY_CONVERT(int,REPLACE(v.EQP_NO,'MC','')) BETWEEN ? AND ?"); values.extend(bounds)
        completed = str(filters.get("completed") or ("Y" if history=="completed" else "")).upper()
        if completed and completed not in {"Y","N"}:
            raise MesError("完工篩選只能是 Y 或 N。", "validation")
        if module == "schedule":
            if completed:
                expression = "EXISTS(SELECT 1 FROM dbo.WIP_OPI_WDOEACICO_HIST h WHERE h.ZZ_KAOSU_PROD_SCHEDULE_SID=v.ZZ_KAOSU_PROD_SCHEDULE_SID) AND NOT EXISTS(SELECT 1 FROM dbo.WIP_OPI_WDOEACICO_HIST h WHERE h.ZZ_KAOSU_PROD_SCHEDULE_SID=v.ZZ_KAOSU_PROD_SCHEDULE_SID AND (h.COMPLETED IS NULL OR h.COMPLETED<>N'Y'))"
                clauses.append(f"({expression})" if completed=="Y" else f"NOT ({expression})")
        elif completed:
            clauses.append("v.COMPLETED=?"); values.append(completed)
        if module == "report" and history == "running":
            clauses.extend(["v.COMPLETED=N'N'", "v.CHECK_IN_TIME IS NOT NULL"])
        if history == "pending":
            if module == "mold":
                clauses.extend(["v.ZZ_MODLE_UPLOAD_START IS NULL", "v.COMPLETED=N'N'"])
            elif module == "report":
                clauses.extend(["v.CHECK_IN_TIME IS NULL", "v.COMPLETED=N'N'"])
        return self._query_rows(cursor,source,parameters," AND ".join(clauses) or "1=1",values)

    @staticmethod
    def _sort_rows(rows, requested, module):
        spec = str(requested or {"schedule":"PRIORITY", "mold":"EQP_CREATE_TIME", "report":"EQP_CREATE_TIME,CHECK_IN_TIME"}[module])
        for part in reversed(spec.split(",")):
            part=part.strip(); key=part.lstrip("-").split(":")[0]
            if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*",key):
                raise MesError("排序欄位格式不合法。", "validation")
            if rows and not any(key in row for row in rows):
                raise MesError("查詢來源沒有指定排序欄位。", "validation")
            def order(row):
                value=row.get(key)
                return (0,"") if value is None else ((1,value) if isinstance(value,(int,float)) else (2,str(value)))
            rows.sort(key=order,reverse=part.startswith("-") or part.lower().endswith(":desc"))

    def _enrich_rows(self,cursor,module,rows):
        if not rows:
            return
        sids=sorted({r.get(PK[SCHEDULE]) for r in rows if r.get(PK[SCHEDULE])})
        executions={}
        if sids:
            executions=self._select(cursor,EXECUTION,f"{PK[SCHEDULE]} IN ({','.join('?' for _ in sids)})",sids)
        if module=="report":
            eids=[r[PK[EXECUTION]] for r in rows]
            reports=self._select(cursor,OUTPUT,f"{PK[EXECUTION]} IN ({','.join('?' for _ in eids)}) AND ENABLE_FLAG=?",(*eids,"Y"))
            oids=list(reports)
            defects=self._select(cursor,DEFECT,f"{PK[OUTPUT]} IN ({','.join('?' for _ in oids)})",oids) if oids else {}
            for row in rows:
                hist=executions.get(row[PK[EXECUTION]],{})
                row["OPERATION_CODE"]="EPS-FORMING"
                for field in ("REAL_CHECK_IN_TIME","ZZ_MODLE_UPLOAD_START","ZZ_MODLE_UPLOAD_END","ZZ_MODLE_REMOVE_START","ZZ_MODLE_REMOVE_END"):
                    row[field]=hist.get(field)
                found=[deepcopy(r) for r in reports.values() if r[PK[EXECUTION]]==row[PK[EXECUTION]]]
                for report in found:
                    report["DEFECTS"]=[deepcopy(d) for d in defects.values() if d[PK[OUTPUT]]==report[PK[OUTPUT]]]
                row["REPORTS"]=found
                row["MANUAL_OK"]=sum(r.get("OK_QTY") or 0 for r in found)
                row["MANUAL_NG"]=sum(r.get("NG_QTY") or 0 for r in found)
                row["IOT_QUANTITY"]=row.get("IOT_PCS")
                row["IOT_INFERRED_OK"]=row.get("OK_QTY")
        elif module=="schedule":
            for row in rows:
                sid=row[PK[SCHEDULE]]
                row["DETAILS"]=self._query_rows(cursor,"dbo.GET_ZZ_KAOSU_PROD_SCHEDULE_DETAIL(?) AS d",(sid,))
                members=[h for h in executions.values() if h[PK[SCHEDULE]]==sid]
                row["EXECUTIONS"]=members
                row["COMPLETED"]="Y" if members and all(h["COMPLETED"]=="Y" for h in members) else "N"
        else:
            for row in rows:
                members=[h for h in executions.values() if h[PK[SCHEDULE]]==row.get(PK[SCHEDULE])]
                row["EXECUTIONS"]=members
                row["NEXT_ACTION"]=domain._mold_next(members)

    def _catalogs(self,cursor,module,filters,rows):
        result={"equipment":list(self._select(cursor,"EQP_MASTER","EQP_TYPE=?",("EPS",)).values()),"parts":[],"molds":[],"work_orders":[],"defect_reasons":[],"schedules":[],"truncated":[]}
        reasons=self._query_rows(cursor,"dbo.BAS_REASON AS r",where="r.REASON_TYPE=?",conditions=("NG_EPS",))
        result["defect_reasons"]=[{"NG_CODE_NO":r["REASON_CODE"],"NG_CODE_NAME":r["REASON_NAME"]} for r in reasons]
        if module=="schedule" or filters.get("catalog"):
            conditions,values=[],[]
            if filters.get("part_no"):
                conditions.append("p.PART_NO=?");values.append(str(filters["part_no"]))
            if filters.get("search"):
                conditions.append("(p.PART_NO LIKE ? OR p.PART_SPEC LIKE ?)");values.extend([self._like(filters["search"])]*2)
            parts=self._query_rows(cursor,"dbo.GET_ZZ_KAOSU_PLAN_PART(?) AS p",("EPS-FORMING",)," AND ".join(conditions) or "1=1",values,limit=200)
            result["parts"]=parts[:200]
            if len(parts)>200: result["truncated"].append("parts：請指定 part_no 或 search 縮小範圍")
            selected_parts={str(filters["part_no"])} if filters.get("part_no") else {d["PART_NO"] for row in rows for d in row.get("DETAILS",[])}
            molds={}
            for part in sorted(selected_parts):
                for mold in self._query_rows(cursor,"dbo.GET_ZZ_KAOSU_PLAN_TOL(?,?) AS m",(part,"EPS-FORMING")):
                    item=molds.setdefault(mold["TOL_SID"],{**mold,"PART_NOS":[]})
                    item["PART_NOS"].append(part)
            mold_filter=filters.get("mold_no") or filters.get("tol_no")
            if mold_filter:
                for mold in self._query_rows(cursor,"(SELECT TOL_SID,TOL_NO,TOL_NAME FROM dbo.TOL_MASTER) AS m",where="m.TOL_NO=?",conditions=(str(mold_filter),)):
                    molds.setdefault(mold["TOL_SID"],{**mold,"PART_NOS":[]})
            for sid,mold in molds.items():
                mold["DETAILS"]=self._query_rows(cursor,"dbo.GET_ZZ_KAOSU_PLAN_TOL_DETAILS(?) AS d",(sid,))
                mold["PART_NOS"]=sorted(set(mold["PART_NOS"])|{d["PART_NO"] for d in mold["DETAILS"]})
                selected_parts.update(mold["PART_NOS"])
            result["molds"]=list(molds.values())
            if selected_parts:
                parts=sorted(selected_parts)
                work_orders=self._query_rows(cursor,"dbo.V_ZZ_SCHEDULE_WO_TOL_SID_NEW AS w",where=f"w.PART_NO IN ({','.join('?' for _ in parts)})"+(" AND w.WO=?" if filters.get("wo") else ""),conditions=(*parts,*([str(filters["wo"])] if filters.get("wo") else [])),limit=200)
                result["work_orders"]=work_orders[:200]
                if len(work_orders)>200: result["truncated"].append("work_orders：請指定 wo 縮小範圍")
        if module=="mold":
            eqps=sorted({r["EQP_NO"] for r in rows if r.get("EQP_NO")})
            if not eqps and (filters.get("equipment") or filters.get("eqp_no")):
                eqps=[str(filters.get("equipment") or filters.get("eqp_no"))]
            for eqp in eqps:
                candidates=self._query_rows(cursor,"dbo.GET_ZZ_WIP_OPI_WDOEACICO_HIST_SCHEDULE(?,?) AS s",("EPS-FORMING","N"),"s.EQP_NO=? AND s.ZZ_MODLE_UPLOAD_START IS NULL",(eqp,))
                result["schedules"].extend({**r,"schedule_id":r[PK[SCHEDULE]],"equipment":r["EQP_NO"],"start_time":r["SCHEDULE_START_TIME"]} for r in candidates)
        else:
            result["schedules"]=[{"schedule_id":r.get(PK[SCHEDULE]),"equipment":r.get("EQP_NO"),"start_time":r.get("SCHEDULE_START_TIME")} for r in rows]
        return result

    def _load_state(self, cursor, action, args, lock=False):
        """完工候選涵蓋同機同班日，再擴展到每個候選排程的全部歷程。"""
        hint = " WITH (UPDLOCK,HOLDLOCK)" if lock else ""
        if args.get("report_id"):
            cursor.execute(f"SELECT h.ZZ_KAOSU_PROD_SCHEDULE_SID FROM dbo.{OUTPUT} o{hint} JOIN dbo.{EXECUTION} h{hint} ON h.{PK[EXECUTION]}=o.{PK[EXECUTION]} WHERE o.{PK[OUTPUT]}=?", str(args["report_id"]))
        elif args.get("execution_id"):
            cursor.execute(f"SELECT ZZ_KAOSU_PROD_SCHEDULE_SID FROM dbo.{EXECUTION}{hint} WHERE {PK[EXECUTION]}=?", str(args["execution_id"]))
        elif args.get("schedule_id"):
            cursor.execute(f"SELECT {PK[SCHEDULE]} FROM dbo.{SCHEDULE}{hint} WHERE {PK[SCHEDULE]}=?", str(args["schedule_id"]))
        else:
            raise MesError("缺少明確的排程或作業識別碼。", "validation")
        anchor = cursor.fetchmany(2)
        if len(anchor) != 1 or anchor[0][0] is None:
            raise MesError("目標不存在或無法唯一識別。", "not_found")
        sid = str(anchor[0][0])
        base = self._select(cursor, EXECUTION, "ZZ_KAOSU_PROD_SCHEDULE_SID=?", (sid,), lock)
        if not base:
            raise MesError("排程尚未有 MES 作業紀錄；生成機制未驗證，禁止臆造正式歷程。", "unverified_contract")
        if any(r["OPERATION_CODE"] != "EPS-FORMING" for r in base.values()):
            raise MesError("此適配器只允許 EPS 成型。", "forbidden")
        scopes = {(r["EQP_NO"], r["SHIFT_DAY"]) for r in base.values()}
        if len(scopes) != 1:
            raise MesError("同排程設備或班日不一致，禁止自動執行。", "ambiguous")
        eqp, day = next(iter(scopes))
        # 此 SELECT 同時保護候選集合，避免新候選插入後仍用舊確認卡。
        where = f"ZZ_KAOSU_PROD_SCHEDULE_SID IN (SELECT ZZ_KAOSU_PROD_SCHEDULE_SID FROM dbo.{EXECUTION}{hint} WHERE EQP_NO=? AND SHIFT_DAY=?) OR ZZ_KAOSU_PROD_SCHEDULE_SID=?"
        executions = self._select(cursor, EXECUTION, where, (eqp, day, sid), lock)
        if any(row["OPERATION_CODE"] != "EPS-FORMING" for row in executions.values()):
            raise MesError("同設備同班日候選含其他製程，禁止自動跨製程連動。", "ambiguous")
        schedule_ids = sorted({r[PK[SCHEDULE]] for r in executions.values() if r[PK[SCHEDULE]]})
        placeholders = ",".join("?" for _ in schedule_ids)
        tables = {EXECUTION: executions}
        for table in (SCHEDULE, DETAIL):
            tables[table] = self._select(cursor, table, f"{PK[SCHEDULE]} IN ({placeholders})", schedule_ids, lock)
        eids = list(executions)
        tables[OUTPUT] = self._select(cursor, OUTPUT, f"{PK[EXECUTION]} IN ({','.join('?' for _ in eids)})", eids, lock)
        oids = list(tables[OUTPUT])
        tables[DEFECT] = self._select(cursor, DEFECT, f"{PK[OUTPUT]} IN ({','.join('?' for _ in oids)})", oids, lock) if oids else {}
        tables["EQP_MASTER"] = self._select(cursor, "EQP_MASTER", "EQP_NO=?", (eqp,), lock)
        cursor.execute("SELECT REASON_CODE,REASON_NAME FROM dbo.BAS_REASON" + hint + " WHERE REASON_TYPE=? ORDER BY REASON_CODE", "NG_EPS")
        reasons = [{"NG_CODE_NO": str(r[0]), "NG_CODE_NAME": str(r[1])} for r in cursor.fetchall()]
        return {"mode": "live", "next_id": 9000000000000000, "tables": tables,
                "catalogs": {"defect_reasons": reasons, "parts": [], "molds": [], "work_orders": []}, "iot": {}}

    def _version(self, state, identity, module, action, args):
        return hmac.new(self._signing_key, dumps({"state": state, "actor": identity["id"], "module": module, "action": action, "args": args}).encode(), hashlib.sha256).hexdigest()

    def prepare(self, identity, module, action, args):
        self._authorize(identity, module)
        if module == "schedule" and action == "schedule.save":
            from app import mes_schedule
            return mes_schedule.prepare(self, identity, args)
        self._validate_command(module, action, args)
        try:
            with self._db() as db:
                cursor = db.cursor()
                cursor.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
                state = self._load_state(cursor, action, args)
                cursor.execute("SELECT dbo.GET_DATETIME_STRING()")
                now = datetime.fromisoformat(str(cursor.fetchone()[0]))
                after = domain.execute(state, module, action, args, identity, now)
                self._validate_changes(state, after)
                preview_changes = changes(state, after)
                temporary = {}
                for table in (OUTPUT, DEFECT):
                    for index,key in enumerate(sorted(set(after["tables"][table])-set(state["tables"][table]))):
                        temporary[key] = f"提交後取得識別碼（{table} 第 {index+1} 筆）"
                for change in preview_changes:
                    change["key"] = temporary.get(change["key"],change["key"])
                    if change["field"].endswith("SID"):
                        change["after"] = temporary.get(str(change["after"]),change["after"])
                eid = args.get("execution_id")
                if args.get("report_id"):
                    eid = state["tables"][OUTPUT][args["report_id"]][PK[EXECUTION]]
                sid = args.get("schedule_id") or (state["tables"][EXECUTION][eid][PK[SCHEDULE]] if eid else None)
                affected = [r for r in state["tables"][EXECUTION].values() if (r[PK[EXECUTION]]==eid if eid else r[PK[SCHEDULE]]==sid)]
                target = {"equipment": ", ".join(sorted({r["EQP_NO"] for r in affected})),
                          "work_order": ", ".join(sorted({r["WO"] for r in affected if r.get("WO")})),
                          "schedule_id": sid, "execution_id":eid, "report_id":args.get("report_id"),
                          "affected_orders": sorted({r["WO"] for r in affected if r.get("WO")})}
                return {"module": module, "action": action, "args": deepcopy(args), "version": self._version(state, identity, module, action, args),
                        "changes": preview_changes, "target": target, "live_write_verified": False, "writes_enabled": self.config.writes_enabled,
                        "time_policy": "異動時間以人員確認後執行時的 MES 伺服器時間為準；目前顯示為預覽時間",
                        "new_id_policy": "新增識別碼在提交時由 MES GetSid 配置，預覽不代表正式識別碼",
                        "label": "正式資料操作預覽；正式部署寫入預設鎖閉"}
        except (MesError, domain.BusinessError):
            raise
        except Exception:
            raise MesError("無法建立正式操作預覽，未執行寫入。") from None

    @staticmethod
    def _validate_command(module, action, args):
        if module == "schedule":
            raise MesError("排程舊 API 無可靠新增識別碼與一致性保證，正式排程寫入尚未啟用。", "unverified_contract")
        if not isinstance(args, dict) or action not in domain.actions() or action.split(".")[0] != module:
            raise MesError("未允許的正式操作。", "validation")
        if "comment" in args and (not isinstance(args["comment"], str) or len(args["comment"].encode("utf-16-le")) // 2 > 255):
            raise MesError("正式報工備註最多 255 個 UTF-16 字元單位。", "validation")

    @staticmethod
    def _validate_changes(before, after):
        for change in changes(before, after):
            if change["table"] not in WRITE_COLUMNS or change["field"] not in WRITE_COLUMNS[change["table"]]:
                raise MesError("領域變更包含未驗證的正式欄位，已阻擋。", "unverified_contract")
        if set(after["tables"][EXECUTION]) != set(before["tables"][EXECUTION]):
            raise MesError("禁止由 AI 建立或刪除正式作業歷程。", "unverified_contract")

    @staticmethod
    def _remap_ids(cursor, before, after):
        for table in (OUTPUT, DEFECT):
            for temporary in set(after["tables"][table]) - set(before["tables"][table]):
                cursor.execute("SELECT dbo.GetSid()")
                new_id = str(cursor.fetchone()[0])
                row = after["tables"][table].pop(temporary)
                row[PK[table]] = new_id
                for column in READ_COLUMNS[table]:
                    row.setdefault(column, None)
                if new_id in after["tables"][table]:
                    raise MesError("MES 識別碼重複，已取消交易。", "conflict")
                after["tables"][table][new_id] = row
                if table == OUTPUT:
                    for detail in after["tables"][DEFECT].values():
                        if detail[PK[OUTPUT]] == temporary:
                            detail[PK[OUTPUT]] = new_id

    @staticmethod
    def _apply_rows(cursor, before, after):
        # 子表先刪、主表先新增；所有值使用參數，表名欄名只取常數白名單。
        for table in (DEFECT, OUTPUT):
            for key in sorted(set(before["tables"][table]) - set(after["tables"][table])):
                cursor.execute(f"DELETE FROM dbo.[{table}] WHERE [{PK[table]}]=?", key)
                if cursor.rowcount != 1:
                    raise MesError("刪除影響筆數不符，已取消交易。", "conflict")
        for table in (EXECUTION, OUTPUT, DEFECT):
            old, new = before["tables"][table], after["tables"][table]
            for key, row in new.items():
                if key not in old:
                    columns = sorted(row)
                    if set(columns) - WRITE_COLUMNS[table]:
                        raise MesError("新增包含未允許欄位。", "unverified_contract")
                    cursor.execute(f"INSERT INTO dbo.[{table}] (" + ",".join(f"[{c}]" for c in columns) + ") VALUES (" + ",".join("?" for _ in columns) + ")", *(row[c] for c in columns))
                else:
                    columns = sorted(c for c in row if row[c] != old[key].get(c))
                    if not columns:
                        continue
                    cursor.execute(f"UPDATE dbo.[{table}] SET " + ",".join(f"[{c}]=?" for c in columns) + f" WHERE [{PK[table]}]=?", *(row[c] for c in columns), key)
                if cursor.rowcount != 1:
                    raise MesError("寫入影響筆數不符，已取消交易。", "conflict")

    def execute(self, identity, module, action, args, expected_version, operation_id):
        self._authorize(identity, module)
        if module == "schedule" and action == "schedule.save":
            from app import mes_schedule
            return mes_schedule.execute(self, identity, args, expected_version, operation_id)
        self._validate_command(module, action, args)
        if not self.config.writes_enabled:
            raise MesError("正式寫入預設鎖閉；須完成部署核對並由管理員明確啟用。", "live_write_locked")
        try:
            operation_id = str(UUID(operation_id))
        except (ValueError, TypeError, AttributeError):
            raise MesError("操作識別碼必須是 UUID。", "validation") from None
        fingerprint = digest({"actor": identity["id"], "module": module, "action": action, "args": args, "version": expected_version})
        commit_started = False
        try:
            with self._db(write=True) as db:
                cursor = db.cursor()
                cursor.execute("SET XACT_ABORT ON; SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
                cursor.execute(f"SELECT REQUEST_HASH,RESULT_JSON FROM dbo.{PREFIX}OPERATION WITH (UPDLOCK,HOLDLOCK) WHERE OPERATION_ID=?", operation_id)
                previous = cursor.fetchone()
                if previous:
                    if previous[0] != fingerprint:
                        raise MesError("操作識別碼已用於不同內容。", "conflict")
                    return {**json.loads(previous[1]), "replayed": True}
                state = self._load_state(cursor, action, args, lock=True)
                if not isinstance(expected_version, str) or not hmac.compare_digest(self._version(state, identity, module, action, args), expected_version):
                    raise MesError("確認內容或正式資料已變更，請重新產生確認卡。", "stale")
                cursor.execute("SELECT dbo.GET_DATETIME_STRING()")
                now = datetime.fromisoformat(str(cursor.fetchone()[0]))
                after = domain.execute(state, module, action, args, identity, now)
                self._validate_changes(state, after)
                self._remap_ids(cursor, state, after)
                actual = changes(state, after)
                if not actual:
                    raise MesError("沒有可執行的資料變更。", "validation")
                self._apply_rows(cursor, state, after)
                # 交易內讀回全部異動資料列，禁止把預期差異當成實際結果。
                for table in WRITE_COLUMNS:
                    keys = {c["key"] for c in actual if c["table"] == table}
                    for key in keys:
                        readback = self._select(cursor, table, f"[{PK[table]}]=?", (key,), True)
                        if readback.get(key) != after["tables"][table].get(key):
                            raise MesError("資料庫讀回與預期不符，已取消交易。", "verification_failed")
                result = {"operation_id": operation_id, "status": "executed", "changes": actual, "replayed": False}
                cursor.execute(f"INSERT INTO dbo.{PREFIX}OPERATION(OPERATION_ID,OCCURRED_AT,MODULE,ACTOR_ID,ACTION,REQUEST_HASH,RESULT,RESULT_JSON) VALUES (?,?,?,?,?,?,?,?)", operation_id, now, module, identity["id"], action, fingerprint, "executed", dumps(result))
                for index, change in enumerate(actual):
                    cursor.execute(f"INSERT INTO dbo.{PREFIX}CHANGE(OPERATION_ID,SEQ,TABLE_NAME,ROW_KEY,COLUMN_NAME,BEFORE_JSON,AFTER_JSON) VALUES (?,?,?,?,?,?,?)", operation_id, index, change["table"], change["key"], change["field"], dumps(change["before"]), dumps(change["after"]))
                commit_started = True
                db.commit()
                return result
        except (MesError, domain.BusinessError):
            raise
        except Exception:
            if commit_started:
                raise MesError("提交結果尚待核對；請保留操作識別碼，不得換新識別碼重送。", "outcome_unknown") from None
            raise MesError("正式操作失敗，交易已要求回復；未宣稱執行成功。", "transaction_failed") from None
