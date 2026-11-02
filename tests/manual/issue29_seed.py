"""為本機 8033 隔離驗收建立同一報工案例；不呼叫正式 MES。"""
import httpx

with httpx.Client(base_url='http://127.0.0.1:8033') as client:
    client.post('/api/session/demo', json={'identity':'supervisor'}).raise_for_status()
    cid = client.post('/api/conversations',json={'module':'report','locale':'zh-TW'}).json()['id']
    client.post(f'/api/conversations/{cid}/guide', json={
        'version':0,'action':'report.add','args':{'ok':120,'defects':[{'code':'NG01','quantity':3}]},'step':'details',
    }).raise_for_status()
    client.post(f'/api/conversations/{cid}/messages',json={'text':'幫 MC37 報工，良品 120、不良 3，原因刮傷。'}).raise_for_status()
    print(cid)
