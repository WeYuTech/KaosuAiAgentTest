"""Issue27 的公開 HTTP 邊界；分類／模型皆為隔離替身，不計為真實模型證據。"""
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException

from app.main import create_app


def prepare(client):
    client.post('/api/session/demo', json={'identity': 'operator'})
    cid = client.post('/api/conversations', json={'module': 'report'}).json()['id']
    proposal = client.post(f'/api/conversations/{cid}/proposals', json={
        'action': 'report.add', 'args': {'execution_id': '2001', 'ok': 5, 'defects': []},
    }).json()['proposal']
    return cid, proposal


def test_報工核對快照保留品號與本次執行時間(tmp_path):
    with TestClient(create_app(tmp_path/'target.db')) as client:
        _, proposal = prepare(client)
        assert proposal['target']['part_no'] == 'EPS-A'
        assert proposal['target']['part_spec'] == '模擬左側緩衝件'
        assert proposal['target']['execution_time'] == '2026-10-30 08:10:00'
        assert client.get('/api/audit').json()['records'] == []


def test_說明保留原確認卡版本內容與期限(tmp_path):
    with TestClient(create_app(tmp_path/'read.db', model=lambda *_: {'content': '這是本次人工良品數量。'},
                               intent_classifier=lambda _: {'intent': 'readonly'})) as c:
        cid, card = prepare(c)
        before = c.get(f'/api/conversations/{cid}').json()
        result = c.post(f'/api/conversations/{cid}/messages', json={'text': '這個欄位是什麼？'})
        assert result.status_code == 200
        assert result.json()['proposal'] == card
        after = c.get(f'/api/conversations/{cid}').json()
        assert after['revision'] == before['revision']
        assert after['guide'] == before['guide']
        assert c.post(f'/api/proposals/{card["id"]}/confirm', json={'digest': card['digest'], 'approved': True}).json()['status'] == 'succeeded'


@pytest.mark.parametrize('classification', ['readonly', 'change', 'failure'])
def test_分類中跨實例不得確認舊卡且結束後清理鎖(tmp_path, classification):
    entered, release = Event(), Event()
    def classify(_):
        entered.set()
        assert release.wait(5)
        if classification == 'failure':
            raise HTTPException(502, '隔離分類失敗')
        return {'intent': classification}
    path = tmp_path/'shared.db'
    with TestClient(create_app(path, model=lambda *_: {'content': '已理解'}, intent_classifier=classify)) as a, TestClient(create_app(path)) as b:
        cid, card = prepare(a)
        b.cookies.update(a.cookies)
        confirm = lambda: b.post(f'/api/proposals/{card["id"]}/confirm', json={'digest': card['digest'], 'approved': True})
        with ThreadPoolExecutor(max_workers=1) as pool:
            running = pool.submit(a.post, f'/api/conversations/{cid}/messages', json={'text': '需求'})
            assert entered.wait(5)
            assert confirm().status_code == 409
            release.set()
            response = running.result(timeout=5)
        assert response.status_code == (502 if classification == 'failure' else 200)
        outcome = confirm()
        assert outcome.status_code == 200
        assert outcome.json()['status'] == ('superseded' if classification == 'change' else 'succeeded')


@pytest.mark.parametrize('tool', ['prepare_report_add', 'update_operation_draft'])
def test_唯讀後端不註冊也不接受修改工具(tmp_path, monkeypatch, tool):
    from app import model
    from test_live_dialogue_validation import model_tool
    monkeypatch.setenv('OPENAI_API_KEY', 'synthetic-no-network')
    seen = []
    def invoke(payload):
        seen.extend(item['name'] for item in payload['tools'])
        return model_tool(tool, {'execution_id': '2001', 'ok': 9, 'defects': []}, 1)
    monkeypatch.setattr(model, 'invoke', invoke)
    with TestClient(create_app(tmp_path/'tools.db', intent_classifier=lambda _: {'intent': 'readonly'})) as c:
        cid, card = prepare(c)
        result = c.post(f'/api/conversations/{cid}/messages', json={'text': '請說明'})
        assert result.status_code == 502
        assert seen == ['query_workspace', 'search_operation_knowledge']
        assert c.get(f'/api/proposals/{card["id"]}').json()['proposal'] == card
        assert c.get('/api/audit').json()['records'] == []


def test_唯讀結果也不能繞過工具以action回傳(tmp_path):
    with TestClient(create_app(tmp_path/'action.db', model=lambda *_: {'content': '越權', 'action': 'report.add', 'args': {}},
                               intent_classifier=lambda _: {'intent': 'readonly'})) as c:
        cid, card = prepare(c)
        assert c.post(f'/api/conversations/{cid}/messages', json={'text': '說明'}).status_code == 502
        assert c.get(f'/api/proposals/{card["id"]}').json()['proposal'] == card


def test_分類器嚴格驗證結構並沿用預算呼叫入口(monkeypatch):
    from app import model
    from app.intents import classify
    monkeypatch.setenv('OPENAI_API_KEY', 'synthetic-no-network')
    def invoke(payload):
        assert 'tools' not in payload
        assert payload['text']['format']['strict']
        return SimpleNamespace(output_text='{"intent":"change","module":"report"}')
    monkeypatch.setattr(model, 'invoke', invoke)
    assert classify({'module':'report','messages':[{'role':'user','content':'說明原因並改為130'}]}, ['report']) == {'intent':'change','module':'report'}
    monkeypatch.setattr(model, 'invoke', lambda _: SimpleNamespace(output_text='{"intent":"execute","module":"report"}'))
    with pytest.raises(HTTPException):
        classify({'messages':[]}, ['report'])
