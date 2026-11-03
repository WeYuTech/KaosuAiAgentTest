"""第44項隔離驗收：延遲、分類、文字片段均為伺服器 fixture；實際查詢與卡控仍走產品。"""
import json
import os
import sys
import time
from pathlib import Path
from types import SimpleNamespace
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
os.environ.update(MES_MODE='simulation',OPENAI_API_KEY='synthetic-offline-fixture',AI_TEST_BUDGET_USD='20',AI_REPORT_WORKER='0',MES_SQL_ACCEPTANCE='0')
from app import model
from app.main import create_app
from app.streaming import active,check
from app.store import Store
from fastapi.staticfiles import StaticFiles
from issue37_ui_server import fixture_state


def pause(seconds):
    for _ in range(int(seconds*10)):
        time.sleep(.1);check()


def create_preview():
    path=Path(os.environ['ISSUE44_FIXTURE_DB'])
    if path.exists():raise RuntimeError('必須使用乾淨 fixture DB')
    model.budget_store=lambda:Store(path.with_name('fixture-budget.db'))
    def classifier(conversation):
        pause(.6)
        return {'intent':'change' if '100' in conversation['messages'][-1]['content'] else 'readonly','module':'report'}
    def response(payload):
        outputs=[x for x in payload['input'] if x.get('type')=='function_call_output']
        text=' '.join(x.get('content','') for x in payload['input'] if x.get('role')=='user')
        pause(2.2)
        from fastapi import HTTPException
        if "429" in text:raise HTTPException(429,"隔離預算不足")
        if "502" in text:raise HTTPException(502,"隔離模型失敗")
        def tool(name,args):
            data={'type':'function_call','name':name,'arguments':json.dumps(args),'call_id':'offline-'+str(len(outputs))}
            return SimpleNamespace(output=[SimpleNamespace(**data,model_dump=lambda **_:data)])
        if not outputs:return tool('query_workspace',{'equipment':'MC37','wo':'WO-A','page':1})
        if '100' in text:return tool('prepare_report_add',{'execution_id':'2001','ok':100,'defects':[]})
        locale=active.get().locale if active.get() else 'zh-TW'
        parts={'zh-TW':['已查詢 MC37。','\n工單 WO-A，品號 EPS-A。','\n這是資料查詢，沒有變更作業。'],'en':['MC37 records retrieved.','\nWork order WO-A, part EPS-A.','\nThis is a read-only query; no operation was changed.'],'th':['ค้นหาข้อมูล MC37 แล้ว','\nใบสั่งผลิต WO-A ชิ้นงาน EPS-A','\nเป็นการค้นหาเท่านั้น ไม่มีการเปลี่ยนแปลงงาน']}[locale]
        for part in parts:
            pause(.7)
            if active.get():active.get().emit('delta',text=part)
        return SimpleNamespace(output=[],output_text=''.join(parts))
    model.invoke=response
    app=create_app(path,intent_classifier=classifier)
    with app.state.store.transaction() as db:app.state.store.put(db,'STATE','simulation',fixture_state())
    app.mount('/',StaticFiles(directory=ROOT/'frontend/dist',html=True))
    return app

if __name__=='__main__':
    import uvicorn
    uvicorn.run(create_preview(),host='127.0.0.1',port=int(os.environ.get('ISSUE44_PORT','8064')),access_log=False)
