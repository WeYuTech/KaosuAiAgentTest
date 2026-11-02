"""管理設定、預算與定時唯讀報告的隔離 HTTP 驗收。"""
from datetime import datetime,timezone,timedelta
from concurrent.futures import ThreadPoolExecutor
from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest
from app.main import create_app
from app.store import Store

@pytest.fixture
def setup(tmp_path,monkeypatch):
    from app import model
    monkeypatch.setenv("MES_MODE","simulation")
    monkeypatch.setenv("AI_REPORT_WORKER","0")
    monkeypatch.setenv("AI_TEST_BUDGET_USD","20")
    ledger=Store(tmp_path/'budget.db')
    monkeypatch.setattr(model,"budget_store",lambda:ledger)
    app=create_app(tmp_path/'ops.db')
    with TestClient(app) as c:
        yield c,app,ledger


def test_管理權限版本金鑰與新聊天設定(setup,monkeypatch):
    c,app,ledger=setup
    assert c.get('/api/management').status_code==401
    monkeypatch.setenv('OPENAI_API_KEY','synthetic-never-sent')
    c.post('/api/session/demo',json={'identity':'operator'})
    value=c.get('/api/management').json()
    assert value['write_allowed'] is False and 'synthetic-never-sent' not in str(value)
    update={**value['settings'],'max_tool_rounds':3,'reasoning_effort':'medium'}
    assert c.post('/api/management/settings',json=update).status_code==403
    old=c.post('/api/conversations',json={'module':'report'}).json()
    c.post('/api/session/demo',json={'identity':'supervisor'})
    assert c.post('/api/management/settings',json=update).status_code==200
    assert c.post('/api/management/settings',json=update).status_code==409
    new=c.post('/api/conversations',json={'module':'report'}).json()
    assert old['model_settings']['max_tool_rounds']==5
    assert new['model_settings']['max_tool_rounds']==3
    assert c.post('/api/management/settings',json={**update,'version':1,'model':'unpriced'}).status_code==422
    assert c.post('/api/management/settings',json={**update,'version':1,'api_key':'synthetic'}).status_code==422
    audit=c.get('/api/management/audit').json()['records']
    assert audit[0]['changes'] and 'synthetic-never-sent' not in str(audit)


def test_額度調整保留未知費用且硬上限不能繞過(setup,monkeypatch):
    c,app,ledger=setup
    from app import model
    with ledger.transaction() as db:
        ledger.put(db,'BUDGET','unknown',{'id':'unknown','status':'unknown','reserved_usd':19.99})
    c.post('/api/session/demo',json={'identity':'supervisor'})
    assert c.post('/api/management/budget',json={'version':0,'limit_usd':21,'warning_percent':80}).status_code==422
    saved=c.post('/api/management/budget',json={'version':0,'limit_usd':10,'warning_percent':75})
    assert saved.status_code==200 and saved.json()['budget']['unknown_calls']==1
    assert saved.json()['budget']['reserved_usd']==19.99 and saved.json()['budget']['reached']
    called=[]
    monkeypatch.setattr(model,'OpenAI',lambda **kw:called.append(kw))
    with pytest.raises(HTTPException) as exc: model.invoke({'model':'gpt-6.1-sol'})
    assert exc.value.status_code==429 and not called
    assert c.post('/api/management/budget',json={'version':1,'limit_usd':20,'warning_percent':80}).status_code==200
    assert model.budget_summary()['reserved_usd']==19.99
    monkeypatch.setenv('AI_TEST_BUDGET_USD','5')
    assert model.budget_summary()['limit_usd']==5
    assert c.post('/api/management/budget',json={'version':2,'limit_usd':6,'warning_percent':80}).status_code==422


def create(c,text='每天 08:00 報工 MC37'):
    c.post('/api/session/demo',json={'identity':'operator'})
    spec=c.post('/api/report-schedules/preview',json={'text':text})
    assert spec.status_code==200
    payload={**spec.json(),'client_id':'synthetic-idempotent-creation'}
    result=c.post('/api/report-schedules',json=payload)
    assert result.status_code==200
    return result.json(),payload


