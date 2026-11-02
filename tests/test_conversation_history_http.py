"""聊天管理公開 HTTP 驗收：身分、競爭、草稿與稽核保存。"""
from fastapi.testclient import TestClient
from app.main import create_app


def test_聊天管理隔離版本搜尋與復原(tmp_path, monkeypatch):
    monkeypatch.setenv("MES_MODE", "simulation")
    app = create_app(tmp_path / "history.db", model=lambda *_: {"content": "查詢完成"})
    with TestClient(app) as c:
        assert c.get('/api/conversations').status_code == 401
        c.post('/api/session/demo', json={"identity": "operator"})
        cid = c.post('/api/conversations', json={"module": "report"}).json()['id']
        path = f'/api/conversations/{cid}'
        g = c.post(path+'/guide', json={"version": 0, "action": "report.add", "args": {"execution_id": "2001", "ok": 120, "defects": []}, "step": "details"}).json()
        first = c.post(path+'/metadata', json={"version": 0, "title": " MC37 班次交接 ", "is_pinned": True})
        assert first.status_code == 200 and first.json()['title'] == 'MC37 班次交接'
        assert c.post(path+'/metadata', json={"version": 0, "title": "過期改名"}).status_code == 409
        assert c.get('/api/conversations?q=MC37').json()['total'] == 1
        assert c.get('/api/conversations?q=不存在').json()['total'] == 0
        assert c.get(path+'/guide').json()['args'] == g['args']
        assert c.post(path+'/metadata', json={"version": 1, "is_archived": True}).status_code == 200
        assert c.get('/api/conversations').json()['total'] == 0
        assert c.get('/api/conversations?scope=archived').json()['total'] == 1
        assert c.get(path).status_code == 200
        assert c.post(path+'/guide', json={"version": g['version'], "args": {"ok": 999}}).status_code in (409, 422)
        assert c.post(path+'/messages', json={"text": "不應呼叫模型"}).status_code in (409, 422)
        assert c.post(path+'/metadata', json={"version": 2, "is_archived": False, "is_deleted": True}).status_code == 200
        assert c.get(path).status_code == 404
        assert c.get('/api/conversations?scope=deleted').json()['total'] == 1
        assert c.post(path+'/metadata', json={"version": 3, "is_deleted": False}).status_code == 200
        assert c.get(path+'/guide').json()['args'] == g['args']
        c.post('/api/session/demo', json={"identity": "supervisor"})
        assert c.get('/api/conversations?q=MC37').json()['total'] == 0
        assert c.get(path).status_code == 404
        assert c.post(path+'/metadata', json={"version": 4, "title": "他人更名"}).status_code == 404


def test_待確認卡不可隱藏且重新命名不改確認摘要(tmp_path, monkeypatch):
    monkeypatch.setenv("MES_MODE", "simulation")
    with TestClient(create_app(tmp_path / "confirm.db")) as c:
        c.post('/api/session/demo', json={"identity": "operator"})
        cid = c.post('/api/conversations', json={"module": "report"}).json()['id']
        path = f'/api/conversations/{cid}'
        g = c.post(path+'/guide', json={"version": 0, "action": "report.add", "args": {"execution_id": "2001", "ok": 120, "defects": []}, "step": "details"}).json()
        p = c.post(path+'/proposals', json={"version": g['version'], "action": g['action'], "args": g['args']}).json()['proposal']
        for key in ['is_archived', 'is_deleted']:
            assert c.post(path+'/metadata', json={"version": 0, key: True}).status_code == 409
        assert c.post(path+'/metadata', json={"version": 0, "title": "待確認報工"}).status_code == 200
        same = c.get('/api/proposals/'+p['id']).json()['proposal']
        assert same['digest'] == p['digest'] and same['status'] == 'pending'
        cancelled = c.post('/api/proposals/'+p['id']+'/confirm', json={"digest": p['digest'], "approved": False}).json()
        assert cancelled['status'] == 'cancelled'
        audit = c.get('/api/audit').json()['records']
        assert c.post(path+'/metadata', json={"version": 1, "is_deleted": True}).status_code == 200
        assert c.get('/api/audit').json()['records'] == audit
        assert c.get('/api/proposals/'+p['id']).json()['proposal']['status'] == 'cancelled'


