"""第 33 項畫面 fixture／模擬分類，不是真實模型驗收；僅隔離資料。"""
import asyncio
import json
import os
import sys
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
os.environ.update(MES_MODE='simulation', OPENAI_API_KEY='synthetic-offline-fixture', AI_TEST_BUDGET_USD='0', MES_SQL_ACCEPTANCE='0')
from app import domain, model
from app.main import create_app
from app.store import Store
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse


def classify_fixture(conversation):
    text = conversation['messages'][-1]['content']
    if text == '只看 MC38':
        return {'intent':'readonly','module':'report'}
    if text == '準備 MC37 的 WO-A 報工，良品 125，沒有不良':
        return {'intent':'change','module':'report'}
    return {'intent':'unsupported','module':'none'}


def fixture_state():
    state = domain.seed_state()
    state = json.loads(json.dumps(state,ensure_ascii=False).replace('2026-10-30','2026-11-02'))
    tables=state['tables']
    tables['EQP_MASTER']['38']={**tables['EQP_MASTER']['37'],'EQP_SID':'38','EQP_NO':'MC38','EQP_NAME':'隔離成型機 38'}
    # 30 筆額外執行紀錄：公開查詢依預設每頁 20 筆真實分頁。
    for i in range(30):
        sid,did,eid,wid=map(str,(1200+i,3200+i,4200+i,5200+i))
        eqp='37' if i<25 else '38'
        wo=f'WO-261102-{i+401:04d}'
        tables[domain.SCHEDULE][sid]={**deepcopy(tables[domain.SCHEDULE]['1002']),'ZZ_KAOSU_PROD_SCHEDULE_SID':sid,'EQP_SID':eqp}
        tables[domain.DETAIL][did]={**deepcopy(tables[domain.DETAIL]['1103']),'ZZ_KAOSU_PROD_SCHEDULE_SID':sid,'ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID':did,'WO_SID':wid}
        tables[domain.EXECUTION][eid]={**deepcopy(tables[domain.EXECUTION]['2001']),'WIP_OPI_WDOEACICO_HIST_SID':eid,'ZZ_KAOSU_PROD_SCHEDULE_SID':sid,'ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID':did,'EQP_NO':'MC'+eqp,'WO':wo}
        state['catalogs']['work_orders'].append({'WO_SID':wid,'WO':wo,'PART_NO':'EPS-A','WO_QTY':1000})
        state['iot'][eid]=None
    # 第一張排程已開始下模；第二張待上模。時間仍由實際 preview 產生。
    for eid in ('2001','2002'):
        tables[domain.EXECUTION][eid]['ZZ_MODLE_REMOVE_START']='2026-11-02 09:00:00'
    for eid,row in tables[domain.EXECUTION].items():
        for n in range(2):
            rid=str(6000+int(eid)*2+n)
            tables[domain.OUTPUT][rid]={'WIP_OPI_WDOEACICOOUTPUT_HIST_SID':rid,'WIP_OPI_WDOEACICO_HIST_SID':eid,'OK_QTY':100+n*20,'NG_QTY':0,'ENABLE_FLAG':'Y','CREATE_TIME':f'2026-11-02 {10+n}:00:00','COMMENT':'隔離既有報工'}
    return state


def create_preview():
    model.budget_store=lambda:Store(ROOT/'.local/issue33-budget.db')
    def response(payload):
        inputs=payload['input']
        text=next(item['content'] for item in reversed(inputs) if item.get('role')=='user')
        outputs=[item for item in inputs if item.get('type')=='function_call_output']
        if not outputs:
            name,args='query_workspace',({'equipment':'MC38','page':1,'search':None,'wo':None,'execution_id':None} if text=='只看 MC38' else {'equipment':'MC37','wo':'WO-A','page':1})
        elif text.startswith('準備 MC37') and len(outputs)==1:
            matches=[row for row in json.loads(outputs[0]['output'])['records'] if row['WIP_OPI_WDOEACICO_HIST_SID']=='2001']
            assert len(matches)==1
            guide=json.loads(payload['instructions'].split('目前引導草稿（內容未通過業務驗證）：')[1].split('\n')[0])
            name,args='update_operation_draft',{'version':guide['version'],'action':'report.add','step':'details','args':{'execution_id':matches[0]['WIP_OPI_WDOEACICO_HIST_SID'],'ok':125,'defects':[]}}
        else:
            content='已改為只看 MC38；原作業與確認內容保留，請重新選取對象。' if text=='只看 MC38' else '已帶入 MC37／WO-A，人工良品 125、沒有不良。可選擇／更換對象；尚未寫入。'
            return SimpleNamespace(output=[],output_text=content)
        data={'type':'function_call','name':name,'arguments':json.dumps(args),'call_id':f'fixture-{len(outputs)}'}
        return SimpleNamespace(output=[SimpleNamespace(**data,model_dump=lambda **_:data)])
    model.invoke=response
    app=create_app(Path(os.environ.get('ISSUE33_FIXTURE_DB',str(ROOT/'.local/issue33-preview.db'))),intent_classifier=classify_fixture)
    with app.state.store.transaction() as db:
        if not app.state.store.get(db,'STATE','simulation'):
            app.state.store.put(db,'STATE','simulation',fixture_state())
    @app.middleware('http')
    async def delay(request,call_next):
        if request.url.path=='/api/candidates' or request.url.path.endswith('/query') or request.url.path.endswith('/messages'):
            if request.method=='POST' or request.url.path=='/api/candidates':
                await asyncio.sleep(2.5)
            if request.url.path.endswith('/query') and request.method=='POST':
                body=await request.json()
                if '模擬查詢失敗' in body.get('filters',{}).values():
                    return JSONResponse(status_code=503,content={'detail':'候選查詢暫時失敗，請調整條件再查詢。'})
        return await call_next(request)
    app.mount('/',StaticFiles(directory=ROOT/'frontend/dist',html=True))
    return app

if __name__=='__main__':
    import uvicorn
    uvicorn.run(create_preview(),host='127.0.0.1',port=int(os.environ.get('ISSUE33_PORT','8037')),access_log=False)
