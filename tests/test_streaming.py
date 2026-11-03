"""串流契約使用隔離資料及離線模型，沒有正式寫入或付費呼叫。"""
import json
import time
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.store import Store
from app.streaming import active, tracked, check, Work


def setup(client):
    client.post('/api/session/demo', json={'identity':'operator'})
    return client.post('/api/conversations', json={'module':'report'}).json()['id']


def events(response):
    return [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]


def test_事件依真實工具時序且摘要可還原(tmp_path):
    def model(*_):
        def query():
            assert active.get().steps[-1]['status']=='running'
            return {'records': [1]}
        tracked('query',query)
        assert active.get().steps[-1]['status']=='done'
        active.get().emit('delta',text='查得一筆')
        return {'content':'查得一筆'}
    with TestClient(create_app(tmp_path/'a.db',model=model,intent_classifier=lambda _: {'intent':'readonly'})) as c:
        cid=setup(c)
        r=c.post(f'/api/conversations/{cid}/messages/stream',json={'text':'查詢'})
        assert r.status_code==200 and r.headers['x-accel-buffering']=='no'
        data=events(r)
        assert any(d.get('text')=='查得一筆' for d in data)
        saved=c.get(f'/api/conversations/{cid}').json()['messages'][-1]
        assert len(saved['processing_summary']['steps'])==2
        assert all(x['status']=='done' for x in saved['processing_summary']['steps'])
        assert data[-1]['messages'][-1]==saved


@pytest.mark.parametrize('readonly',[True,False])
def test_停止驗證身分及權杖且只中止唯讀(tmp_path,readonly):
    entered,release=Event(),Event()
    def model(*_):
        entered.set();release.wait(5);check()
        return {'content':'原處理結果'}
    path=tmp_path/'stop.db'
    with TestClient(create_app(path,model=model,intent_classifier=lambda _: {'intent':'readonly' if readonly else 'change'})) as c:
        cid=setup(c)
        with ThreadPoolExecutor() as pool:
            job=pool.submit(c.post,f'/api/conversations/{cid}/messages/stream',json={'text':'操作'})
            assert entered.wait(3)
            store=Store(path)
            with store.transaction() as db:
                row=next(r for r in store.all(db,'STATE') if r.get('status')=='processing' and r.get('token'))
            url=f'/api/streams/{row["id"]}/stop'
            assert c.post(url,json={'token':'wrong'}).status_code==404
            stopped=c.post(url,json={'token':row['token']}).json()
            assert stopped['status']==('stopping' if readonly else 'waiting_stopped')
            release.set();response=job.result()
        assert ('event: stopped' in response.text)==readonly
        with store.transaction() as db:
            convo=store.get(db,'CONVERSATION',cid)
        assert 'processing' not in convo
        assert convo['messages'][-1].get('stopped',False)==readonly
        assert c.post(f'/api/conversations/{cid}/messages',json={'text':'下一句'}).status_code==200


def test_串流中斷保留預留為未知(tmp_path,monkeypatch):
    from app import model
    ledger=Store(tmp_path/'budget.db')
    monkeypatch.setattr(model,'budget_store',lambda:ledger)
    monkeypatch.setenv('OPENAI_API_KEY','synthetic')
    monkeypatch.setenv('AI_TEST_BUDGET_USD','20')
    class Stream:
        def __enter__(self): return self
        def __exit__(self,*_): pass
        def __iter__(self):
            yield SimpleNamespace(type='response.output_text.delta',delta='片段')
    monkeypatch.setattr(model,'OpenAI',lambda **_:SimpleNamespace(responses=SimpleNamespace(create=lambda **_:Stream())))
    work=Work(Store(tmp_path/'work.db'),{'id':'tester'},'zh-TW')
    token=active.set(work)
    try:
        with pytest.raises(Exception):model.invoke({'model':'gpt-6.1-sol','tools':[]})
    finally:active.reset(token)
    with ledger.transaction() as db: rows=ledger.all(db,'BUDGET')
    assert rows[0]['status']=='unknown' and rows[0]['reserved_usd']>0
    assert 'actual_usd' not in rows[0]


def test_入口串流與舊JSON相容(tmp_path):
    with TestClient(create_app(tmp_path/'entry.db',intent_classifier=lambda _: {'intent':'greeting','module':'none'})) as c:
        setup(c)
        body={'entry_id':'entry1234','request_id':'request1234','text':'你好'}
        r=c.post('/api/entry/messages/stream',json=body)
        assert 'event: done' in r.text
        assert events(r)[-1]['messages'][-1]['processing_summary']['steps']
        assert c.get('/api/entry/requests/request1234').json()['status']=='answered'