def test_報告建立防重送版本及權限(setup):
    c,app,ledger=setup
    job,payload=create(c)
    assert c.post('/api/report-schedules',json=payload).json()['id']==job['id']
    assert c.post('/api/report-schedules',json={**payload,'hour':9}).status_code==409
    path='/api/report-schedules/'+job['id']
    assert c.post(path,json={'version':0,'status':'paused'}).status_code==200
    assert c.post(path,json={'version':0,'status':'active'}).status_code==409
    assert c.post(path,json={'version':1,'status':'active'}).status_code==200
    c.post('/api/session/demo',json={'identity':'planner'})
    assert c.get('/api/report-schedules').json()['records']==[]
    assert c.get(path+'/runs').status_code==404
    assert c.post(path,json={'version':2,'status':'deleted'}).status_code==404
    assert c.post('/api/report-schedules',json={**payload,'client_id':'another-unique-identifier'}).status_code==403


def test_定時執行唯一領取及失敗不冒充零產出(setup):
    c,app,ledger=setup
    job,_=create(c)
    calls=[]
    def query(job,filters):
        calls.append(filters)
        return {'records':[{'EQP_NO':'MC37','MANUAL_OK_QTY':120,'IOT_OK_QTY':None}],'total':1}
    app.state.reports.query=query
    due=datetime.fromisoformat(job['next_run_at'])
    with ThreadPoolExecutor() as pool: list(pool.map(app.state.reports.tick,[due,due]))
    runs=c.get('/api/report-schedules/'+job['id']+'/runs').json()['records']
    assert len(calls)==1 and len(runs)==1 and runs[0]['status']=='completed'
    assert runs[0]['report']['records'][0]['IOT_OK_QTY'] is None
    assert calls[0]['date']==(due.astimezone(timezone(timedelta(hours=7))).date()-timedelta(days=1)).isoformat()
    def denied(*_): raise HTTPException(403,'含敏感診斷不可回傳')
    app.state.reports.query=denied
    next_job=c.get('/api/report-schedules').json()['records'][0]
    next_due=datetime.fromisoformat(next_job['next_run_at'])
    app.state.reports.tick(next_due);app.state.reports.tick(next_due)
    runs=c.get('/api/report-schedules/'+job['id']+'/runs').json()['records']
    assert len(runs)==2 and runs[0]['status']=='failed' and runs[0]['report'] is None
    assert '含敏感診斷' not in str(runs)


def test_服務錯過時間不補跑且刪除保留報告(setup):
    c,app,ledger=setup
    job,_=create(c)
    def never(*_): pytest.fail('錯過時間不得查詢')
    app.state.reports.query=never
    app.state.reports.tick(datetime.fromisoformat(job['next_run_at'])+timedelta(hours=1))
    path='/api/report-schedules/'+job['id']
    assert c.get(path+'/runs').json()['records'][0]['status']=='missed'
    assert c.post(path,json={'version':0,'status':'deleted'}).status_code==200
    assert c.get('/api/report-schedules').json()['records']==[]
    assert c.get(path+'/runs').json()['records'][0]['status']=='missed'


def test_自然語言解析不猜模糊時間及三語範圍(setup):
    c,_,_=setup
    c.post('/api/session/demo',json={'identity':'supervisor'})
    for text in ['每天早上幫我報告','每天 08:00 和 09:00 報工','每天 08:00 報工 MC37 MC38','每天 08:00 報工及模具']:
        assert c.post('/api/report-schedules/preview',json={'text':text}).status_code==422
    for text in ['weekdays 08:00 report MC37','ทุกวัน 08:00 ผลผลิต MC37']:
        assert c.post('/api/report-schedules/preview',json={'text':text}).json()['equipment']=='MC37'


def test_正式報告每次重驗啟用與模組授權(monkeypatch):
    from test_mes_http import bridge_for_identity
    from app.mes import MesError
    bridge,db,_=bridge_for_identity()
    snapshots=[]
    def snapshot(actor,module,filters):
        bridge._authorize(actor,module)
        snapshots.append(actor)
        return {'records':[]}
    monkeypatch.setattr(bridge,'snapshot',snapshot)
    assert bridge.scheduled_snapshot('TEST','1','report',{})=={'records':[]}
    assert db.calls[-1][1]==('TEST','1','Y')
    db.rows=[]
    with pytest.raises(MesError): bridge.scheduled_snapshot('TEST','1','report',{})
    with pytest.raises(MesError): bridge.scheduled_snapshot('TEST','1','schedule',{})
    assert len(snapshots)==1


