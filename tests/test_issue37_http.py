"""第 37 項公開 HTTP 核對契約；僅隔離 SQLite 模擬。"""
from fastapi.testclient import TestClient
from app.main import create_app


def test_完工預覽明確提供下一排程且沒有預先寫入(tmp_path):
    with TestClient(create_app(tmp_path / 'complete.db')) as client:
        client.post('/api/session/demo', json={'identity':'supervisor'})
        response=client.post('/api/proposals',json={'module':'report','action':'report.complete','args':{'schedule_id':'1001'}})
        assert response.status_code == 200, response.text
        proposal=response.json()["proposal"]
        assert proposal['target']['affected_orders'] == ['WO-A','WO-B']
        assert proposal['target']['next_schedule']['start_time']
        assert proposal['independent_confirmation']
        rows=client.get('/api/workspace',params={'module':'report','schedule_id':'1001'}).json()['records']
        assert all(row['COMPLETED']=='N' for row in rows)


def test_零穴預覽保留原穴數與模具明細名稱(tmp_path):
    with TestClient(create_app(tmp_path / 'cavities.db')) as client:
        client.post('/api/session/demo', json={'identity':'supervisor'})
        response=client.post('/api/proposals',json={'module':'report','action':'report.cavities','args':{'execution_id':'2001','cavities':0}})
        assert response.status_code==200,response.text
        proposal=response.json()["proposal"]
        assert proposal['args']['cavities']==0
        assert proposal['target']['cavities_before']==2
        assert proposal['target']['mold_detail_name'] is None
        assert proposal['target']['mold_detail_no']
        row=client.get('/api/workspace',params={'module':'report','execution_id':'2001'}).json()['records'][0]
        assert row['OPI_CAV']==2


def test_沒有下一排程時明確回傳空值(tmp_path):
    with TestClient(create_app(tmp_path / 'last.db')) as client:
        client.post('/api/session/demo', json={'identity':'supervisor'})
        first=client.post('/api/proposals',json={'module':'report','action':'report.complete','args':{'schedule_id':'1002'}}).json()['proposal']
        result=client.post(f"/api/proposals/{first['id']}/confirm",json={'digest':first['digest'],'approved':True})
        assert result.status_code==200,result.text
        assert result.json()['status']=='succeeded'
        last=client.post('/api/proposals',json={'module':'report','action':'report.complete','args':{'schedule_id':'1001'}})
        assert last.status_code==200,last.text
        assert last.json()['proposal']['target']['next_schedule'] is None
