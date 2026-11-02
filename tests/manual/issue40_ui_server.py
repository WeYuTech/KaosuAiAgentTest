"""第 40 項隔離驗收：每次使用新資料庫；分類與模型回覆均為 fixture。"""
import os
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from issue37_ui_server import fixture_state
os.environ.update(MES_MODE='simulation', OPENAI_API_KEY='synthetic-offline-fixture',
                  AI_TEST_BUDGET_USD='20', AI_REPORT_WORKER='0', MES_SQL_ACCEPTANCE='0')
from app import model
from app.main import create_app
from app.store import Store
from fastapi.staticfiles import StaticFiles

def create_preview():
    database = Path(os.environ['ISSUE40_FIXTURE_DB'])
    if database.exists():
        raise RuntimeError('必須使用新的 fixture DB，不可沿用既有資料。')
    model.budget_store = lambda: Store(database.with_name('fixture-budget.db'))
    model.invoke = lambda payload: SimpleNamespace(output=[], output_text='已完成查詢，請核對工單與設備資料。')
    app = create_app(database, intent_classifier=lambda conversation: {'intent':'readonly','module':'report'})
    with app.state.store.transaction() as db:
        app.state.store.put(db, 'STATE', 'simulation', fixture_state())
    # 只存在於手動驗收伺服器：調整隔離 DB 的時間／結果，不連線正式 MES。
    from fastapi import Request
    @app.post('/fixture/control')
    async def control(request: Request):
        command=await request.json()
        with app.state.store.transaction() as db:
            if command['kind']=='proposal':
                value=app.state.store.get(db,'PROPOSAL',command['id'])
                value.update(command['patch'])
                app.state.store.put(db,'PROPOSAL',value['id'],value)
            elif command['kind']=='messages':
                value=app.state.store.get(db,'CONVERSATION',command['id'])
                value['messages']=command['messages']
                app.state.store.put(db,'CONVERSATION',value['id'],value)
        return {'fixture':True}
    app.mount('/', StaticFiles(directory=ROOT/'frontend/dist', html=True))
    return app

if __name__=='__main__':
    import uvicorn
    uvicorn.run(create_preview(), host='127.0.0.1', port=int(os.environ.get('ISSUE40_PORT','8045')), access_log=False)