def test_真實HTTP斷線不取消處理也不重送(tmp_path):
    import socket
    import threading
    import httpx
    import uvicorn
    entered,release=Event(),Event()
    calls=[]
    def model(*_):
        calls.append(1);entered.set();release.wait(5)
        tracked('query',lambda: {'records':[]})
        return {'content':'原請求完成'}
    app=create_app(tmp_path/'disconnect.db',model=model,intent_classifier=lambda _: {'intent':'readonly'})
    sock=socket.socket();sock.bind(('127.0.0.1',0))
    address='http://127.0.0.1:'+str(sock.getsockname()[1])
    server=uvicorn.Server(uvicorn.Config(app,log_level='error'))
    thread=threading.Thread(target=lambda:server.run(sockets=[sock]),daemon=True);thread.start()
    try:
        for _ in range(100):
            if server.started:break
            time.sleep(.01)
        with httpx.Client(base_url=address) as c:
            cid=setup(c)
            with c.stream('POST',f'/api/conversations/{cid}/messages/stream',json={'text':'查詢'}) as response:
                for line in response.iter_lines():
                    if line=='event: intent':break
                assert entered.wait(2)
            # HTTP consumer 已關閉，模型仍由背景工作持有。
            release.set()
            for _ in range(100):
                chat=c.get(f'/api/conversations/{cid}').json()
                if chat['messages'][-1]['role']=='assistant':break
                time.sleep(.02)
            assert chat['messages'][-1]['content']=='原請求完成'
            assert chat['processing_active'] is False and calls==[1]
    finally:
        release.set();server.should_exit=True;thread.join(5);sock.close()


def test_唯讀停止關閉上游串流且費用未知(tmp_path,monkeypatch):
    from app import model
    from app.streaming import Stopped
    import threading
    ledger=Store(tmp_path/'ledger.db');work=Work(Store(tmp_path/'work.db'),{'id':'operator'},'zh-TW')
    work.intent(True)
    monkeypatch.setattr(model,'budget_store',lambda:ledger)
    monkeypatch.setenv('AI_TEST_BUDGET_USD','20');monkeypatch.setenv('OPENAI_API_KEY','synthetic')
    waiting,closed=Event(),Event()
    class Stream:
        def __enter__(self):return self
        def __exit__(self,*_):self.close()
        def close(self):closed.set()
        def __iter__(self):
            waiting.set();closed.wait(3)
            return iter([])
    monkeypatch.setattr(model,'OpenAI',lambda **_:SimpleNamespace(responses=SimpleNamespace(create=lambda **_:Stream())))
    def call():
        token=active.set(work)
        try:
            with pytest.raises(Stopped):model.invoke({'model':'gpt-6.1-sol','tools':[]})
        finally:active.reset(token)
    with ThreadPoolExecutor() as pool:
        future=pool.submit(call);assert waiting.wait(2)
        with work.store.transaction() as db:
            row=work.store.get(db,'STATE',work.key);row['stop']=True;work.store.put(db,'STATE',work.key,row)
        future.result(timeout=2)
    assert closed.is_set()
    with ledger.transaction() as db:assert ledger.all(db,'BUDGET')[0]['status']=='unknown'


@pytest.mark.parametrize('status',[429,502])
def test_預算與模型錯誤有終態且不冒充完成(tmp_path,status):
    from fastapi import HTTPException
    def model(*_):raise HTTPException(status,'隔離錯誤')
    with TestClient(create_app(tmp_path/'error.db',model=model,intent_classifier=lambda _: {'intent':'readonly'})) as c:
        cid=setup(c);r=c.post(f'/api/conversations/{cid}/messages/stream',json={'text':'查詢'})
        assert 'event: done' not in r.text
        assert events(r)[-1]['status']==status
        chat=c.get(f'/api/conversations/{cid}').json()
        assert not chat['processing_active'] and chat['messages'][-1]['processing_failed']


def test_確認卡步驟不代表業務寫入(tmp_path,monkeypatch):
    from app import model
    from test_live_dialogue_validation import model_tool
    monkeypatch.setenv('OPENAI_API_KEY','synthetic')
    monkeypatch.setattr(model,'invoke',lambda _:model_tool('prepare_report_add',{'execution_id':'2001','ok':100,'defects':[]},1))
    with TestClient(create_app(tmp_path/'proposal.db',intent_classifier=lambda _: {'intent':'change'})) as c:
        cid=setup(c);r=c.post(f'/api/conversations/{cid}/messages/stream',json={'text':'人工良品100'})
        data=events(r);assert data[-1]['proposal']['status']=='pending'
        assert any(d.get('label')=='已建立新增報工確認卡（尚未送出）' and d['status']=='done' for d in data)
        assert all('已寫入' not in d.get('label','') for d in data)
        assert c.get('/api/audit').json()['records']==[]


