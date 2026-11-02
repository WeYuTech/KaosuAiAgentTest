"""所有模型與人員均經過相同的草稿及確認邊界。"""
import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from app.store import Store, changes, digest

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
MODULES = ("schedule", "report", "mold")
IDENTITIES = {
    "planner": {"id": "DEMO_PLANNER", "name": "排程員（模擬）", "roles": ["schedule"]},
    "operator": {"id": "DEMO_OPERATOR", "name": "報工員（模擬）", "roles": ["report"]},
    "technician": {"id": "DEMO_TECHNICIAN", "name": "換模員（模擬）", "roles": ["mold"]},
    "supervisor": {"id": "DEMO_SUPERVISOR", "name": "主管（模擬）", "roles": list(MODULES) + ["review"]},
}
ACTION_LABELS = {"schedule.save": "儲存排程", "report.add": "新增人工報工", "report.update": "修改人工報工",
                 "report.delete": "刪除人工報工", "report.cavities": "修改報工模穴", "report.complete": "整張排程完工",
                 "mold.mount_start": "開始上模並進站", "mold.mount_finish": "完成上模", "mold.unmount_start": "開始下模",
                 "mold.unmount_finish": "完成下模、出站及完工", "mold.clear": "清除換模紀錄"}


def proposal_target(state, args, after=None, action=None):
    from app.domain import EXECUTION, OUTPUT, SCHEDULE, schedule_confirmation_target, execution_confirmation_target, report_confirmation_target
    tables = state["tables"]
    execution_id = args.get("execution_id")
    report_id = args.get("report_id")
    if report_id:
        execution_id = tables.get(OUTPUT, {}).get(report_id, {}).get("WIP_OPI_WDOEACICO_HIST_SID")
    execution = tables.get(EXECUTION, {}).get(execution_id, {})
    schedule_id = args.get("schedule_id") or execution.get("ZZ_KAOSU_PROD_SCHEDULE_SID")
    schedule = tables.get(SCHEDULE, {}).get(schedule_id, {})
    equipment = args.get("equipment") or execution.get("EQP_NO") or tables.get("EQP_MASTER", {}).get(schedule.get("EQP_SID"), {}).get("EQP_NO")
    affected = sorted({r["WO"] for r in tables.get(EXECUTION, {}).values()
                       if (r.get("WIP_OPI_WDOEACICO_HIST_SID") == execution_id if execution_id else r.get("ZZ_KAOSU_PROD_SCHEDULE_SID") == schedule_id) and r.get("WO")})
    target = {"equipment": equipment, "work_order": execution.get("WO"), "schedule_id": schedule_id,
              "execution_id": execution_id, "report_id": report_id, "affected_orders": affected or [d.get("wo") for d in args.get("details", []) if d.get("wo")]}
    if execution:
        target.update(execution_confirmation_target(state, execution))
    if report_id:
        target.update(report_confirmation_target(state, report_id))
    if after is not None and "details" in args:
        target.update(schedule_confirmation_target(state, after, args))
    if action == "report.complete" and after is not None:
        from app.domain import completion_confirmation_target
        target.update(completion_confirmation_target(after, schedule_id))
    return target


def now():
    return datetime.now(timezone.utc)


def business_clock():
    offset = int(os.getenv("MES_SERVER_UTC_OFFSET_HOURS", "7"))
    if not -12 <= offset <= 14:
        raise RuntimeError("MES 伺服器時區設定不合法")
    moment = datetime.now(timezone(timedelta(hours=offset)))
    return {"business_timezone": "UTC" + moment.strftime("%z")[:3] + ":" + moment.strftime("%z")[3:],
            "business_date": moment.date().isoformat(), "server_time": moment.isoformat()}


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Login(Input):
    identity: Literal["planner", "operator", "technician", "supervisor"]


class Proposal(Input):
    module: Literal["schedule", "report", "mold"]
    action: str = Field(max_length=60)
    args: dict[str, Any]
    conversation_id: str | None = None
    version: int | None = Field(default=None, ge=0, strict=True)


class ChatProposal(Input):
    action: str = Field(max_length=60)
    args: dict[str, Any]
    version: int | None = Field(default=None, ge=0, strict=True)


class Confirmation(Input):
    digest: str
    approved: bool


class Conversation(Input):
    module: Literal["schedule", "report", "mold"]
    context: dict[str, Any] = Field(default_factory=dict)
    locale: Literal["zh-TW", "en", "th"] = "zh-TW"
    entry_id: str | None = Field(default=None, min_length=8, max_length=100)


class GuideUpdate(Input):
    version: int = Field(ge=0, strict=True)
    action: str | None = Field(default=None, max_length=60)
    intent: Literal["create", "update"] | None = None
    args: dict[str, Any] | None = None
    step: Literal["action", "target", "details", "review", "result"] | None = None


class LocaleUpdate(Input):
    locale: Literal["zh-TW", "en", "th"]


class ConversationMetadata(Input):
    version: int = Field(ge=0, strict=True)
    title: str | None = Field(default=None, min_length=1, max_length=100)
    is_pinned: bool | None = None
    is_archived: bool | None = None
    is_deleted: bool | None = None


class Message(Input):
    text: str = Field(min_length=1, max_length=8000)
    scope: Literal["operation", "selection"] = "operation"


