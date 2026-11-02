"""第 34 項隔離驗收：每次使用新資料庫；分類與模型回覆均為 fixture。"""
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
    database = Path(os.environ['ISSUE34_FIXTURE_DB'])
    if database.exists():
        raise RuntimeError('必須使用新的 fixture DB，不可沿用既有資料。')
    model.budget_store = lambda: Store(database.with_name('fixture-budget.db'))
    model.invoke = lambda payload: SimpleNamespace(output=[], output_text='模擬分類：唯讀查詢已完成；此段沒有模型呼叫，也未寫入 MES。')
    app = create_app(database, intent_classifier=lambda conversation: {'intent':'readonly','module':'report'})
    with app.state.store.transaction() as db:
        app.state.store.put(db, 'STATE', 'simulation', fixture_state())
        job = dict(id='fixture-report', kind='report_schedule', actor_id='DEMO_SUPERVISOR',
                   title='MC37 每日報工摘要', module='report', equipment='MC37', frequency='daily',
                   hour=8, minute=0, version=0, status='active', next_run_at='2026-11-04T01:00:00+00:00')
        app.state.store.put(db, 'STATE', job['id'], job)
        # 僅使用後端實際存在的狀態。超出查詢範圍會被後端收斂為 failed，沒有額度超限狀態。
        for i, status in enumerate(('completed','running','failed','missed','interrupted')):
            run = dict(id=f'fixture-run-{i}', kind='report_run', schedule_id=job['id'],
                       actor_id=job['actor_id'], module='report', status=status,
                       due_at=f'2026-11-0{3-i}T01:00:00+00:00' if i<3 else f'2026-10-{34-i}T01:00:00+00:00', report=None)
            if status=='completed':
                run['report']=dict(title=job['title'], date='2026-11-02', records=[{'EQP_NO':'MC37','WO':'WO-A','OK_QTY':120}], record_count=1)
            if status=='failed':
                run['message']='查詢或權限驗證未完成；沒有可確認的報告，不會自動重送。'
            if status=='missed': run['message']='服務未於原訂時間執行，未補跑。'
            if status=='interrupted': run['message']='服務中斷，報告未完成；未自動重送。'
            app.state.store.put(db, 'STATE', run['id'], run)
    app.mount('/', StaticFiles(directory=ROOT/'frontend/dist', html=True))
    return app

if __name__=='__main__':
    import uvicorn
    uvicorn.run(create_preview(), host='127.0.0.1', port=int(os.environ.get('ISSUE34_PORT','8044')), access_log=False)
