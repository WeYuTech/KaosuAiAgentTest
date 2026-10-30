"""所有模型與人員均經過相同的草稿及確認邊界。"""
import json
import os
import secrets
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
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
                 "mold.unmount_finish": "完成下模、出站及完工", "mold.clear": "清除換模與進出站時間並取消完工"}


def proposal_target(state, args):
    from app.domain import EXECUTION, OUTPUT, SCHEDULE, DETAIL
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
                       if r.get("ZZ_KAOSU_PROD_SCHEDULE_SID") == schedule_id and r.get("WO")})
    return {"equipment": equipment, "work_order": execution.get("WO"), "schedule_id": schedule_id,
            "execution_id": execution_id, "report_id": report_id, "affected_orders": affected or [d.get("wo") for d in args.get("details", []) if d.get("wo")]}


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


class Confirmation(Input):
    digest: str
    approved: bool


class Conversation(Input):
    module: Literal["schedule", "report", "mold"]
    context: dict[str, Any] = Field(default_factory=dict)


class Message(Input):
    text: str = Field(min_length=1, max_length=8000)


class Feedback(Input):
    module: Literal["schedule", "report", "mold"]
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: str | None = None


class Review(Input):
    text: str = Field(min_length=1, max_length=4000)
    source: str = Field(min_length=1, max_length=500)