@pytest.mark.parametrize('locale,expected',[
 ('zh-TW',('本頁 2 筆','命中 0 筆','人工良品數','新增報工','整理回覆','分析需求')),
 ('en',('2 records','0 matches','Manual good quantity','Add production report','Compose reply','Analyze request')),
 ('th',('2 รายการ','0 รายการ','จำนวนชิ้นงานดี','เพิ่มรายงานการผลิต','เรียบเรียงคำตอบ','วิเคราะห์คำขอ'))])
def test_三語步驟取自結果且不洩露內部名稱(locale,expected):
    from app.step_labels import result_label
    values=[result_label('query',{'records':[{},{}]},({'equipment':'MC37','wo':'WO-A'},),locale),
            result_label('knowledge',[],(),locale),
            result_label('draft',{'missing':['execution_id']},({'args':{'ok':100}},),locale),
            result_label('proposal',{'proposal':{'action':'report.add'}},(),locale),
            result_label('model',SimpleNamespace(output=[]),(),locale),
            result_label('model',SimpleNamespace(output=[SimpleNamespace(type='function_call')]),(),locale)]
    for text,part in zip(values,expected):assert part in text
    assert 'MC37 / WO-A' in values[0]
    assert not any('execution_id' in text or 'report.add' in text for text in values)


@pytest.mark.parametrize('prepare',[False,True])
def test_中間文字重設且最後片段等於存檔(tmp_path,monkeypatch,prepare):
    from app import model
    from test_live_dialogue_validation import model_tool
    monkeypatch.setenv('OPENAI_API_KEY','synthetic')
    calls=[]
    def invoke(_):
        calls.append(1)
        if len(calls)==1:
            active.get().emit('delta',text='中間說明')
            return model_tool('prepare_report_add' if prepare else 'query_workspace',{'execution_id':'2001','ok':100,'defects':[]} if prepare else {'equipment':'MC37'},1)
        active.get().emit('delta',text='最終');active.get().emit('delta',text='回答')
        return SimpleNamespace(output=[],output_text='最終回答')
    monkeypatch.setattr(model,'invoke',invoke)
    with TestClient(create_app(tmp_path/'rounds.db',intent_classifier=lambda _: {'intent':'change' if prepare else 'readonly'})) as c:
        cid=setup(c);response=c.post(f'/api/conversations/{cid}/messages/stream',json={'text':'需求'})
        text='';reset=False
        for block in response.text.split('\n\n'):
            lines=block.splitlines()
            if not lines or not lines[0].startswith('event:'):continue
            event=lines[0][7:];data=json.loads(lines[1][6:])
            if event=='delta':text+=data['text']
            if event=='reset':text='';reset=True
        assert reset
        saved=c.get(f'/api/conversations/{cid}').json()['messages'][-1]['content']
        assert text==('' if prepare else saved)
        assert '中間說明' not in saved


def test_delta不寫入資料庫且終態移除權杖並到期清除(tmp_path):
    from app.streaming import cleanup_streams,RETENTION_SECONDS
    store=Store(tmp_path/'cleanup.db');work=Work(store,{'id':'operator'},'zh-TW')
    with store.transaction() as db:before=store.get(db,'STATE',work.key)
    for _ in range(1000):work.emit('delta',text='文字')
    with store.transaction() as db:assert store.get(db,'STATE',work.key)==before
    batch,_=work.take_events();assert len(batch)==1000
    work.emit('done',processing_summary=work.snapshot())
    with store.transaction() as db:
        row=store.get(db,'STATE',work.key);assert 'token' not in row and 'events' not in row
    assert work.token is None
    cleanup_streams(store,row['delete_after']-1)
    with store.transaction() as db:assert store.get(db,'STATE',work.key)
    cleanup_streams(store,row['delete_after']+1)
    with store.transaction() as db:assert store.get(db,'STATE',work.key) is None


def test_預留前已停止不建立費用紀錄(tmp_path,monkeypatch):
    from app import model
    from app.streaming import Stopped
    ledger=Store(tmp_path/'ledger.db');work=Work(Store(tmp_path/'work.db'),{'id':'operator'},'zh-TW');work.intent(True)
    with work.store.transaction() as db:
        row=work.store.get(db,'STATE',work.key);row['stop']=True;work.store.put(db,'STATE',work.key,row)
    monkeypatch.setattr(model,'budget_store',lambda:ledger)
    token=active.set(work)
    try:
        with pytest.raises(Stopped):model.invoke({'model':'gpt-6.1-sol'})
    finally:active.reset(token)
    with ledger.transaction() as db:assert ledger.all(db,'BUDGET')==[]
