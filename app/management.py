"""非機密模型設定及額度；與費用預留共用交易，沒有重設帳本介面。"""
import os
from datetime import datetime, timezone
from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal

class SettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = Field(ge=0, strict=True)
    model: str = Field(max_length=100)
    reasoning_effort: Literal["low", "medium", "high"]
    max_tool_rounds: int = Field(ge=1, le=5, strict=True)

class BudgetUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = Field(ge=0, strict=True)
    limit_usd: float = Field(ge=0, le=20, allow_inf_nan=False)
    warning_percent: int = Field(ge=1, le=100, strict=True)


def cap():
    return max(0.0, min(20.0, float(os.getenv("AI_TEST_BUDGET_USD", "20"))))


def settings(db, store):
    return store.get(db, "STATE", "model-settings") or {"version": 0, "model": os.getenv("OPENAI_MODEL", "gpt-6.1-sol"), "reasoning_effort": "low", "max_tool_rounds": 5}


def budget_config(db, store):
    return store.get(db, "STATE", "budget-settings") or {"version": 0, "limit_usd": cap(), "warning_percent": 80}


def effective_cap(db, store):
    return min(cap(), budget_config(db, store)["limit_usd"])


def log(db, store, actor, kind, before, after):
    import secrets
    key = secrets.token_urlsafe(18)
    store.put(db, "LOG", key, {"id": key, "time": datetime.now(timezone.utc).isoformat(), "actor": actor["id"], "module": "review", "action": kind, "status": "succeeded", "changes": [{"table": "ZZ_AI_AGENT_OPERATION_STATE", "key": kind, "field": "data", "before": before, "after": after}]})


def install(app, actor_for):
    from app.model import budget_store, budget_summary, PRICES
    def view(actor):
        store = budget_store()
        with store.transaction() as db:
            result = settings(db,store)
            config = budget_config(db,store)
        return {"settings": result, "budget_config": config, "budget": budget_summary(), "hard_limit_usd": cap(), "write_allowed": "review" in actor["roles"], "api_key_configured": bool(os.getenv("OPENAI_API_KEY")), "models": list(PRICES), "provider": "OpenAI Responses API", "agent": "MES 受限工具助理"}

    @app.get("/api/management")
    def read(request: Request):
        return view(actor_for(request))

    def save(body, actor, key):
        if "review" not in actor["roles"]:
            raise HTTPException(403, "僅既有主管權限可修改管理設定。")
        store = budget_store()
        with store.transaction() as db:
            old = settings(db,store) if key == "model-settings" else budget_config(db,store)
            if old["version"] != body.version:
                raise HTTPException(409, "設定已更新，請重新讀取後核對。")
            if key == "model-settings" and body.model not in PRICES:
                raise HTTPException(422, "此模型尚未設定經核對的價格。")
            if key == "budget-settings" and body.limit_usd > cap():
                raise HTTPException(422, "額度不可超過部署上限與 US$20。")
            value = body.model_dump(); value["version"] += 1
            store.put(db,"STATE",key,value)
            log(db,store,actor,key,old,value)
        return view(actor)

    @app.post("/api/management/settings")
    def update_settings(body: SettingsUpdate, request: Request):
        return save(body,actor_for(request),"model-settings")

    @app.post("/api/management/budget")
    def update_budget(body: BudgetUpdate, request: Request):
        return save(body,actor_for(request),"budget-settings")

    @app.get("/api/management/audit")
    def read_audit(request: Request):
        actor=actor_for(request)
        if "review" not in actor["roles"]: raise HTTPException(403,"目前身分沒有管理權限。")
        store=budget_store()
        with store.transaction() as db: return {"records":store.all(db,"LOG")[:100]}
