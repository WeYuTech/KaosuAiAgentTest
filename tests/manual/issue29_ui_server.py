"""Issue #29 同資料視覺驗收：隔離資料及固定模型替身，不連正式 MES、不計真實模型證據。"""
import json
import asyncio
import os
from pathlib import Path
import sys
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
os.environ.update(MES_MODE='simulation', OPENAI_API_KEY='synthetic-offline-fixture', AI_TEST_BUDGET_USD='0', MES_SQL_ACCEPTANCE='0')
from app.main import create_app
from app import domain, model
from app.store import Store
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse

PORT=int(os.environ.get('ISSUE29_PORT','8033'))
SUFFIX='' if PORT==8033 else f'-{PORT}'


def fixture():
    data = json.dumps(domain.seed_state(), ensure_ascii=False)
    for before, after in [('WO-A','WO-261102-0382'),('EPS-A','P-102'),('模擬左側緩衝件','外殼'),('缺料','刮傷'),('2026-10-30','2026-11-02')]:
        data = data.replace(before, after)
    return json.loads(data)


def create_preview():
    model.budget_store = lambda: Store(ROOT/'.local/issue29-budget.db')
    def fixture_response(payload):
        # 明示的查詢情境腳本，只供 UI 契約驗收；不作模型理解能力證據。
        inputs = payload.get('input', [])
        text = next((item.get('content','') for item in reversed(inputs) if item.get('role')=='user'), '')
        if text == '只看 MC38 今天的工單' and inputs[-1].get('type') != 'function_call_output':
            data = {'type':'function_call','name':'query_workspace','arguments':json.dumps({'equipment':'MC38','date':'2026-11-02'}),'call_id':'isolated-query'}
            return SimpleNamespace(output=[SimpleNamespace(**data,model_dump=lambda **_: data)])
        return SimpleNamespace(output=[],output_text='隔離替身驗收：查詢與說明不修改已套用工單、數量或確認卡。')
    model.invoke = fixture_response
    app = create_app(ROOT/f'.local/issue29-preview{SUFFIX}.db', intent_classifier=lambda _: {'intent':'readonly'})
    with app.state.store.transaction() as db:
        if not app.state.store.get(db,'STATE','simulation'):
            app.state.store.put(db,'STATE','simulation',fixture())
    @app.middleware('http')
    async def trace(request, call_next):
        flag=ROOT/f'.local/issue29-fault{SUFFIX}.txt'
        fault=flag.read_text(encoding='utf-8-sig').strip() if flag.exists() else ''
        if fault=='save-fail' and request.method=='POST' and request.url.path.endswith('/guide'):
            return JSONResponse({'message':'隔離驗收：保存服務暫時不可用'},status_code=503)
        if fault=='slow-query' and request.url.path.endswith('/query'):
            await asyncio.sleep(1)
        response = await call_next(request)
        with (ROOT/f'.local/issue29-http{SUFFIX}.jsonl').open('a',encoding='utf-8') as out:
            out.write(json.dumps({'method':request.method,'path':request.url.path,'status':response.status_code})+'\n')
        return response
    @app.get('/host',response_class=HTMLResponse)
    def host():
        return '<!doctype html><html lang="zh-Hant"><meta charset="UTF-8"><title>隔離 MES 宿主驗收</title><h1>隔離 MES 宿主</h1><p>使用產品原 widget-loader、同源 iframe；沒有正式 MES 寫入。</p><script src="/widget-loader.js" data-assistant-url="/"></script></html>'
    @app.get('/comparison', response_class=HTMLResponse)
    def comparison():
        # 只約束展示外框，凍結檔與其流程、內部欄位樣式皆保持原樣。
        source = (ROOT/'docs/design/dual-flow-20261102/reference.html').read_text(encoding='utf-8')
        sizing = '<style>#mes-flow-choices{max-width:1054px;width:1054px}#mes-flow-choices .mf-app{min-height:0;border:0;border-radius:0}#mes-flow-choices .mf-app .mf-header{display:none}#mes-flow-choices .mf-app .mf-screen{min-height:0;height:618px;overflow:auto}#mes-flow-choices .mf-app .mf-split{min-height:618px}</style>'
        return source.replace('</body>', sizing+'</body>')
    app.mount('/reference', StaticFiles(directory=ROOT/'docs/design/dual-flow-20261102',html=True))
    app.mount('/', StaticFiles(directory=ROOT/'frontend/dist',html=True))
    return app


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(create_preview(), host='127.0.0.1', port=PORT, access_log=False)
