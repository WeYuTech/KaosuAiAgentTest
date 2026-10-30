"""只對明確新建的 AI 驗收庫建立合成資料與執行交易驗收；不寫正式庫。"""
import argparse
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import sys
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import httpx
import pyodbc
from dotenv import load_dotenv
from app import domain
from app.mes import MesBridge, MesConfig, MesError, EXECUTION, OUTPUT, DEFECT, SCHEDULE, DETAIL, PK

TARGET = "ZZ_AI_AGENT_OPERATION_TEST_20261030"
MARKER = "本次 AI 對話操作專用合成資料驗收庫；禁止視為正式 MES"
TABLES = ["SEC_USER","EQP_MASTER","BAS_PARTNO","BAS_REASON","WOR_MASTER","TOL_MASTER","TOL_MASTER_DETAILS",domain.SHIFT,SCHEDULE,DETAIL,EXECUTION,OUTPUT,DEFECT]
OBJECTS = ["rand_view","GetSid","GET_DATETIME_STRING","GET_ZZ_KAOSU_PLAN_PART","GET_ZZ_KAOSU_PLAN_TOL","GET_ZZ_KAOSU_PLAN_TOL_DETAILS","V_ZZ_SCHEDULE_WO_TOL_SID_NEW","ZZ_KAOSU_PROD_SCHEDULE_DETAIL_OPI_InsertUpdate"]


def identifier(value):
    return "["+value.replace("]","]]")+"]"


def target_connection(write=True):
    conn = pyodbc.connect(os.environ["MES_TEST_CONNECTION_STRING"], autocommit=False, timeout=10)
    try:
        cursor = conn.cursor()
        if cursor.execute("SELECT DB_NAME()").fetchone()[0] != TARGET:
            raise RuntimeError("驗收連線不是指定的新測試庫，禁止操作")
        row = cursor.execute("SELECT PURPOSE FROM dbo.ZZ_AI_AGENT_OPERATION_TEST_MARKER WHERE ID=1").fetchone()
        if not row or row[0] != MARKER:
            raise RuntimeError("缺少本次新庫識別標記，禁止操作")
        conn.rollback()
        return conn
    except BaseException:
        conn.close(); raise


def read_columns(cursor, table):
    sql="""SELECT c.name,t.name,c.max_length,c.precision,c.scale,c.is_nullable,c.is_identity,
                  dc.definition,c.is_computed
           FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id
           LEFT JOIN sys.default_constraints dc ON dc.object_id=c.default_object_id
           WHERE c.object_id=OBJECT_ID(?) ORDER BY c.column_id"""
    return list(cursor.execute(sql, "dbo."+table).fetchall())


