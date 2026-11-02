"""中立入口與有界搜尋公開 HTTP 驗證；不呼叫付費模型。"""
from fastapi.testclient import TestClient
from app.main import create_app
from test_dual_flow_http import prepare

def test_未綁模組能力入口保存且不建立業務聊天(tmp_path,monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY',raising=False)
    with TestClient(create_app(tmp_path/'entry.db')) as c:
        c.post('/api/session/demo',json={'identity':'operator'})
        body={'entry_id':'entry-001','request_id':'message-001','text':'你能幫我做什麼？'}
        response=c.post('/api/entry/messages',json=body)
        assert response.status_code==200,response.text
        result=response.json()
        assert result['status']=='model_unavailable' and result['choices']==['report']
        assert 'AI 尚未設定' in result['messages'][-1]['content']
        assert c.post('/api/entry/messages',json=body).json()==result
        assert c.get('/api/entry/requests/message-001').json()==result
        assert c.get('/api/conversations').json()['total']==0
        assert len(c.get('/api/entry/entry-001').json()['messages'])==2
        handoff=c.post('/api/conversations',json={'module':'report','entry_id':'entry-001'})
        assert handoff.status_code==200,handoff.text
        assert len(handoff.json()['messages'])==2
        assert c.post('/api/conversations',json={'module':'report','entry_id':'entry-001'}).json()['id']==handoff.json()['id']
        assert c.get('/api/conversations').json()['total']==1

def test_入口只交接一次且跨身分不得讀回(tmp_path):
    called=[]
    def model(convo,*_):
        called.append(convo)
        return {'content':'請選擇工單。'}
    with TestClient(create_app(tmp_path/'route.db',model=model,intent_classifier=lambda _:{'intent':'change','module':'report'})) as c:
        c.post('/api/session/demo',json={'identity':'operator'})
        body={'entry_id':'entry-002','request_id':'message-002','text':'MC37 報工'}
        result=c.post('/api/entry/messages',json=body)
        assert result.status_code==200,result.text
        reply=result.json()
        assert reply['status']=='routed' and reply['module']=='report'
        assert c.post('/api/entry/messages',json=body).json()==reply
        assert len(called)==1
        convo=c.get('/api/conversations/'+reply['conversation_id']).json()
        assert [m['content'] for m in convo['messages'] if m['role']=='user']==['MC37 報工']
        assert c.get('/api/conversations').json()['total']==1
        c.post('/api/session/demo',json={'identity':'planner'})
        assert c.get('/api/entry/requests/message-002').status_code==404

def test_入口分類不得取代授權且保留待核對原作業(tmp_path):
    decision={'intent':'change','module':'schedule'}
    with TestClient(create_app(tmp_path/'auth.db',model=lambda *_:{'content':'不可到達'},intent_classifier=lambda _:decision)) as c:
        cid,card=prepare(c)
        body={'entry_id':'entry-003','request_id':'message-003','text':'操作'}
        assert c.post('/api/entry/messages',json=body).status_code==403
        decision['module']='report';body['request_id']='message-004'
        result=c.post('/api/entry/messages',json=body).json()
        assert result['status']=='recovery_required'
        assert result['recovery_conversation_id']==cid
        assert c.get(f'/api/proposals/{card["id"]}').json()['proposal']==card

def test_入口逾時只查回原識別且失敗原文仍可恢復(tmp_path):
    app=create_app(tmp_path/'expiry.db',intent_classifier=lambda _: (_ for _ in ()).throw(RuntimeError('分類失敗')))
    with TestClient(app,raise_server_exceptions=False) as c:
        c.post('/api/session/demo',json={'identity':'operator'})
        body={'entry_id':'entry-expiry','request_id':'message-expiry','text':'原始需求'}
        assert c.post('/api/entry/messages',json=body).status_code==500
        assert c.get('/api/entry/entry-expiry').json()['messages'][0]['content']=='原始需求'
        store=app.state.store
        with store.transaction() as db:
            row=store.get(db,'STATE','entry-request:v1:message-expiry')
            row.update(status='processing',expires_at='2000-01-01T00:00:00+00:00')
            store.put(db,'STATE','entry-request:v1:message-expiry',row)
            entry=store.get(db,'STATE','entry:v1:entry-expiry');entry['processing']='message-expiry'
            store.put(db,'STATE','entry:v1:entry-expiry',entry)
        assert c.get('/api/entry/requests/message-expiry').json()['status']=='failed'
        assert c.get('/api/conversations').json()['total']==0
        assert c.post('/api/conversations',json={'module':'report','entry_id':'entry-expiry'}).status_code==200

def test_候選搜尋超過兩百筆仍查得到且回傳真實分頁(tmp_path):
    app=create_app(tmp_path/'candidates.db')
    with TestClient(app) as c:
        c.post('/api/session/demo',json={'identity':'planner'})
        c.get('/api/workspace?module=schedule')
        store=app.state.store
        with store.transaction() as db:
            state=store.get(db,'STATE','simulation')
            state['catalogs']['parts']=[{'PART_NO':f'P{i:04d}','PART_SPEC':f'規格{i}'} for i in range(250)]
            state['catalogs']['work_orders']=[{'WO_SID':str(i),'WO':f'WO{i:04d}','PART_NO':'P0249'} for i in range(250)]
            store.put(db,'STATE','simulation',state)
        result=c.get('/api/candidates?kind=parts').json()
        assert len(result['records'])==20 and result['has_more'] and result['total'] is None
        assert c.get('/api/candidates?kind=parts&search=P0249').json()['records'][0]['PART_NO']=='P0249'
        assert c.get('/api/candidates?kind=work_orders&part_no=P0249&search=WO0249').json()['records'][0]['WO_SID']=='249'
        assert c.get('/api/candidates?kind=work_orders').status_code==422
        assert c.get('/api/candidates?kind=SQL').status_code==422
        assert c.get('/api/candidates?kind=parts&page_size=1000').status_code==422
        c.post('/api/session/demo',json={'identity':'operator'})
        assert c.get('/api/candidates?kind=parts').status_code==403
