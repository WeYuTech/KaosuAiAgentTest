"""定時唯讀報告：既有 STATE 保存定義／執行紀錄，原訂時間唯一領取。"""
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from threading import Event, Thread
from contextlib import asynccontextmanager
from typing import Literal
from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from app.store import digest


class ReportSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1,max_length=100)
    module: Literal["report","schedule","mold"]
    equipment: str = Field(default="",max_length=60,pattern=r"^[\w -]*$")
    frequency: Literal["daily","weekdays"] = "daily"
    hour: int = Field(ge=0,le=23,strict=True)
    minute: int = Field(ge=0,le=59,strict=True)

class CreateReport(ReportSpec):
    client_id: str = Field(min_length=16,max_length=100,pattern=r"^[a-zA-Z0-9_-]+$")

class EditReport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = Field(ge=0,strict=True)
    status: Literal["active","paused","deleted"]

class ParseReport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1,max_length=500)


def zone():
    return timezone(timedelta(hours=int(os.getenv("MES_SERVER_UTC_OFFSET_HOURS","7"))))


def next_due(spec,after):
    local=after.astimezone(zone())
    for days in range(8):
        due=(local+timedelta(days=days)).replace(hour=spec["hour"],minute=spec["minute"],second=0,microsecond=0)
        if due>local and (spec["frequency"]=="daily" or due.weekday()<5): return due.astimezone(timezone.utc).isoformat()
    raise ValueError("找不到下一次報告時間")


def parse(text):
    times=re.findall(r"(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)",text)
    if len(times)!=1: raise HTTPException(422,"請明確提供一個 24 小時制時間，例如每天 08:00 報工 MC37。")
    modules=[key for key,words in {"report":["報工","report","ผลผลิต"],"schedule":["排程","schedule","ตารางผลิต"],"mold":["模具","mold","แม่พิมพ์"]}.items() if any(word in text.lower() for word in words)]
    if len(modules)!=1: raise HTTPException(422,"請指定一個報告模組：排程、報工或模具。")
    weekdays=any(word in text.lower() for word in ["週一至週五","工作日","weekdays","วันจันทร์ถึงศุกร์"])
    if not weekdays and not any(word in text.lower() for word in ["每天","每日","daily","every day","ทุกวัน"]): raise HTTPException(422,"請指定每天或週一至週五。")
    machines=re.findall(r"\bMC\d+\b",text,re.I)
    if len(set(machines))>1: raise HTTPException(422,"請每份報告指定一部設備，或使用表單選擇全部設備。")
    return ReportSpec(title=text.strip()[:100],module=modules[0],equipment=machines[0].upper() if machines else "",frequency="weekdays" if weekdays else "daily",hour=int(times[0][0]),minute=int(times[0][1])).model_dump()


class ReportService:
    def __init__(self,store,query): self.store,self.query=store,query
    def tick(self,instant=None):
        instant=instant or datetime.now(timezone.utc)
        with self.store.transaction() as db:
            jobs=[j for j in self.store.all(db,"STATE") if j.get("kind")=="report_schedule" and j["status"]=="active" and j["next_run_at"]<=instant.isoformat()]
        for candidate in jobs:
            with self.store.transaction() as db:
                job=self.store.get(db,"STATE",candidate["id"])
                if job["status"]!="active" or job["next_run_at"]>instant.isoformat(): continue
                due=job["next_run_at"]; key="report-run:"+digest([job["id"],due])
                if self.store.get(db,"STATE",key): continue
                run={"kind":"report_run","id":key,"schedule_id":job["id"],"actor_id":job["actor_id"],"module":job["module"],"due_at":due,"started_at":instant.isoformat(),"status":"running","report":None}
                job["next_run_at"]=next_due(job,instant)
                self.store.put(db,"STATE",job["id"],job); self.store.put(db,"STATE",key,run)
            try:
                if instant-datetime.fromisoformat(due)>timedelta(minutes=15):
                    run.update(status="missed",message="服務未於原訂時間執行，未補跑。")
                else:
                    day=(datetime.fromisoformat(due).astimezone(zone()).date()-timedelta(days=1)).isoformat()
                    data=self.query(job,{"equipment":job["equipment"],"date":day,"page":1,"page_size":100})
                    rows=data["records"]
                    if data.get("total",len(rows))>len(rows):
                        raise HTTPException(422,"資料超過單次報告範圍，請縮小設備範圍。")
                    run.update(status="completed",report={"title":job["title"],"date":day,"timezone":"UTC"+datetime.now(zone()).strftime("%z"),"records":rows,"record_count":len(rows),"data_source":"既有 MES 模組查詢","no_data":not rows})
            except Exception:
                # 不把 SQL、Cookie、金鑰或第三方診斷內容寫入一般紀錄。
                run.update(status="failed",message="查詢或權限驗證未完成；沒有可確認的報告，不會自動重送。")
            run["finished_at"]=datetime.now(timezone.utc).isoformat()
            with self.store.transaction() as db:
                self.store.put(db,"STATE",key,run)
                self.store.put(db,"LOG",key,{"id":key,"actor":job["actor_id"],"module":job["module"],"action":"scheduled_report","status":run["status"],"time":run["finished_at"],"changes":[],"report_run_id":key})
        # 程序中斷的執行只標示未完成，不領取第二次。
        with self.store.transaction() as db:
            for run in self.store.all(db,"STATE"):
                if run.get("kind")=="report_run" and run["status"]=="running" and instant-datetime.fromisoformat(run["started_at"])>timedelta(minutes=15):
                    run.update(status="interrupted",message="服務中斷，報告未完成；未自動重送。")
                    self.store.put(db,"STATE",run["id"],run)


