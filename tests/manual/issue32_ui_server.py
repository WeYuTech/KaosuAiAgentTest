"""第 32 項 UI fixture／模擬分類；僅測畫面，不是真實模型驗收。"""
import asyncio
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
os.environ.update(MES_MODE='simulation', OPENAI_API_KEY='synthetic-offline-fixture', AI_TEST_BUDGET_USD='0', MES_SQL_ACCEPTANCE='0')
from app import domain, model
from app.main import create_app
from app.store import Store
from fastapi.staticfiles import StaticFiles


def classify_fixture(conversation):
    text = conversation['messages'][-1]['content']
    if text in ('你好', '測試'):
        return {'intent': 'greeting', 'module': 'none'}
    if text == '你能幫我做什麼？':
        return {'intent': 'capabilities', 'module': 'none'}
    if text == '查 MC37 今天的工單':
        return {'intent': 'readonly', 'module': 'report'}
    if text == '我要報工，MC37 良品 125，不良 3 個刮傷':
        return {'intent': 'change', 'module': 'report'}
    return {'intent': 'unsupported', 'module': 'none'}


def create_preview():
    model.budget_store = lambda: Store(ROOT / '.local/issue32-budget.db')

    def response(payload):
        inputs = payload['input']
        text = next(item['content'] for item in reversed(inputs) if item.get('role') == 'user')
        outputs = [item for item in inputs if item.get('type') == 'function_call_output']
        if not outputs:
            name, args = 'query_workspace', {'equipment':'MC37', 'date':'2026-11-02'}
        elif '我要報工' in text and len(outputs) == 1:
            records = json.loads(outputs[0]['output'])['records']
            assert len(records) == 1, 'fixture 必須明確且唯一，不能猜第一筆目標'
            guide = json.loads(payload['instructions'].split('目前引導草稿（內容未通過業務驗證）：')[1].split('\n')[0])
            name, args = 'update_operation_draft', {'version':guide['version'], 'action':'report.add', 'step':'details', 'args':{'execution_id':records[0]['WIP_OPI_WDOEACICO_HIST_SID'], 'ok':125, 'defects':[{'code':'NG01','quantity':3}]}}
        else:
            if '我要報工' in text:
                assert json.loads(outputs[-1]['output']).get('ready'), outputs[-1]['output']
            content = '找到 1 筆 MC37 工單。可以查看資料，或繼續描述想完成的作業。' if '我要報工' not in text else '已帶入 MC37 的唯一工單，人工良品 125、刮傷 3。請檢查右側作業單，再進入核對；尚未寫入。'
            return SimpleNamespace(output=[], output_text=content)
        data = {'type':'function_call', 'name':name, 'arguments':json.dumps(args), 'call_id':f'fixture-{len(outputs)}'}
        return SimpleNamespace(output=[SimpleNamespace(**data, model_dump=lambda **_: data)])

    model.invoke = response
    app = create_app(ROOT / '.local/issue32-preview.db', intent_classifier=classify_fixture)
    with app.state.store.transaction() as db:
        if not app.state.store.get(db, 'STATE', 'simulation'):
            state = json.dumps(domain.seed_state(), ensure_ascii=False)
            for before, after in [('WO-A','WO-261102-0382'), ('EPS-A','P-102'), ('模擬左側緩衝件','外殼'), ('缺料','刮傷'), ('2026-10-30','2026-11-02')]:
                state = state.replace(before, after)
            state = json.loads(state)
            # 這段錄影刻意只有一筆可報工對象；多候選視窗屬下一段。
            state['tables'][domain.EXECUTION] = {key:value for key,value in state['tables'][domain.EXECUTION].items() if key == '2001'}
            app.state.store.put(db, 'STATE', 'simulation', state)

    # 用公開 API 準備足夠的聊天列，以檢查左對齊與底列不被頁尾遮住。
    from fastapi.testclient import TestClient
    with TestClient(app) as client:
        client.post('/api/session/demo', json={'identity':'operator'}).raise_for_status()
        titles = ['每日生產追蹤','本週排程調整','MC37 今日生產','新增人工報工','模具上下模','查詢昨日產量','排程工單確認','生產異常追蹤','本週工單進度','修改報工數量','MC38 生產資料','模穴數調整']
        existing = {row['title'] for row in client.get('/api/conversations').json()['records']}
        for title in reversed(titles):
            if title not in existing:
                chat = client.post('/api/conversations', json={'module':'report'}).json()
                client.post(f'/api/conversations/{chat["id"]}/metadata', json={'version':0,'title':title,'is_pinned':title in titles[:2]}).raise_for_status()

    @app.middleware('http')
    async def delay(request, call_next):
        if request.method == 'POST' and request.url.path.endswith(('/messages','/query')):
            await asyncio.sleep(2.5)
        return await call_next(request)

    app.mount('/', StaticFiles(directory=ROOT / 'frontend/dist', html=True))
    return app


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(create_preview(), host='127.0.0.1', port=8035, access_log=False)
