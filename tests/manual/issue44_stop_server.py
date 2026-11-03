"""第44項真實模型煙霧：隔離業務資料、原帳本、僅追加一則停止驗收及0.10美元。"""
import os
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
from dotenv import load_dotenv
load_dotenv(ROOT/'.env',override=True)
os.environ.update(MES_MODE='simulation',AI_REPORT_WORKER='0',MES_SQL_ACCEPTANCE='0')
from app import model,domain
from app.main import create_app
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

def create_preview():
    path=Path(os.environ['ISSUE44_STOP_DB'])
    if path.exists():raise RuntimeError('必須使用全新隔離資料庫')
    baseline=model.budget_summary()
    if baseline['limit_usd']!=20:raise RuntimeError('有效額度須為已授權的20美元；不修改設定')
    initial=baseline['spent_usd']+baseline['reserved_usd']
    original_cap=model.effective_cap
    # 只在本測試程序收緊每次產品預留檢查，不寫入設定，不替換或清除帳本。
    model.effective_cap=lambda db,store:min(original_cap(db,store),initial+0.10)
    from contextlib import contextmanager
    import time
    from app.streaming import Work
    observed=[]
    real_watch=model.watch_stream
    @contextmanager
    def watch(events):
        close=events.close
        def recorded_close():
            result=close()
            observed.append({'kind':'upstream_closed','at':time.monotonic()})
            return result
        events.close=recorded_close
        with real_watch(events):yield
    model.watch_stream=watch
    emit=Work.emit
    def recorded_emit(work,kind,**data):
        if kind in ('delta','stopped'):
            observed.append({'kind':kind,'at':time.monotonic()})
        return emit(work,kind,**data)
    Work.emit=recorded_emit
    ledger=model.budget_store()
    with ledger.transaction() as db:
        original_ids={r['id'] for r in ledger.all(db,'BUDGET')}
    app=create_app(path)
    with app.state.store.transaction() as db:
        app.state.store.put(db,'STATE','simulation',domain.seed_state())
    sent=0
    @app.middleware('http')
    async def limits(request,call_next):
        nonlocal sent
        route=request.url.path
        if request.method=='POST' and route.endswith(('/messages','/messages/stream')):
            if sent>=1:return JSONResponse({'detail':'已達一則訊息上限'},status_code=429)
            sent+=1
        if request.method!='GET' and ('/proposals/' in route or '/management/' in route):
            return JSONResponse({'detail':'煙霧測試禁止確認寫入或管理設定變更'},status_code=403)
        return await call_next(request)
    @app.get('/test-evidence')
    def evidence():
        current=model.budget_summary()
        with app.state.store.transaction() as db:
            unchanged=app.state.store.get(db,'STATE','simulation')==domain.seed_state()
        with ledger.transaction() as db:
            calls=[{k:r[k] for k in ('model','status','reserved_usd','actual_usd') if k in r} for r in ledger.all(db,'BUDGET') if r['id'] not in original_ids]
        return {'baseline':baseline,'budget':current,'messages':sent,'business_unchanged':unchanged,'observed':observed,'calls':calls}
    app.mount('/',StaticFiles(directory=ROOT/'frontend/dist',html=True))
    return app
if __name__=='__main__':
    import uvicorn
    uvicorn.run(create_preview(),host='127.0.0.1',port=8067,access_log=False)
