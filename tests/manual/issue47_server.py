"""第47項驗收：乾淨隔離庫；真實模型最多一則，沿用累計帳本，不碰正式 MES。"""
import os, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))

def create_preview():
    if os.getenv('ISSUE47_REAL')!='1':
        os.environ['ISSUE44_FIXTURE_DB']=os.environ['ISSUE47_DB']
        from issue44_ui_server import create_preview as fixture
        app=fixture()
        if os.getenv('ISSUE47_MARKDOWN')=='1':
            import json
            from types import SimpleNamespace
            from app import model
            from app.streaming import active
            from issue44_ui_server import pause
            def markdown_response(payload):
                outputs=[x for x in payload['input'] if x.get('type')=='function_call_output']
                pause(2.2)
                if not outputs:
                    data={'type':'function_call','name':'query_workspace','arguments':json.dumps({'equipment':'MC37'}),'call_id':'markdown-fixture'}
                    return SimpleNamespace(output=[SimpleNamespace(**data,model_dump=lambda **_:data)])
                parts=['### MC37 工單與人工報工數量\n\n','| 工單 | 人工良品 |','\n| --- | --- |\n| WO-A | 100 |\n','| WO-B | 120 |\n\n僅查詢，沒有變更作業。']
                for part in parts:
                    pause(.7);active.get().emit('delta',text=part)
                pause(3)
                return SimpleNamespace(output=[],output_text=''.join(parts))
            model.invoke=markdown_response
        return app
    from dotenv import load_dotenv
    load_dotenv(ROOT/'.env',override=True)
    os.environ.update(MES_MODE='simulation',AI_REPORT_WORKER='0',MES_SQL_ACCEPTANCE='0')
    from app import model,domain
    from app.main import create_app
    from fastapi.responses import JSONResponse
    from fastapi.staticfiles import StaticFiles
    path=Path(os.environ['ISSUE47_DB'])
    if path.exists():raise RuntimeError('必須使用全新隔離庫')
    baseline=model.budget_summary()
    if baseline['limit_usd']!=20:raise RuntimeError('額度須為既有20美元，不調整設定')
    initial=baseline['spent_usd']+baseline['reserved_usd']
    cap=model.effective_cap
    # 本次預留亦計入，僅收緊到0.10美元；既有累計帳本與20美元上限不變。
    model.effective_cap=lambda db,store:min(cap(db,store),initial+.10)
    ledger=model.budget_store()
    with ledger.transaction() as db:original_ids={r['id'] for r in ledger.all(db,'BUDGET')}
    app=create_app(path)
    with app.state.store.transaction() as db:app.state.store.put(db,'STATE','simulation',domain.seed_state())
    sent=0
    @app.middleware('http')
    async def limits(request,call_next):
        nonlocal sent
        route=request.url.path
        if request.method=='POST' and route.endswith(('/messages','/messages/start')):
            if sent>=1:return JSONResponse({'detail':'已達一則訊息上限'},status_code=429)
            sent+=1
        if request.method!='GET' and ('/proposals/' in route or '/management/' in route):
            return JSONResponse({'detail':'禁止確認寫入或變更設定'},status_code=403)
        return await call_next(request)
    @app.get('/test-evidence')
    def evidence():
        with app.state.store.transaction() as db:
            unchanged=app.state.store.get(db,'STATE','simulation')==domain.seed_state()
            proposals=app.state.store.all(db,'PROPOSAL')
        with ledger.transaction() as db:
            calls=[{k:r[k] for k in ('model','status','reserved_usd','actual_usd') if k in r} for r in ledger.all(db,'BUDGET') if r['id'] not in original_ids]
        return {'baseline':baseline,'budget':model.budget_summary(),'messages':sent,'business_unchanged':unchanged,'proposals':len(proposals),'calls':calls}
    app.mount('/',StaticFiles(directory=ROOT/'frontend/dist',html=True))
    return app

if __name__=='__main__':
    import uvicorn
    uvicorn.run(create_preview(),host='127.0.0.1',port=8070,access_log=False,workers=1)