def type_sql(row):
    name,typ,length,precision,scale,*_=row
    if typ in {"nvarchar","nchar","varchar","char","varbinary","binary"}:
        return typ+"("+("max" if length==-1 else str(length//2 if typ.startswith("n") else length))+")"
    if typ in {"decimal","numeric"}: return f"{typ}({precision},{scale})"
    if typ in {"datetime2","datetimeoffset","time"}: return f"{typ}({scale})"
    return identifier(typ)


def provision():
    source_string=os.environ["MES_SOURCE_READONLY_CONNECTION_STRING"]
    master_string=re.sub(r"(?i)(Database|Initial Catalog)=[^;]*", "Database=master",source_string)
    with pyodbc.connect(master_string,autocommit=True,timeout=10) as master:
        cursor=master.cursor()
        if cursor.execute("SELECT 1 FROM sys.databases WHERE name=?",TARGET).fetchone():
            raise RuntimeError("指定驗收庫已存在；不會重用或修改，請先核對")
        cursor.execute("CREATE DATABASE "+identifier(TARGET))
    raw=pyodbc.connect(os.environ["MES_TEST_CONNECTION_STRING"],autocommit=False,timeout=10)
    try:
        cursor=raw.cursor()
        if cursor.execute("SELECT DB_NAME()").fetchone()[0]!=TARGET:
            raise RuntimeError("新庫連線核對失敗")
        cursor.execute("CREATE TABLE dbo.ZZ_AI_AGENT_OPERATION_TEST_MARKER(ID int NOT NULL PRIMARY KEY,PURPOSE nvarchar(255) NOT NULL,CREATED_UTC datetime2 NOT NULL DEFAULT SYSUTCDATETIME())")
        cursor.execute("INSERT INTO dbo.ZZ_AI_AGENT_OPERATION_TEST_MARKER(ID,PURPOSE) VALUES (?,?)",1,MARKER)
        raw.commit()
    finally: raw.close()
    setup_schema(source_string)


def setup_schema(source_string):
    # 來源連線只允許 metadata SELECT，所有 DDL 只送到通過 DB_NAME/marker 檢查的新庫。
    source=pyodbc.connect(source_string,autocommit=False,timeout=10,attrs_before={101:1})
    target=target_connection()
    try:
        read,write=source.cursor(),target.cursor()
        definitions={}
        for name in OBJECTS:
            row=read.execute("SELECT definition FROM sys.sql_modules WHERE object_id=OBJECT_ID(?)","dbo."+name).fetchone()
            if not row or not row[0]: raise RuntimeError("缺少來源物件："+name)
            clean=re.sub(r"--[^\r\n]*|/\*.*?\*/","",row[0],flags=re.S)
            if re.search(r"\b(USE|EXEC|EXECUTE|OPENQUERY|OPENROWSET|OPENDATASOURCE)\b",clean,re.I):
                raise RuntimeError("來源物件含動態或跨來源操作，禁止複製："+name)
            cross=read.execute("SELECT 1 FROM sys.sql_expression_dependencies WHERE referencing_id=OBJECT_ID(?) AND (referenced_server_name IS NOT NULL OR referenced_database_name IS NOT NULL)","dbo."+name).fetchone()
            if cross: raise RuntimeError("來源物件有跨資料庫相依，禁止複製："+name)
            definitions[name]=row[0]
        for name in OBJECTS[:3]:
            if not write.execute("SELECT OBJECT_ID(?)","dbo."+name).fetchone()[0]: write.execute(definitions[name])
        for table in TABLES:
            if write.execute("SELECT OBJECT_ID(?)","dbo."+table).fetchone()[0]: continue
            columns=read_columns(read,table)
            if not columns: raise RuntimeError("缺少來源表："+table)
            definitions=[]
            for row in columns:
                name,typ,length,precision,scale,nullable,identity,default,computed=row
                if computed or typ in {"timestamp","rowversion"}: raise RuntimeError("需另處理的來源欄位："+table+"."+name)
                definition=identifier(name)+" "+type_sql(row)+(" IDENTITY(1,1)" if identity else "")+(" NULL" if nullable else " NOT NULL")
                if default: definition+=" DEFAULT "+default
                definitions.append(definition)
            primary=[r[0] for r in read.execute("SELECT c.name FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id WHERE i.object_id=OBJECT_ID(?) AND i.is_primary_key=1 ORDER BY ic.key_ordinal","dbo."+table).fetchall()]
            if primary: definitions.append("PRIMARY KEY ("+",".join(map(identifier,primary))+")")
            write.execute("CREATE TABLE dbo."+identifier(table)+" ("+",".join(definitions)+")")
        for name in OBJECTS[3:]:
            if not write.execute("SELECT OBJECT_ID(?)","dbo."+name).fetchone()[0]: write.execute(definitions[name])
        write.execute((ROOT/"migrations"/"001_AI操作紀錄.sql").read_text(encoding="utf-8"))
        target.commit()
        seed_catalogs(target)
        target.commit()
    except BaseException:
        target.rollback(); raise
    finally:
        source.rollback(); source.close(); target.close()


def insert_synthetic(cursor,table,data):
    columns=read_columns(cursor,table)
    supplied=dict(data)
    for row in columns:
        name,typ,length,precision,scale,nullable,identity,default,computed=row
        if name in supplied or nullable or identity or default or computed: continue
        if typ in {"nvarchar","varchar","nchar","char","text","ntext"}:
            supplied[name]="Y" if name in {"ENABLE_FLAG","ADMIN"} else ("SQLTEST" if length>=14 else "T")
        elif typ in {"date","datetime","datetime2","smalldatetime","datetimeoffset"}: supplied[name]=datetime(2026,10,30,8)
        elif typ=="uniqueidentifier": supplied[name]=str(uuid4())
        elif typ in {"binary","varbinary"}: supplied[name]=b"\0"
        else: supplied[name]=0
    permitted={row[0] for row in columns}
    supplied={k:v for k,v in supplied.items() if k in permitted}
    names=list(supplied)
    cursor.execute("INSERT INTO dbo."+identifier(table)+" ("+",".join(map(identifier,names))+") VALUES ("+",".join("?" for _ in names)+")",*(supplied[k] for k in names))


def seed_catalogs(db):
    cursor=db.cursor()
    if cursor.execute("SELECT 1 FROM dbo.SEC_USER WHERE ACCOUNT_NO=?","TEST").fetchone(): return
    insert_synthetic(cursor,"SEC_USER",{"USER_SID":80000001,"ACCOUNT_NO":"TEST","USER_NAME":"隔離 SQL 驗收人員","ENABLE_FLAG":"Y","REFRESH_TOKEN":"synthetic-sql-test-token-with-no-live-value"})
    for eqp in (36,37): insert_synthetic(cursor,"EQP_MASTER",{"EQP_SID":80000000+eqp,"EQP_NO":f"TEST-MC{eqp}","EQP_NAME":"隔離驗收機台","EQP_TYPE":"EPS","FAB":"fac2","ENABLE_FLAG":"Y"})
    insert_synthetic(cursor,"TOL_MASTER",{"TOL_SID":80000051,"TOL_NO":"TEST-MOLD-A","TOL_NAME":"隔離驗收模具","TOL_OPERATION":"EPS-FORMING","ENABLE_FLAG":"Y","DEFAULT_CYCLE_TIME":60})
    for index,part in enumerate(("A","B"),1):
        insert_synthetic(cursor,"BAS_PARTNO",{"PART_SID":80000080+index,"PART_NO":"TEST-PART-"+part,"PART_SPEC":"隔離驗收品號 "+part})
        insert_synthetic(cursor,"TOL_MASTER_DETAILS",{"TOL_DETALS_SID":80000060+index,"TOL_SID":80000051,"TOL_NO":"TEST-MOLD-A","TOL_DETALS_NO":"TEST-CAV-"+part,"TOL_DETALS_NAME":"隔離模穴 "+part,"PART_NO":"TEST-PART-"+part,"CUR_CAV":2 if index==1 else 1})
        insert_synthetic(cursor,"WOR_MASTER",{"WO_SID":80000070+index,"WO":"TEST-WO-"+part,"PART_NO":"TEST-PART-"+part,"QUANTITY":1000,"ACCUMULATED_QUANTITY":0,"STATUS":"Release"})
        insert_synthetic(cursor,"BAS_REASON",{"REASON_SID":80000090+index,"REASON_CODE":"NG0"+str(index),"REASON_NAME":"隔離原因 "+part,"REASON_TYPE":"NG_EPS"})
    insert_synthetic(cursor,domain.SHIFT,{"ZZ_KAOSU_PROD_SHIFT_DAILY_REPORT_BASE_SID":80007001,"FAB":"","SHIFT_START_DAY":"2020-01-01","SHIFT_END_DAY":"2099-12-31","SHIFT_CLASS_1":"日班","SHIFT_START_TIME_1":"08:00","SHIFT_END_TIME_1":"20:00","SHIFT_START_DATE_1":0,"SHIFT_END_DATE_1":0,"SHIFT_CLASS_2":"夜班","SHIFT_START_TIME_2":"20:00","SHIFT_END_TIME_2":"08:00","SHIFT_START_DATE_2":0,"SHIFT_END_DATE_2":1})


def seed_scenario(db):
    cursor=db.cursor(); base=int(cursor.execute("SELECT dbo.GetSid()").fetchone()[0])
    state=domain.seed_state()
    mapping={key:str(base+int(key)) for table in state["tables"].values() for key in table}
    mapping.update({"37":"80000037","36":"80000036","51":"80000051","61":"80000061","62":"80000062","71":"80000071","72":"80000072","7001":"80007001"})
    for table in (SCHEDULE,EXECUTION):
        for key,source in state["tables"][table].items():
            row=deepcopy(source)
            for field,value in list(row.items()):
                if field.endswith("SID") and str(value) in mapping: row[field]=mapping[str(value)]
            if table==EXECUTION:
                row["EQP_NO"]="TEST-"+row["EQP_NO"]
                row["WO"]="TEST-"+row["WO"]
            insert_synthetic(cursor,table,row)
    db.commit()
    return {key:mapping[key] for key in ("1001","1002","1003","2001","2002","2003","2004")}


def make_bridge():
    expiry=(datetime.now(timezone.utc)+timedelta(minutes=30)).isoformat()
    transport=httpx.MockTransport(lambda request:httpx.Response(200,json={"TokenKey":"synthetic-sql-test-token-with-no-live-value","Expiration":expiry}))
    return MesBridge(MesConfig("https://sql-acceptance.invalid",os.environ["MES_TEST_CONNECTION_STRING"],{"TEST":["schedule","report","mold"]},writes_enabled=True),transport=transport,connect=target_connection)


def run():
    db=target_connection()
    try: ids=seed_scenario(db)
    finally: db.close()
    bridge=make_bridge(); results=[]
    def actor(module): return bridge.resolve_identity("ASP.NET_SessionId=abcdefghijklmnopqrstuvwx",module)
    def command(module,action,args):
        identity=actor(module); preview=bridge.prepare(identity,module,action,args)
        op=str(uuid4()); result=bridge.execute(identity,module,action,args,preview["version"],op)
        results.append({"action":action,"status":result["status"],"operation_id":op,"change_count":len(result["changes"])})
        return identity,preview,result
    args={"execution_id":ids["2001"],"ok":20,"defects":[{"code":"NG01","quantity":2}],"comment":"隔離 SQL 驗收新增"}
    identity,preview,added=command("report","report.add",args)
    replay=bridge.execute(identity,"report","report.add",args,preview["version"],added["operation_id"])
    assert replay["replayed"]
    report_id=next(c["after"] for c in added["changes"] if c["table"]==OUTPUT and c["field"]==PK[OUTPUT])
    command("report","report.update",{"report_id":report_id,"ok":22,"defects":[{"code":"NG02","quantity":1}],"comment":"隔離 SQL 驗收修改"})
    command("report","report.delete",{"report_id":report_id})
    command("report","report.cavities",{"execution_id":ids["2001"],"cavities":4})
    command("report","report.complete",{"schedule_id":ids["1001"]})
    for step in ("mount_start","mount_finish","unmount_start","unmount_finish","clear"):
        command("mold","mold."+step,{"schedule_id":ids["1002"]})
    identity=actor("report"); args={"execution_id":ids["2004"],"cavities":6}
    preview=bridge.prepare(identity,"report","report.cavities",args)
    db=target_connection()
    try:
        db.cursor().execute(f"UPDATE dbo.{EXECUTION} SET OPI_CAV=? WHERE {PK[EXECUTION]}=?",7,ids["2004"]);db.commit()
    finally: db.close()
    try:
        bridge.execute(identity,"report","report.cavities",args,preview["version"],str(uuid4()))
        raise AssertionError("過期快照未拒絕")
    except MesError as exc: assert exc.code=="stale"
    # 真實 SQL Server 的稽核表 trigger 拋錯，驗證業務 UPDATE 隨交易回復。
    db=target_connection()
    try:
        db.cursor().execute("CREATE OR ALTER TRIGGER dbo.ZZ_AI_AGENT_OPERATION_TEST_AUDIT_FAILURE ON dbo.ZZ_AI_AGENT_OPERATION_CHANGE AFTER INSERT AS BEGIN IF SESSION_CONTEXT(N'AI_TEST_FAIL_AUDIT')=1 THROW 51000,N'隔離驗收故障注入',1; END")
        db.commit()
    finally: db.close()
    def failing_connector(write):
        connection=target_connection(write)
        if write: connection.cursor().execute("EXEC sys.sp_set_session_context @key=N'AI_TEST_FAIL_AUDIT',@value=1")
        return connection
    bridge._connector=failing_connector
    identity=actor("report");preview=bridge.prepare(identity,"report","report.cavities",args)
    failed_id=str(uuid4())
    try:
        bridge.execute(identity,"report","report.cavities",args,preview["version"],failed_id)
        raise AssertionError("稽核故障未中止")
    except MesError as exc: assert exc.code=="transaction_failed"
    db=target_connection()
    try:
        cursor=db.cursor()
        assert int(cursor.execute(f"SELECT OPI_CAV FROM dbo.{EXECUTION} WHERE {PK[EXECUTION]}=?",ids["2004"]).fetchone()[0])==7
        assert cursor.execute("SELECT COUNT(*) FROM dbo.ZZ_AI_AGENT_OPERATION_OPERATION WHERE OPERATION_ID=?",failed_id).fetchone()[0]==0
        output={"database":TARGET,"synthetic_only":True,"identity_transport":"HTTP 替身；SEC_USER 對應使用新庫真實 SQL","commands":results,"replay":"通過","stale":"通過","audit_failure_rollback":"通過","source_business_writes":0,"completed_utc":datetime.now(timezone.utc).isoformat()}
    finally: db.rollback();db.close()
    path=ROOT/".local"/"sql-acceptance-result.json";path.write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(output,ensure_ascii=False))


if __name__=="__main__":
    load_dotenv(ROOT/".local"/"sql-test.env")
    parser=argparse.ArgumentParser();parser.add_argument("--provision",action="store_true");parser.add_argument("--setup-owned",action="store_true");parser.add_argument("--run",action="store_true");args=parser.parse_args()
    try:
        if args.provision: provision(); print("已建立新驗收庫與合成主檔")
        if args.setup_owned: setup_schema(os.environ["MES_SOURCE_READONLY_CONNECTION_STRING"]); print("已完成本次新庫的結構設定")
        if args.run: run()
    except Exception as exc:
        # 不輸出底層 ODBC 例外，避免包含連線資訊。具體錯誤由本機受控調試分析。
        print(json.dumps({"status":"failed","exception_type":type(exc).__name__,"code":getattr(exc,"code",None)},ensure_ascii=False));sys.exit(1)