class QueryInput(Input):
    version: int = Field(ge=0, strict=True)
    filters: dict[str, Any]


class Feedback(Input):
    module: Literal["schedule", "report", "mold"]
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: str | None = None


class Review(Input):
    text: str = Field(min_length=1, max_length=4000)
    source: str = Field(min_length=1, max_length=500)


def create_app(db_path=None, model=None, intent_classifier=None):
    app = FastAPI(title="MES 對話操作助理", version="0.1.0")
    store = Store(db_path or ROOT / ".local" / "operations.db")
    mode = os.getenv("MES_MODE", "simulation")
    app.state.store = store
    bridge = None

    def mes_bridge():
        nonlocal bridge
        from app.mes import MesBridge
        if bridge is None:
            bridge = MesBridge.from_env()
        return bridge

    from app.mes import MesError

    def error_body(request, detail, status):
        from app.presentation import error_payload
        locale = request.headers.get("x-ai-locale")
        if locale not in {"zh-TW", "en", "th"}:
            cid = request.path_params.get("cid")
            with store.transaction() as db:
                convo = store.get(db, "CONVERSATION", cid) if cid else None
            locale = (convo or {}).get("locale", "zh-TW")
        return error_payload(detail, status, locale)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, exc):
        detail = [{"loc": list(item["loc"]), "type": item["type"], "msg": item["msg"]} for item in exc.errors()]
        result = error_body(request, {"code": "validation", "message": "請求欄位格式不符。", "params": {"fields": [item["loc"] for item in detail]}}, 422)
        result["detail"] = detail
        return JSONResponse(result, status_code=422)

    @app.exception_handler(MesError)
    async def mes_error(request, exc):
        status = {"unauthorized": 401, "forbidden": 403, "validation": 422, "not_found": 404,
                  "stale": 409, "conflict": 409, "linked_reports": 409, "scope_too_large": 422}.get(exc.code, 503)
        return JSONResponse(error_body(request, {"code": exc.code, "message": str(exc)}, status), status_code=status)

    @app.exception_handler(HTTPException)
    async def rejected(request, exc):
        if "/proposals" in request.url.path and request.method == "POST":
            try:
                actor = actor_for(request)
                key = str(uuid4())
                with store.transaction() as db:
                    store.put(db, "LOG", key, {"id": key, "time": now().isoformat(), "actor": actor["id"],
                                             "module": "confirmation", "action": "rejected", "status": "rejected",
                                             "mode": mode, "changes": [], "http_status": exc.status_code})
            except (HTTPException, MesError):
                pass
        return JSONResponse(error_body(request, exc.detail, exc.status_code), status_code=exc.status_code, headers=exc.headers)

    @app.middleware("http")
    async def guard_origin(request: Request, call_next):
        origin = request.headers.get("origin")
        if request.method not in ("GET", "HEAD", "OPTIONS") and origin:
            allowed = {f"{request.url.scheme}://{request.url.netloc}"} | set(filter(None, os.getenv("AI_ALLOWED_ORIGINS", "").split(",")))
            if origin not in allowed:
                return JSONResponse({"detail": "來源不在允許清單"}, status_code=403)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    def actor_for(request):
        if mode != "simulation":
            last = None
            for module in MODULES:
                try:
                    return mes_bridge().resolve_identity(request.headers.get("cookie", ""), module)
                except MesError as exc:
                    last = exc
                    if exc.code != "forbidden":
                        raise
            raise last
        sid = request.cookies.get("kaosu_agent_session", "")
        with store.transaction() as db:
            session = store.get(db, "SESSION", sid)
        if not session or session["expires_at"] < now().isoformat():
            raise HTTPException(401, "請先登入並核對操作身分")
        return session["actor"]

    from app.management import install as install_management
    install_management(app, actor_for)

    def allowed(actor, module):
        if module not in actor["roles"]:
            raise HTTPException(403, "目前身分沒有此模組的操作權限")

    def state_for(db):
        from app.domain import seed_state
        state = store.get(db, "STATE", "simulation")
        if state is None:
            state = seed_state()
            store.put(db, "STATE", "simulation", state)
        return state

    def call_domain(fn, *args):
        from app.domain import BusinessError
        try:
            return fn(*args)
        except BusinessError as exc:
            raise HTTPException(422, {"code": getattr(exc, "code", "validation"), "message": str(exc), "params": getattr(exc, "params", {})}) from exc

    def scheduled_query(job, filters):
        if mode != "simulation":
            return mes_bridge().scheduled_snapshot(job["actor_id"], job["actor_user_sid"], job["module"], filters)
        actor = next((a for a in IDENTITIES.values() if a["id"] == job["actor_id"]), None)
        if not actor or job["module"] not in actor["roles"]:
            raise HTTPException(403, "報告模組授權已撤銷。")
        from app.domain import query
        with store.transaction() as db:
            return call_domain(query, state_for(db), job["module"], filters)

    from app.reports import install as install_reports
    install_reports(app, store, actor_for, scheduled_query)

    def check_conversation_edit(db, convo, intent_token=None, version=None, allow_unknown=False):
        from app.guide import initial, reject
        if convo.get("is_archived") or convo.get("is_deleted"):
            reject("conversation_readonly", "請先還原聊天室，再繼續操作。")
        processing = convo.get("processing") or {}
        if intent_token:
            if processing.get("token") != intent_token or processing.get("expires_at", "") < now().isoformat():
                reject("guide_stale", "這輪對話已失效，請重新核對需求。")
        elif processing.get("expires_at", "") > now().isoformat():
            reject("conversation_busy", "上一則訊息仍在處理，請稍後修改。")
        if not allow_unknown and any(p.get("conversation_id") == convo["id"] and p["status"] == "unknown" for p in store.all(db, "PROPOSAL")):
            reject("outcome_unknown", "操作結果待核對，不得修改或重送。")
        if version is not None and version != convo.get("guide", initial())["version"]:
            reject("guide_stale", "草稿版本已變更，請重新讀取。", current_version=convo.get("guide", initial())["version"])

    def guide_view(db, convo):
        from app.guide import initial
        guide = dict(convo.get("guide") or initial())
        pid = guide.pop("proposal_id", None)
        if pid:
            guide["proposal"] = store.get(db, "PROPOSAL", pid)
            if guide["proposal"] and guide["proposal"]["status"] in {"succeeded", "unknown", "cancelled"}:
                guide["step"] = "result"
        return guide

    def save_guide(cid, actor, patch, version=None, intent_token=None):
        from app.guide import merge
        with store.transaction() as db:
            convo = store.get(db, "CONVERSATION", cid)
            if not convo or convo["actor_id"] != actor["id"]:
                raise HTTPException(404, "找不到此對話")
            allowed(actor, convo["module"])
            check_conversation_edit(db, convo, intent_token, version)
            convo["guide"] = merge(convo.get("guide"), convo["module"], patch)
            convo["updated_at"] = now().isoformat()
            convo["revision"] = convo.get("revision", 0) + 1
            for old in store.all(db, "PROPOSAL"):
                if old.get("conversation_id") == cid and old["status"] == "pending":
                    old["status"] = "superseded"
                    store.put(db, "PROPOSAL", old["id"], old)
            store.put(db, "CONVERSATION", cid, convo)
            return guide_view(db, convo)

    def make_proposal(body, actor, intent_token=None):
        from app.domain import execute
        allowed(actor, body.module)
        if not body.action.startswith(body.module + "."):
            raise HTTPException(422, "動作不屬於目前模組")
        instant = now()
        with store.transaction() as db:
            if body.conversation_id:
                convo = store.get(db, "CONVERSATION", body.conversation_id)
                if not convo or convo["actor_id"] != actor["id"]:
                    raise HTTPException(404, "找不到此對話")
                if convo["module"] != body.module:
                    raise HTTPException(422, "草稿模組與對話不符")
                check_conversation_edit(db, convo, intent_token, body.version)
                guide = convo.get("guide") or {}
                from app.guide import reject
                if body.version is not None:
                    if not guide.get("ready"):
                        reject("guide_invalid", "請先補齊引導草稿。", rule="missing", fields=guide.get("missing", ["action"]))
                    if guide.get("action") != body.action or guide.get("args") != body.args:
                        reject("guide_stale", "送出的內容與目前草稿不符，請先更新草稿。")
                if body.action == "schedule.save" and guide.get("action") == body.action:
                    if guide.get("intent") == "update" and not body.args.get("schedule_id"):
                        reject("guide_invalid", "修改排程必須先選擇既有排程。", rule="missing", fields=["schedule_id"])
                    if guide.get("intent") == "create" and body.args.get("schedule_id"):
                        reject("guide_invalid", "新增排程不可帶入既有排程識別。", field="schedule_id", rule="create_target")
                processing = convo.get("processing") or {}
                if intent_token:
                    if processing.get("token") != intent_token or processing.get("expires_at", "") < instant.isoformat():
                        raise HTTPException(409, "這輪對話已失效，請重新核對需求")
                elif processing.get("expires_at", "") > instant.isoformat():
                    raise HTTPException(409, "上一則訊息仍在處理，請稍後再修改草稿")
            if mode == "simulation":
                state = state_for(db)
                after = call_domain(execute, state, body.module, body.action, body.args, actor, instant)
                diff = changes(state, after)
                version = digest(state)
                target = proposal_target(state, body.args, after, body.action)
                enabled = True
                policies = {}
            else:
                preview = call_domain(mes_bridge().prepare, actor, body.module, body.action, body.args)
                diff, version = preview["changes"], preview["version"]
                target = preview.get("target", {})
                enabled = preview["writes_enabled"]
                policies = {key: preview[key] for key in ("time_policy", "new_id_policy") if key in preview}
            if not diff:
                raise HTTPException(422, "沒有需要寫入的變更")
            revision = None
            if body.conversation_id:
                if not intent_token:
                    convo["revision"] = convo.get("revision", 0) + 1
                    convo.pop("processing", None)
                    store.put(db, "CONVERSATION", body.conversation_id, convo)
                revision = convo.get("revision", 0)
            proposal = {"id": str(uuid4()), "actor_id": actor["id"], "module": body.module,
                        "action": body.action, "args": body.args, "summary": ACTION_LABELS[body.action], "target": target, "writes_enabled": enabled, **policies,
                        "business_timezone": business_clock()["business_timezone"],
                        "changes": diff, "created_at": instant.isoformat(), "event_time": instant.isoformat(),
                        "expires_at": (instant + timedelta(minutes=10)).isoformat(),
                        "state_digest": version, "status": "pending", "mode": mode, "conversation_id": body.conversation_id, "intent_revision": revision,
                        "independent_confirmation": body.action in ("report.delete", "report.complete", "mold.clear", "mold.unmount_finish")}
            proposal["digest"] = digest(proposal)
            if body.conversation_id:
                for old in store.all(db, "PROPOSAL"):
                    if old.get("conversation_id") == body.conversation_id and old["status"] == "pending":
                        old["status"] = "superseded"
                        store.put(db, "PROPOSAL", old["id"], old)
            store.put(db, "PROPOSAL", proposal["id"], proposal)
            if body.conversation_id:
                from app.guide import merge
                intent = ("update" if body.args.get("schedule_id") else "create") if body.action == "schedule.save" else None
                convo["guide"] = merge(convo.get("guide"), body.module, {"action": body.action, "intent": intent, "args": body.args, "step": "review"})
                convo["guide"]["args"] = body.args
                convo["guide"]["proposal_id"] = proposal["id"]
                store.put(db, "CONVERSATION", body.conversation_id, convo)
        return {"proposal": proposal}

    @app.get("/api/health")
    def health():
        return {"status": "ok", "mode": mode, "model_configured": bool(os.getenv("OPENAI_API_KEY")), "model": os.getenv("OPENAI_MODEL", "gpt-6.1-sol"), **business_clock()}

    @app.post("/api/session/demo")
    def demo(body: Login, response: Response):
        if mode != "simulation":
            raise HTTPException(403, "正式模式不提供模擬身分")
        actor = IDENTITIES[body.identity]
        session_id = secrets.token_urlsafe(32)
        with store.transaction() as db:
            store.put(db, "SESSION", session_id, {"actor": actor, "expires_at": (now() + timedelta(hours=8)).isoformat()})
        response.set_cookie("kaosu_agent_session", session_id, httponly=True, samesite="strict", secure=os.getenv("AI_SECURE_COOKIE") == "1", max_age=28800)
        return {"actor": actor, "mode": mode}

    @app.get("/api/session")
    def session(request: Request):
        return {"actor": {k: v for k, v in actor_for(request).items() if not k.startswith("_")}, "mode": mode}

    @app.delete("/api/session")
    def logout(request: Request, response: Response):
        if mode != "simulation":
            raise HTTPException(405, "請使用 MES 原有登出功能")
        with store.transaction() as db:
            sid = request.cookies.get("kaosu_agent_session", "")
            store.put(db, "SESSION", sid, {"expires_at": "", "actor": {}})
        response.delete_cookie("kaosu_agent_session")
        return {"status": "signed_out"}

    @app.get("/api/capabilities")
    def capabilities(request: Request):
        from app.domain import actions
        actor = actor_for(request)
        return {"actions": {k: v for k, v in actions().items() if k.split(".")[0] in actor["roles"]}}

    @app.get("/api/workspace")
    def workspace(request: Request, module: Literal["schedule", "report", "mold"]):
        from app.domain import query
        actor = actor_for(request)
        allowed(actor, module)
        if mode != "simulation":
            return mes_bridge().snapshot(actor, module, {k:v for k,v in request.query_params.items() if k != "module"})
        with store.transaction() as db:
            return call_domain(query, state_for(db), module, dict(request.query_params))

    def query_conversation(cid, actor, filters=None, version=None, intent_token=None):
        from app.query_context import validate, view
        from app.domain import query
        get_conversation(cid, actor)
        with store.transaction() as db:
            current = store.get(db, "CONVERSATION", cid)
            context = view(current)
            if filters is not None:
                check_conversation_edit(db, current, intent_token, allow_unknown=True)
                if version is not None and version != context["version"]:
                    raise HTTPException(409, "查詢條件已更新，請讀取目前條件後再查詢")
            criteria = validate(context["filters"] if filters is None else filters)
            state = state_for(db) if mode == "simulation" else None
        result = mes_bridge().snapshot(actor, current["module"], criteria) if mode != "simulation" else call_domain(query, state, current["module"], criteria)
        if filters is not None and not criteria.get("catalog"):
            with store.transaction() as db:
                latest = store.get(db, "CONVERSATION", cid)
                check_conversation_edit(db, latest, intent_token, allow_unknown=True)
                if view(latest)["version"] != context["version"]:
                    raise HTTPException(409, "查詢條件已更新，請讀取目前條件後再查詢")
                criteria.update(page=result.get("page", 1), page_size=result.get("page_size", 20))
                context = {"version": context["version"] + 1, "filters": criteria}
                latest["query_context"] = context
                store.put(db, "CONVERSATION", cid, latest)
        return {**result, "query_context": context}

    @app.get("/api/conversations/{cid}/query")
    def read_query(cid: str, request: Request):
        return query_conversation(cid, actor_for(request))

    @app.post("/api/conversations/{cid}/query")
    def update_query(cid: str, body: QueryInput, request: Request):
        return query_conversation(cid, actor_for(request), body.filters, body.version)

    @app.get("/api/candidates")
    def candidates(request: Request, kind: str, search: str = '', part_no: str = '', page: int = 1, page_size: int = 20):
        from app import candidates as source
        actor = actor_for(request)
        allowed(actor, 'schedule')
        source.validate(kind, search, part_no, page, page_size)
        if mode != 'simulation':
            try:
                return source.live(mes_bridge(), actor, kind, search, part_no, page, page_size)
            except MesError:
                raise
            except Exception:
                raise MesError('候選資料查詢失敗，請縮小條件後再試；未執行寫入。') from None
        with store.transaction() as db:
            return source.simulation(state_for(db), kind, search, part_no, page, page_size)

    @app.post("/api/proposals")
    def proposals(body: Proposal, request: Request):
        return make_proposal(body, actor_for(request))

    @app.get("/api/proposals/{pid}")
    def read_proposal(pid: str, request: Request):
        actor = actor_for(request)
        with store.transaction() as db:
            proposal = store.get(db, "PROPOSAL", pid)
        if not proposal or proposal["actor_id"] != actor["id"]:
            raise HTTPException(404, "找不到此身分的確認卡")
        allowed(actor, proposal["module"])
        return {"proposal": proposal}

    @app.post("/api/proposals/{pid}/confirm")
    def confirm(pid: str, body: Confirmation, request: Request):
        from app.domain import execute
        actor = actor_for(request)
        with store.transaction() as db:
            proposal = store.get(db, "PROPOSAL", pid)
            if not proposal or proposal["actor_id"] != actor["id"]:
                raise HTTPException(404, "找不到此身分的確認卡")
            allowed(actor, proposal["module"])
            if not secrets.compare_digest(body.digest, proposal["digest"]):
                raise HTTPException(409, "確認卡內容不符")
            if proposal["status"] != "pending":
                return {"status": proposal["status"], "message": "此確認卡已處理，未重複執行", "proposal": proposal}
            status = "cancelled" if not body.approved else "succeeded"
            actual = []
            if body.approved:
                if proposal.get("conversation_id"):
                    convo = store.get(db, "CONVERSATION", proposal["conversation_id"])
                    if convo and (convo.get("processing") or {}).get("expires_at", "") > now().isoformat():
                        raise HTTPException(409, "訊息仍在處理，請完成說明或修改後再確認")
                    if not convo or convo.get("revision") != proposal.get("intent_revision"):
                        raise HTTPException(409, "對話需求已變更，請重新建立確認卡")
                if proposal["expires_at"] < now().isoformat():
                    raise HTTPException(409, "確認卡已過期，請重新產生")
                if proposal["mode"] != mode:
                    raise HTTPException(409, "確認卡與目前執行環境不符")
                if mode == "simulation":
                    state = state_for(db)
                    if digest(state) != proposal["state_digest"]:
                        raise HTTPException(409, "資料已變更，請重新查詢並確認")
                    after = call_domain(execute, state, proposal["module"], proposal["action"], proposal["args"], actor, datetime.fromisoformat(proposal["event_time"]))
                    actual = changes(state, after)
                    if actual != proposal["changes"]:
                        raise HTTPException(409, "重新驗證的變更與確認卡不同")
                    store.put(db, "STATE", "simulation", after)
                else:
                    try:
                        result = call_domain(mes_bridge().execute, actor, proposal["module"], proposal["action"], proposal["args"], proposal["state_digest"], pid)
                        actual = result["changes"]
                    except MesError as exc:
                        if exc.code != "outcome_unknown":
                            raise
                        status = "unknown"
            proposal["status"] = status
            proposal["confirmed_at"] = now().isoformat()
            store.put(db, "PROPOSAL", pid, proposal)
            log = {"id": pid, "time": now().isoformat(), "event_time": proposal["event_time"], "actor": actor["id"],
                   "module": proposal["module"], "action": proposal["action"], "status": status, "mode": mode, "changes": actual}
            store.put(db, "LOG", pid, log)
        message = "結果尚待核對，請保留操作識別碼，不得重新送出相同操作" if status == "unknown" else "已完成並記錄異動" if body.approved else "已取消，未寫入業務資料"
        return {"status": status, "message": message, "proposal": proposal, "changes": actual}

    @app.post("/api/proposals/{pid}/reconcile")
    def reconcile(pid: str, request: Request):
        actor = actor_for(request)
        with store.transaction() as db:
            proposal = store.get(db, "PROPOSAL", pid)
            if not proposal or proposal["actor_id"] != actor["id"]:
                raise HTTPException(404, "找不到此身分的確認卡")
            allowed(actor, proposal["module"])
            log = store.get(db, "LOG", pid)
            if proposal["status"] in ("pending", "unknown") and mode != "simulation":
                if proposal["mode"] != mode:
                    raise HTTPException(409, "確認卡與目前執行環境不符")
                result = mes_bridge().operation_result(actor, proposal["module"], proposal["action"], proposal["args"], proposal["state_digest"], pid)
                previous = proposal["status"]
                proposal.update(status="succeeded" if result else "unknown", reconciled_at=now().isoformat())
                if result:
                    proposal["executed_at"] = result.get("executed_at")
                log = log or {"id": pid, "time": now().isoformat(), "event_time": proposal["event_time"], "actor": actor["id"],
                              "module": proposal["module"], "action": proposal["action"], "mode": mode}
                log.update(status=proposal["status"], previous_status=previous, reconciled_at=proposal["reconciled_at"],
                           changes=result["changes"] if result else [])
                if result:
                    log["executed_at"] = result.get("executed_at")
                store.put(db, "PROPOSAL", pid, proposal)
                store.put(db, "LOG", pid, log)
        status = proposal["status"]
        message = "已從既有提交紀錄查核成功，沒有重送業務操作" if status == "succeeded" else "尚無完整提交證據，請保留操作識別碼交由管理員核對；未重送業務操作" if status == "unknown" else "已查回確認卡目前狀態，未執行業務寫入"
        return {"status": status, "proposal": proposal, "message": message, "changes": (log or {}).get("changes", [])}

    @app.get("/api/audit")
    def audit(request: Request):
        actor = actor_for(request)
        with store.transaction() as db:
            records = store.all(db, "LOG")
        return {"records": [r for r in records if r["actor"] == actor["id"] or ("review" in actor["roles"] and r.get("module") in actor["roles"])][:200]}

    @app.get("/api/budget")
    def budget(request: Request):
        from app.model import budget_summary
        actor_for(request)
        return budget_summary()

    @app.get("/api/knowledge")
    def knowledge(request: Request, module: Literal["schedule", "report", "mold"]):
        from app.knowledge import retrieve
        allowed(actor_for(request), module)
        return {"records": retrieve(store, module, "", limit=100)}

    @app.post("/api/feedback")
    def feedback(body: Feedback, request: Request):
        actor = actor_for(request)
        allowed(actor, body.module)
        if body.conversation_id:
            get_conversation(body.conversation_id, actor)
        entry = {"id": secrets.token_urlsafe(18), "module": body.module, "message": body.message,
                 "conversation_id": body.conversation_id, "actor_id": actor["id"], "status": "pending", "time": now().isoformat()}
        with store.transaction() as db:
            store.put(db, "FEEDBACK", entry["id"], entry)
        return entry

    @app.get("/api/feedback")
    def feedback_list(request: Request):
        actor = actor_for(request)
        with store.transaction() as db:
            rows = store.all(db, "FEEDBACK")
        return {"records": [r for r in rows if r["actor_id"] == actor["id"] or ("review" in actor["roles"] and r.get("module") in actor["roles"])]}

    @app.post("/api/feedback/{fid}/review")
    def review(fid: str, body: Review, request: Request):
        actor = actor_for(request)
        allowed(actor, "review")
        with store.transaction() as db:
            entry = store.get(db, "FEEDBACK", fid)
            if not entry:
                raise HTTPException(404, "找不到回饋")
            allowed(actor, entry["module"])
            if entry["status"] == "published":
                raise HTTPException(409, "已發布版本不可覆寫；請新增修正回饋")
            entry.update(status="reviewed", text=body.text, source=body.source, reviewer=actor["id"], reviewed_at=now().isoformat())
            store.put(db, "FEEDBACK", fid, entry)
        return entry

    @app.get("/api/conversations/statistics")
    def conversation_statistics(request: Request):
        actor = actor_for(request)
        with store.transaction() as db:
            chats = [c for c in store.all(db, "CONVERSATION") if c["actor_id"] == actor["id"] and c["module"] in actor["roles"]]
            logs = [r for r in store.all(db, "LOG") if r["actor"] == actor["id"] and r["module"] in actor["roles"]]
        return {"conversations": len(chats), "messages": sum(len(c.get("messages", [])) for c in chats),
                "archived": sum(bool(c.get("is_archived")) and not c.get("is_deleted") for c in chats),
                "operations": len(logs), "succeeded": sum(r["status"] == "succeeded" for r in logs),
                "unknown": sum(r["status"] == "unknown" for r in logs)}

    @app.get("/api/conversations")
    def list_conversations(request: Request, q: str = "", scope: Literal["active", "archived", "deleted"] = "active",
                           page: int = 1, page_size: int = 30):
        from app.conversations import metadata
        actor = actor_for(request)
        if page < 1 or not 1 <= page_size <= 100 or len(q) > 200:
            raise HTTPException(422, "聊天查詢條件不合法")
        with store.transaction() as db:
            rows = [c for c in store.all(db, "CONVERSATION") if c["actor_id"] == actor["id"] and c["module"] in actor["roles"]]
        rows = [c for c in rows if (bool(c.get("is_deleted")) if scope == "deleted" else
                not c.get("is_deleted") and bool(c.get("is_archived")) == (scope == "archived"))]
        query = q.strip().casefold()
        rows = [metadata(c) for c in rows if not query or query in metadata(c)["title"].casefold()
                or any(query in str(m.get("content", "")).casefold() for m in c.get("messages", []))]
        rows.sort(key=lambda c: (c["is_pinned"], c["updated_at"], c["id"]), reverse=True)
        return {"records": rows[(page-1)*page_size:page*page_size], "total": len(rows), "page": page, "page_size": page_size}

    @app.post("/api/conversations/{cid}/metadata")
    def edit_conversation_metadata(cid: str, body: ConversationMetadata, request: Request):
        from app.conversations import owned, update_metadata
        actor = actor_for(request)
        patch = body.model_dump(exclude_none=True, exclude={"version"})
        if not patch:
            raise HTTPException(422, "請提供要修改的聊天設定")
        with store.transaction() as db:
            convo = owned(store.get(db, "CONVERSATION", cid), actor)
            return update_metadata(db, store, convo, patch, body.version, now().isoformat())

    def conversation_value(body, actor):
        allowed(actor, body.module)
        from app.model import budget_store
        from app.management import settings
        ledger = budget_store()
        with ledger.transaction() as db: config = settings(db, ledger)
        return {"model_settings": config, "id": secrets.token_urlsafe(18), "module": body.module, "context": body.context,
                 "actor_id": actor["id"], "locale": body.locale, "messages": [], "created_at": now().isoformat()}

    @app.post("/api/conversations")
    def new_conversation(body: Conversation, request: Request):
        actor = actor_for(request)
        convo = conversation_value(body, actor)
        with store.transaction() as db:
            if body.entry_id:
                entry = store.get(db, 'STATE', 'entry:v1:'+body.entry_id)
                if not entry or entry['actor_id'] != actor['id']:
                    raise HTTPException(404, '找不到入口對話')
                if entry.get('processing'):
                    raise HTTPException(409, '請先查核原入口訊息')
                if entry.get('handoff'):
                    previous = store.get(db, 'CONVERSATION', entry['handoff'])
                    if previous and previous['module'] == body.module and not previous.get('is_deleted'):
                        return previous
                    raise HTTPException(409, '入口已交接，請返回原作業或建立新聊天')
                unresolved = next((p for p in store.all(db, 'PROPOSAL') if p['actor_id']==actor['id'] and p['status'] in ('pending','unknown')), None)
                if unresolved:
                    raise HTTPException(409, '請先完成、取消或查核原作業')
                convo['messages'] = entry['messages']
                entry['handoff'] = convo['id']
                store.put(db, 'STATE', 'entry:v1:'+body.entry_id, entry)
            store.put(db, "CONVERSATION", convo["id"], convo)
        return convo

    def get_conversation(cid, actor):
        with store.transaction() as db:
            convo = store.get(db, "CONVERSATION", cid)
            if convo:
                for message in convo["messages"]:
                    if message.get("proposal"):
                        message["proposal"] = store.get(db, "PROPOSAL", message["proposal"]["id"])
        if not convo or convo["actor_id"] != actor["id"] or convo.get("is_deleted"):
            raise HTTPException(404, "找不到此對話")
        allowed(actor, convo["module"])
        convo.pop("processing", None)
        from app.conversations import metadata
        convo.update(metadata(convo))
        return convo

    @app.get("/api/conversations/{cid}")
    def get_chat(cid: str, request: Request):
        return get_conversation(cid, actor_for(request))

    @app.get("/api/conversations/{cid}/guide")
    def read_guide(cid: str, request: Request):
        actor = actor_for(request)
        get_conversation(cid, actor)
        with store.transaction() as db:
            return guide_view(db, store.get(db, "CONVERSATION", cid))

    @app.post("/api/conversations/{cid}/guide")
    def update_guide(cid: str, body: GuideUpdate, request: Request):
        patch = body.model_dump(exclude_unset=True, exclude={"version"})
        if patch.get("step") is None:
            patch.pop("step", None)
        return save_guide(cid, actor_for(request), patch, body.version)

    @app.post("/api/conversations/{cid}/locale")
    def update_locale(cid: str, body: LocaleUpdate, request: Request):
        actor = actor_for(request)
        get_conversation(cid, actor)
        with store.transaction() as db:
            convo = store.get(db, "CONVERSATION", cid)
            convo["locale"] = body.locale
            store.put(db, "CONVERSATION", cid, convo)
        return {"locale": body.locale}

    @app.post("/api/conversations/{cid}/proposals")
    def chat_proposal(cid: str, body: ChatProposal, request: Request):
        actor = actor_for(request)
        convo = get_conversation(cid, actor)
        return make_proposal(Proposal(module=convo["module"], action=body.action, args=body.args, conversation_id=cid, version=body.version), actor)

    @app.post("/api/conversations/{cid}/messages")
    def message(cid: str, body: Message, request: Request):
        return process_message(cid, body, request)

    def process_message(cid, body, request, decision_override=None):
        actor = actor_for(request)
        get_conversation(cid, actor)
        intent_token = secrets.token_urlsafe(24)
        with store.transaction() as db:
            convo = store.get(db, "CONVERSATION", cid)
            check_conversation_edit(db, convo, allow_unknown=True)
            if (convo.get("processing") or {}).get("expires_at", "") > now().isoformat():
                raise HTTPException(409, "上一則訊息仍在處理")
            convo["processing"] = {"token": intent_token, "expires_at": (now() + timedelta(minutes=10)).isoformat()}
            convo["messages"].append({"role": "user", "content": body.text})
            convo["updated_at"] = now().isoformat()
            store.put(db, "CONVERSATION", cid, convo)
            state = state_for(db) if mode == "simulation" else None

        def tool_actor():
            if mode == "simulation":
                fresh = actor_for(request)
                if fresh["id"] != actor["id"]:
                    raise HTTPException(401, "登入身分已改變")
                allowed(fresh, convo["module"])
                return fresh
            fresh = mes_bridge().resolve_identity(request.headers.get("cookie", ""), convo["module"])
            if fresh["id"] != actor["id"] or fresh.get("user_sid") != actor.get("user_sid"):
                raise MesError("MES 登入身分已改變，請重新開啟對話並核對操作身分。", "unauthorized")
            allowed(fresh, convo["module"])
            return fresh

        try:
            from app.model import respond
            from app.intents import classify
            convo = {**convo, "interaction_scope": body.scope}
            # 注入 model 是離線 HTTP 測試替身；正式請求一律使用受限分類器。
            decision = decision_override or (intent_classifier(convo) if intent_classifier else {"intent": "change"} if model else classify(convo, actor["roles"]))
            if decision.get("intent") not in {"greeting", "readonly", "change", "clarify", "unsupported", "capabilities"}:
                raise HTTPException(502, "無法確認訊息意圖，原操作未變更")
            other_module = decision.get("module") in {"schedule","report","mold"} and decision["module"] != convo["module"]
            selection = body.scope == "selection"
            read_only = selection or other_module or decision["intent"] != "change"
            with store.transaction() as db:
                current = store.get(db, "CONVERSATION", cid)
                check_conversation_edit(db, current, intent_token, allow_unknown=read_only)
                if not read_only:
                    current["revision"] = current.get("revision", 0) + 1
                    for old in store.all(db, "PROPOSAL"):
                        if old.get("conversation_id") == cid and old["status"] == "pending":
                            old["status"] = "superseded"
                            store.put(db, "PROPOSAL", old["id"], old)
                    store.put(db, "CONVERSATION", cid, current)
                convo = current
            convo = {**convo, "interaction_scope": body.scope}
            if selection and decision["intent"] == "change":
                result = {"content": {"zh-TW":"目前只在選取資料，不會修改作業。若要改數量或執行操作，請返回作業單後再提出；目前草稿與確認卡已保留。", "en":"You are selecting records. To change quantities or perform an operation, return to the operation sheet first. Your draft and confirmation are retained.", "th":"ขณะนี้กำลังเลือกข้อมูล หากต้องการเปลี่ยนจำนวนหรือดำเนินงาน โปรดกลับไปที่ใบงานก่อน เก็บฉบับร่างและการยืนยันไว้แล้ว"}.get(convo.get("locale"), "請返回作業單後再修改；目前內容已保留。")}
            elif other_module:
                result = {"content": {"zh-TW":"這項需求屬於其他模組。請先完成、取消或查核目前作業，再從入口選擇對應模組；目前內容已保留。","en":"This request belongs to another module. Complete, cancel or reconcile the current operation before choosing that module. Your current draft is retained.","th":"คำขอนี้อยู่ในโมดูลอื่น โปรดดำเนินการ ยกเลิก หรือตรวจสอบงานปัจจุบันก่อนเลือกโมดูลนั้น เก็บฉบับร่างไว้แล้ว"}.get(convo.get("locale"),"請先完成目前作業，再選擇其他模組。")}
            elif model:
                result = model(convo, state, store)
            else:
                query_fn = lambda filters: query_conversation(cid, tool_actor(), filters, intent_token=intent_token)
                result = respond(convo, state, store, query_fn=query_fn,
                                 draft_fn=None if read_only else lambda patch, version: save_guide(cid, tool_actor(), patch, version, intent_token),
                                 prepare_fn=None if read_only else lambda action, args: make_proposal(Proposal(module=convo["module"], action=action, args=args, conversation_id=cid), tool_actor(), intent_token), read_only=read_only, authorize_fn=tool_actor)
            tool_actor()
            if read_only and (result.get("action") or result.get("proposal")):
                raise HTTPException(502, "唯讀回覆包含未允許的操作，已阻擋")
            proposal = result.get("proposal")
            if result.get("action"):
                try:
                    proposal = make_proposal(Proposal(module=convo["module"], action=result["action"], args=result["args"], conversation_id=cid), tool_actor(), intent_token)["proposal"]
                except HTTPException as exc:
                    if exc.status_code in (401, 403):
                        raise
                    result["content"] += "\n\n尚未建立確認卡：" + str(exc.detail)
            with store.transaction() as db:
                convo = store.get(db, "CONVERSATION", cid)
                if (convo.get("processing") or {}).get("token") != intent_token:
                    raise HTTPException(409, "這輪對話已被新的需求取代")
                convo["messages"].append({"role": "assistant", "content": result["content"], "proposal": proposal, "data": result.get("data"), "knowledge": result.get("knowledge", [])})
                convo["updated_at"] = now().isoformat()
                convo.pop("processing", None)
                store.put(db, "CONVERSATION", cid, convo)
                guide = guide_view(db, convo)
            return {"messages": convo["messages"], "proposal": guide.get("proposal") if read_only else proposal, "data": result.get("data"), "guide": guide, "query_context": convo.get("query_context")}
        finally:
            with store.transaction() as db:
                current = store.get(db, "CONVERSATION", cid)
                if (current.get("processing") or {}).get("token") == intent_token:
                    current.pop("processing", None)
                    store.put(db, "CONVERSATION", cid, current)

    from app.entry import install as install_entry
    install_entry(app, store, actor_for, allowed, now, conversation_value, process_message, intent_classifier)
    return app


app = create_app()
if (ROOT / "frontend" / "dist").exists():
    app.mount("/", StaticFiles(directory=ROOT / "frontend" / "dist", html=True), name="frontend")