def test_模型實際使用新聊天設定且舊聊天維持原值(setup,monkeypatch):
    from app import model
    from test_live_dialogue_validation import model_tool
    c,_,_=setup
    monkeypatch.setattr('app.intents.classify',lambda *_:{'intent':'readonly','module':'report'})
    monkeypatch.setenv('OPENAI_API_KEY','synthetic-no-network')
    c.post('/api/session/demo',json={'identity':'supervisor'})
    old=c.post('/api/conversations',json={'module':'report'}).json()
    cfg=c.get('/api/management').json()['settings']
    assert c.post('/api/management/settings',json={**cfg,'reasoning_effort':'medium','max_tool_rounds':2}).status_code==200
    new=c.post('/api/conversations',json={'module':'report'}).json()
    calls=[]
    def fake(payload):
        calls.append(payload)
        return model_tool('query_workspace',{'execution_id':'2001'},len(calls))
    monkeypatch.setattr(model,'invoke',fake)
    assert c.post('/api/conversations/'+new['id']+'/messages',json={'text':'查詢 MC37'}).status_code==200
    assert len(calls)==2 and all(p['reasoning']['effort']=='medium' for p in calls)
    calls.clear()
    assert c.post('/api/conversations/'+old['id']+'/messages',json={'text':'查詢 MC37'}).status_code==200
    assert len(calls)==5 and all(p['reasoning']['effort']=='low' for p in calls)


def test_併發模型預留不能突破調整後額度(setup,monkeypatch):
    from threading import Event
    from types import SimpleNamespace
    from app import model
    c,_,_=setup
    c.post('/api/session/demo',json={'identity':'supervisor'})
    assert c.post('/api/management/budget',json={'version':0,'limit_usd':0.05,'warning_percent':80}).status_code==200
    entered,release=Event(),Event()
    def response(**_):
        entered.set();assert release.wait(5)
        return SimpleNamespace(usage=SimpleNamespace(input_tokens=100,output_tokens=100))
    monkeypatch.setenv('OPENAI_API_KEY','synthetic-no-network')
    monkeypatch.setattr(model,'OpenAI',lambda **_:SimpleNamespace(responses=SimpleNamespace(create=response)))
    with ThreadPoolExecutor() as pool:
        first=pool.submit(model.invoke,{'model':'gpt-6.1-sol'})
        try:
            assert entered.wait(3)
            with pytest.raises(HTTPException) as exc: model.invoke({'model':'gpt-6.1-sol'})
            assert exc.value.status_code==429
        finally: release.set()
        first.result()
    assert model.budget_summary()['calls']==1


@pytest.mark.parametrize("text,frequency", [
    ("每天 08:00 產生 MC37 的報工報告", "daily"),
    ("For example: Every day at 08:00 generate a production report for MC37", "daily"),
    ("ตัวอย่าง: ทุกวัน 08:00 สร้างรายงานผลผลิต MC37", "daily"),
    ("週一至週五 08:00 產生 MC37 的報工報告", "weekdays"),
    ("Weekdays at 08:00 generate a production report for MC37", "weekdays"),
    ("วันจันทร์ถึงศุกร์ 08:00 สร้างรายงานผลผลิต MC37", "weekdays"),
])
def test_新版報告提示三語經公開預覽介面解析(setup,text,frequency):
    c,_,_=setup
    c.post('/api/session/demo',json={'identity':'supervisor'})
    result=c.post('/api/report-schedules/preview',json={'text':text})
    assert result.status_code==200
    spec=result.json()
    assert (spec['module'],spec['equipment'],spec['hour'],spec['minute'],spec['frequency'])==('report','MC37',8,0,frequency)
    assert c.get('/api/report-schedules').json()['records']==[]