def test_搜尋分頁及無效資料(tmp_path, monkeypatch):
    monkeypatch.setenv("MES_MODE", "simulation")
    with TestClient(create_app(tmp_path / "pages.db", model=lambda *_: {"content": "完成"})) as c:
        c.post('/api/session/demo', json={"identity": "operator"})
        ids = [c.post('/api/conversations', json={"module": "report"}).json()['id'] for _ in range(3)]
        c.post(f'/api/conversations/{ids[0]}/metadata', json={"version": 0, "is_pinned": True})
        assert c.get('/api/conversations?page_size=1').json()['records'][0]['id'] == ids[0]
        assert c.get('/api/conversations?page=2&page_size=2').json()['records'][0]['id'] == ids[1]
        assert c.get('/api/conversations?page=0').status_code == 422
        assert c.post(f'/api/conversations/{ids[0]}/metadata', json={"version": 1, "title": "   "}).status_code == 422
        assert c.post(f'/api/conversations/{ids[0]}/metadata', json={"version": 1, "actor_id": "other"}).status_code == 422
        c.post(f'/api/conversations/{ids[1]}/messages', json={"text": "查詢泰文 ทดสอบ"})
        c.post(f'/api/conversations/{ids[1]}/metadata', json={"version": 0, "title": "另外命名"})
        assert c.get('/api/conversations', params={"q": "ทดสอบ"}).json()['records'][0]['id'] == ids[1]


def test_結果未知不可隱藏且統計不洩漏他人操作(tmp_path, monkeypatch):
    from app.mes import MesBridge
    from test_operation_reconciliation import UncertainMes
    bridge = UncertainMes()
    monkeypatch.setenv("MES_MODE", "live")
    monkeypatch.setattr(MesBridge, "from_env", classmethod(lambda cls: bridge))
    with TestClient(create_app(tmp_path / "unknown-history.db")) as c:
        cid = c.post('/api/conversations', json={"module": "report"}).json()['id']
        path = f'/api/conversations/{cid}'
        p = c.post(path+'/proposals', json={"action": "report.cavities", "args": {"execution_id": "2001", "cavities": 3}}).json()['proposal']
        assert c.post('/api/proposals/'+p['id']+'/confirm', json={"digest": p['digest'], "approved": True}).json()['status'] == 'unknown'
        for key in ['is_archived', 'is_deleted']:
            r = c.post(path+'/metadata', json={"version": 0, key: True})
            assert r.status_code == 409 and r.json()['code'] == 'conversation_unresolved'
        stats = c.get('/api/conversations/statistics')
        assert stats.status_code == 200 and stats.json()['unknown'] == 1
        assert c.get('/api/conversations').json()['records'][0]['id'] == cid
        bridge.found = True
        assert c.post('/api/proposals/'+p['id']+'/reconcile', json={}).json()['status'] == 'succeeded'
        assert c.post(path+'/metadata', json={"version": 0, "is_archived": True}).status_code == 200
        assert bridge.writes == 1


def test_模型執行中不可封存且更名不被晚到回覆覆蓋(tmp_path, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    entered, release = Event(), Event()
    def model(*_):
        entered.set()
        assert release.wait(10)
        return {"content": "已查詢"}
    monkeypatch.setenv("MES_MODE", "simulation")
    with TestClient(create_app(tmp_path / "processing.db", model=model)) as c:
        assert c.get('/api/conversations/statistics').status_code == 401
        c.post('/api/session/demo', json={"identity": "operator"})
        cid = c.post('/api/conversations', json={"module": "report"}).json()['id']
        path = f'/api/conversations/{cid}'
        with ThreadPoolExecutor() as pool:
            task = pool.submit(c.post, path+'/messages', json={"text": "查詢設備"})
            try:
                assert entered.wait(5)
                assert c.post(path+'/metadata', json={"version": 0, "is_archived": True}).status_code == 409
                assert c.post(path+'/metadata', json={"version": 0, "title": "處理中更名"}).status_code == 200
            finally:
                release.set()
            assert task.result().status_code == 200
        saved = c.get(path).json()
        assert saved['title'] == '處理中更名' and saved['metadata_version'] == 1
        assert len(saved['messages']) == 2
        assert c.get('/api/conversations/statistics').json()['messages'] == 2
        c.post('/api/session/demo', json={"identity": "supervisor"})
        assert c.get('/api/conversations/statistics').json()['conversations'] == 0


def test_已刪除還原保留封存且舊版本不能取消封存(tmp_path, monkeypatch):
    monkeypatch.setenv("MES_MODE", "simulation")
    with TestClient(create_app(tmp_path / "restore-archived.db")) as c:
        c.post('/api/session/demo', json={"identity": "operator"})
        cid = c.post('/api/conversations', json={"module": "report"}).json()['id']
        path = f'/api/conversations/{cid}/metadata'
        assert c.post(path, json={"version": 0, "is_archived": True}).status_code == 200
        assert c.post(path, json={"version": 1, "is_deleted": True}).status_code == 200
        restored = c.post(path, json={"version": 2, "is_deleted": False})
        assert restored.status_code == 200 and restored.json()['is_archived'] is True
        assert c.get('/api/conversations').json()['total'] == 0
        assert c.get('/api/conversations?scope=deleted').json()['total'] == 0
        assert c.get('/api/conversations?scope=archived').json()['records'][0]['id'] == cid
        assert c.post(path, json={"version": 2, "is_archived": False}).status_code == 409
        assert c.post(path, json={"version": 3, "is_archived": False}).status_code == 200
        assert c.get('/api/conversations').json()['records'][0]['id'] == cid