def create_app(db_path=None, model=None):
    app = FastAPI(title="MES 對話操作助理", version="0.1.0")
    store = Store(db_path or ROOT / ".local" / "operations.db")
    mode = os.getenv("MES_MODE", "simulation")
    locks: dict[str, threading.Lock] = {}
    lock_guard = threading.Lock()
    app.state.store = store
    bridge = None

    def mes_bridge():
        nonlocal bridge
        from app.mes import MesBridge
        if bridge is None:
            bridge = MesBridge.from_env()
        return bridge

    from app.mes import MesError

    @app.exception_handler(MesError)
    async def mes_error(request, exc):
        status = {"unauthorized": 401, "forbidden": 403, "validation": 422, "not_found": 404,
                  "stale": 409, "conflict": 409, "linked_reports": 409, "scope_too_large": 422}.get(exc.code, 503)
        return JSONResponse({"detail": {"code": exc.code, "message": str(exc)}}, status_code=status)

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
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=exc.headers)

    @app.middleware("http")
    async def guard_origin(request: Request, call_next):
        origin = request.headers.get("origin")
        if request.method not in ("GET", "HEAD", "OPTIONS") and origin:
            allowed = {str(request.base_url).rstrip("/")} | set(filter(None, os.getenv("AI_ALLOWED_ORIGINS", "").split(",")))
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
            raise HTTPException(422, {"code": getattr(exc, "code", "validation"), "message": str(exc)}) from exc

    def make_proposal(body, actor):
        from app.domain import execute
        allowed(actor, body.module)
        if not body.action.startswith(body.module + "."):
            raise HTTPException(422, "動作不屬於目前模組")
        instant = now()
        with store.transaction() as db:
            if mode == "simulation":
                state = state_for(db)
                after = call_domain(execute, state, body.module, body.action, body.args, actor, instant)
                diff = changes(state, after)
                version = digest(state)
                target = proposal_target(state, body.args)
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
            proposal = {"id": str(uuid4()), "actor_id": actor["id"], "module": body.module,
                        "action": body.action, "args": body.args, "summary": ACTION_LABELS[body.action], "target": target, "writes_enabled": enabled, **policies,
                        "business_timezone": business_clock()["business_timezone"],
                        "changes": diff, "created_at": instant.isoformat(), "event_time": instant.isoformat(),
                        "expires_at": (instant + timedelta(minutes=10)).isoformat(),
                        "state_digest": version, "status": "pending", "mode": mode, "conversation_id": body.conversation_id,
                        "independent_confirmation": body.action in ("report.delete", "report.complete", "mold.clear", "mold.unmount_finish")}
            proposal["digest"] = digest(proposal)
            store.put(db, "PROPOSAL", proposal["id"], proposal)
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

    @app.post("/api/proposals")
    def proposals(body: Proposal, request: Request):
        return make_proposal(body, actor_for(request))

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

    @app.get("/api/audit")
    def audit(request: Request):
        actor = actor_for(request)
        with store.transaction() as db:
            records = store.all(db, "LOG")
        return {"records": [r for r in records if r["actor"] == actor["id"] or "review" in actor["roles"]][:200]}

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
        return {"records": [r for r in rows if r["actor_id"] == actor["id"] or "review" in actor["roles"]]}

    @app.post("/api/feedback/{fid}/review")
    def review(fid: str, body: Review, request: Request):
        actor = actor_for(request)
        allowed(actor, "review")
        with store.transaction() as db:
            entry = store.get(db, "FEEDBACK", fid)
            if not entry:
                raise HTTPException(404, "找不到回饋")
            if entry["status"] == "published":
                raise HTTPException(409, "已發布版本不可覆寫；請新增修正回饋")
            entry.update(status="reviewed", text=body.text, source=body.source, reviewer=actor["id"], reviewed_at=now().isoformat())
            store.put(db, "FEEDBACK", fid, entry)
        return entry

    @app.post("/api/conversations")
    def new_conversation(body: Conversation, request: Request):
        actor = actor_for(request)
        allowed(actor, body.module)
        convo = {"id": secrets.token_urlsafe(18), "module": body.module, "context": body.context,
                 "actor_id": actor["id"], "messages": [], "created_at": now().isoformat()}
        with store.transaction() as db:
            store.put(db, "CONVERSATION", convo["id"], convo)
        return convo

    def get_conversation(cid, actor):
        with store.transaction() as db:
            convo = store.get(db, "CONVERSATION", cid)
        if not convo or convo["actor_id"] != actor["id"]:
            raise HTTPException(404, "找不到此對話")
        allowed(actor, convo["module"])
        return convo

    @app.get("/api/conversations/{cid}")
    def get_chat(cid: str, request: Request):
        return get_conversation(cid, actor_for(request))

    @app.post("/api/conversations/{cid}/proposals")
    def chat_proposal(cid: str, body: dict, request: Request):
        actor = actor_for(request)
        convo = get_conversation(cid, actor)
        return make_proposal(Proposal(module=convo["module"], action=body.get("action", ""), args=body.get("args", {}), conversation_id=cid), actor)

    @app.post("/api/conversations/{cid}/messages")
    def message(cid: str, body: Message, request: Request):
        actor = actor_for(request)
        with lock_guard:
            lock = locks.setdefault(cid, threading.Lock())
        if not lock.acquire(blocking=False):
            raise HTTPException(409, "上一則訊息仍在處理")
        try:
            from app.model import respond
            convo = get_conversation(cid, actor)
            with store.transaction() as db:
                state = state_for(db) if mode == "simulation" else None
                for old in store.all(db, "PROPOSAL"):
                    if old.get("conversation_id") == cid and old["status"] == "pending":
                        old["status"] = "superseded"
                        store.put(db, "PROPOSAL", old["id"], old)
            convo["messages"].append({"role": "user", "content": body.text})
            if model:
                result = model(convo, state, store)
            else:
                query_fn = (lambda filters: mes_bridge().snapshot(actor, convo["module"], filters)) if mode != "simulation" else None
                result = respond(convo, state, store, query_fn=query_fn,
                                 prepare_fn=lambda action, args: make_proposal(Proposal(module=convo["module"], action=action, args=args, conversation_id=cid), actor))
            proposal = result.get("proposal")
            if result.get("action"):
                try:
                    proposal = make_proposal(Proposal(module=convo["module"], action=result["action"], args=result["args"], conversation_id=cid), actor)["proposal"]
                except HTTPException as exc:
                    result["content"] += "\n\n尚未建立確認卡：" + str(exc.detail)
            convo["messages"].append({"role": "assistant", "content": result["content"], "proposal": proposal, "data": result.get("data"), "knowledge": result.get("knowledge", [])})
            with store.transaction() as db:
                store.put(db, "CONVERSATION", cid, convo)
            return {"messages": convo["messages"], "proposal": proposal, "data": result.get("data")}
        finally:
            lock.release()

    return app


app = create_app()
if (ROOT / "frontend" / "dist").exists():
    app.mount("/", StaticFiles(directory=ROOT / "frontend" / "dist", html=True), name="frontend")