def install(app,store,actor_for,query):
    service=ReportService(store,query); app.state.reports=service
    previous=app.router.lifespan_context
    @asynccontextmanager
    async def lifespan(application):
        stop=Event()
        def work():
            while not stop.is_set():
                try: service.tick()
                except Exception: pass  # 個別輪詢失敗，下次仍依唯一領取紀錄處理。
                stop.wait(15)
        async with previous(application):
            worker=None
            if os.getenv("AI_REPORT_WORKER","1")=="1":
                worker=Thread(target=work,daemon=True,name="mes-readonly-reports");worker.start()
            try: yield
            finally:
                stop.set()
                if worker: worker.join(timeout=1)
    app.router.lifespan_context=lifespan

    def own(db,sid,actor):
        value=store.get(db,"STATE",sid)
        if not value or value.get("kind")!="report_schedule" or value["actor_id"]!=actor["id"] or value["module"] not in actor["roles"]: raise HTTPException(404,"找不到此定時報告。")
        return value

    @app.post("/api/report-schedules/preview")
    def preview(body:ParseReport,request:Request):
        actor=actor_for(request); value=parse(body.text)
        if value["module"] not in actor["roles"]: raise HTTPException(403,"目前身分沒有此模組權限。")
        return value

    @app.get("/api/report-schedules")
    def listing(request:Request):
        actor=actor_for(request)
        with store.transaction() as db: rows=[j for j in store.all(db,"STATE") if j.get("kind")=="report_schedule" and j["actor_id"]==actor["id"] and j["module"] in actor["roles"] and j["status"]!="deleted"]
        return {"records":rows,"timezone":"UTC"+datetime.now(zone()).strftime("%z")}

    @app.post("/api/report-schedules")
    def create(body:CreateReport,request:Request):
        actor=actor_for(request)
        if body.module not in actor["roles"]: raise HTTPException(403,"目前身分沒有此模組權限。")
        spec=body.model_dump(exclude={"client_id"}); key="report-schedule:"+digest([actor["id"],body.client_id])
        with store.transaction() as db:
            previous=store.get(db,"STATE",key)
            if previous:
                if previous["spec_digest"]!=digest(spec): raise HTTPException(409,"此建立識別已用於其他內容，請重新核對。")
                return previous
            existing = [j for j in store.all(db,"STATE") if j.get("kind")=="report_schedule" and j["actor_id"]==actor["id"] and j["status"]!="deleted"]
            if len(existing) >= 20:
                raise HTTPException(422,"每位使用者最多保留 20 份定時報告，請先整理既有排程。")
            value={**spec,"id":key,"kind":"report_schedule","actor_id":actor["id"],"actor_user_sid":actor.get("user_sid"),"spec_digest":digest(spec),"version":0,"status":"active","next_run_at":next_due(spec,datetime.now(timezone.utc))}
            store.put(db,"STATE",key,value)
            store.put(db,"LOG",key,{"id":key,"time":datetime.now(timezone.utc).isoformat(),"actor":actor["id"],"module":body.module,"action":"report_schedule.create","status":"succeeded","changes":[{"table":"ZZ_AI_AGENT_OPERATION_STATE","key":key,"field":"data","before":None,"after":value}]})
        return value

    @app.post("/api/report-schedules/{sid}")
    def edit(sid:str,body:EditReport,request:Request):
        actor=actor_for(request)
        with store.transaction() as db:
            value=own(db,sid,actor)
            if value["version"]!=body.version: raise HTTPException(409,"定時報告已更新，請重新讀取。")
            before=dict(value);value.update(status=body.status,version=body.version+1)
            if body.status=="active": value["next_run_at"]=next_due(value,datetime.now(timezone.utc))
            store.put(db,"STATE",sid,value)
            key=secrets.token_urlsafe(18)
            store.put(db,"LOG",key,{"id":key,"actor":actor["id"],"module":value["module"],"time":datetime.now(timezone.utc).isoformat(),"action":"report_schedule.update","status":"succeeded","changes":[{"table":"ZZ_AI_AGENT_OPERATION_STATE","key":sid,"field":"data","before":before,"after":value}]})
        return value

    @app.get("/api/report-schedules/{sid}/runs")
    def runs(sid:str,request:Request):
        actor=actor_for(request)
        with store.transaction() as db:
            own(db,sid,actor)
            return {"records":[r for r in store.all(db,"STATE") if r.get("kind")=="report_run" and r["schedule_id"]==sid][:100]}
