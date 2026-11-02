"""共用查詢的公開 HTTP 回歸；模型呼叫皆為明示替身，無真實模型費用。"""
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from test_dual_flow_http import prepare
from test_live_dialogue_validation import model_tool


def test_查詢條件版本與業務版本分離且可恢復(tmp_path):
    with TestClient(create_app(tmp_path/'query.db')) as c:
        cid, card = prepare(c)
        before = c.get(f'/api/conversations/{cid}').json()
        result = c.post(f'/api/conversations/{cid}/query', json={'version':0,'filters':{'equipment':'MC37','page_size':1}})
        assert result.status_code == 200, result.text
        data = result.json()
        assert len(data['records']) == 1 and data['total'] > 1
        assert c.get(f'/api/conversations/{cid}/query').json() == data
        after = c.get(f'/api/conversations/{cid}').json()
        assert before['revision'] == after['revision'] and before['guide'] == after['guide']
        assert c.get(f'/api/proposals/{card["id"]}').json()['proposal'] == card
        assert c.post(f'/api/conversations/{cid}/query', json={'version':0,'filters':{}}).status_code == 409
        assert c.post(f'/api/conversations/{cid}/query', json={'version':1,'filters':{'equipment':'MC37','page_size':1,'page':2}}).json()['page'] == 2
        assert c.get('/api/audit').json()['records'] == []
        c.post('/api/session/demo',json={'identity':'supervisor'})
        assert c.get(f'/api/conversations/{cid}/query').status_code == 404


@pytest.mark.parametrize('filters', [{'sql':'select *'}, {'page_size':101}, {'page':True}, {'date':'bad'}, {'history':'invented'}])
def test_無效查詢不發布條件或破壞草稿(tmp_path, filters):
    with TestClient(create_app(tmp_path/'invalid.db')) as c:
        cid, card = prepare(c)
        assert c.post(f'/api/conversations/{cid}/query', json={'version':0,'filters':filters}).status_code == 422
        assert c.get(f'/api/conversations/{cid}/query').json()['query_context']['version'] == 0
        assert c.get(f'/api/proposals/{card["id"]}').json()['proposal'] == card


def test_選取頁混合修改需求只補問不修改或取消原卡(tmp_path):
    def classify(conversation):
        assert conversation['interaction_scope'] == 'selection'
        return {'intent':'change'}
    def unexpected(*_):
        pytest.fail('混合修改在選取頁不應執行模型操作')
    with TestClient(create_app(tmp_path/'selection.db', model=unexpected, intent_classifier=classify)) as c:
        cid, card = prepare(c)
        before = c.get(f'/api/conversations/{cid}').json()
        response = c.post(f'/api/conversations/{cid}/messages',json={'text':'只看MC38，良品改為130','scope':'selection'})
        assert response.status_code == 200, response.text
        assert response.json()['proposal'] == card
        after = c.get(f'/api/conversations/{cid}').json()
        assert before['revision'] == after['revision'] and before['guide'] == after['guide']


def test_模型查詢與手動共用條件並保留原確認卡(tmp_path, monkeypatch):
    from app import model
    monkeypatch.setenv('OPENAI_API_KEY','synthetic-no-network')
    calls=[]
    def invoke(payload):
        calls.append(payload)
        assert [tool['name'] for tool in payload['tools']] == ['query_workspace','search_operation_knowledge']
        return model_tool('query_workspace',{'equipment':'MC38','date':'2026-10-30'},1) if len(calls)==1 else SimpleNamespace(output=[],output_text='已依設備縮小範圍；尚未更換作業。')
    monkeypatch.setattr(model,'invoke',invoke)
    with TestClient(create_app(tmp_path/'ai.db',intent_classifier=lambda _: {'intent':'readonly'})) as c:
        cid, card = prepare(c)
        response=c.post(f'/api/conversations/{cid}/messages',json={'text':'只看MC38今天工單','scope':'selection'})
        assert response.status_code == 200, response.text
        data=response.json()['data']
        assert data['query_context']['filters']['equipment']=='MC38'
        assert c.get(f'/api/conversations/{cid}/query').json()==data
        assert response.json()['proposal']==card
        assert c.get('/api/audit').json()['records']==[]


def test_單筆報工核對快照不依賴目前查詢且保留被移除原因(tmp_path):
    from test_domain_http import confirm
    with TestClient(create_app(tmp_path/'report-snapshot.db')) as c:
        c.post('/api/session/demo',json={'identity':'supervisor'})
        confirm(c,'report','report.add',{'execution_id':'2001','ok':125,'defects':[{'code':'NG01','quantity':3},{'code':'NG02','quantity':2}]})
        row=c.get('/api/workspace?module=report&execution_id=2001').json()['records'][0]['REPORTS'][0]
        rid=row['WIP_OPI_WDOEACICOOUTPUT_HIST_SID']
        card=c.post('/api/proposals',json={'module':'report','action':'report.update','args':{'report_id':rid,'ok':130,'defects':[{'code':'NG01','quantity':1}]}}).json()['proposal']
        before=card['target']['report_before']
        assert before['OK_QTY']==125 and before['NG_QTY']==5
        assert before['CREATE_TIME']==row['CREATE_TIME']
        assert {r['NG_CODE']:r['NG_CODE_QTY'] for r in before['DEFECTS']}=={'NG01':3,'NG02':2}
        assert c.get('/api/workspace?module=report&equipment=MC38').json()['records']==[]
        assert c.get(f'/api/proposals/{card["id"]}').json()['proposal']['target']['report_before']==before
