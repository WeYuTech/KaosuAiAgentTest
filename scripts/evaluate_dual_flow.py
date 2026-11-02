"""Issue27 三語真實模型 HTTP 驗收；隔離業務庫、沿用累計預算，不執行確認寫入。"""
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from dotenv import load_dotenv
load_dotenv(ROOT/'.env')
os.environ['MES_MODE']='simulation'
from fastapi.testclient import TestClient
from app.main import create_app
from app.model import budget_summary

results=[]
prompts=[
 ('zh-TW','你能幫我做什麼？','這一筆人工良品是什麼意思？只說明，不要更改。','請把目前這筆人工良品改為130，其他內容不變，重新讓我核對。'),
 ('en','What can you help me do?','Explain manual good units in this record. Do not change anything.','Change the manual good units of this record to 130, keep the other values, and prepare it for my review.'),
 ('th','คุณช่วยฉันทำอะไรได้บ้าง','อธิบายจำนวนชิ้นงานดีที่บันทึกด้วยมือในรายการนี้ ห้ามแก้ไขข้อมูล','เปลี่ยนจำนวนชิ้นงานดีที่บันทึกด้วยมือของรายการนี้เป็น 130 เก็บข้อมูลอื่นไว้ แล้วเตรียมให้ฉันตรวจสอบ'),
]
with tempfile.TemporaryDirectory() as folder,TestClient(create_app(Path(folder)/'dual-flow.db')) as client:
 client.post('/api/session/demo',json={'identity':'supervisor'}).raise_for_status()
 for index,(locale,capability,explanation,change) in enumerate(prompts):
  capability_result=client.post('/api/entry/messages',json={'entry_id':f'entry-live-{index}','request_id':f'request-live-{index}','text':capability,'locale':locale})
  results.append({'locale':locale,'case':'能力入口','http':capability_result.status_code,'passed':capability_result.status_code==200 and capability_result.json().get('status')=='answered','response':capability_result.json()})
  cid=client.post('/api/conversations',json={'module':'report','locale':locale}).json()['id']
  card=client.post(f'/api/conversations/{cid}/proposals',json={'action':'report.add','args':{'execution_id':'2001','ok':120,'defects':[{'code':'NG01','quantity':2}]}}).json()['proposal']
  reply=client.post(f'/api/conversations/{cid}/messages',json={'text':explanation})
  results.append({'locale':locale,'case':'唯讀保留卡','http':reply.status_code,'passed':reply.status_code==200 and reply.json().get('proposal')==card,'response':reply.json()})
  reply=client.post(f'/api/conversations/{cid}/messages',json={'text':change})
  guide=client.get(f'/api/conversations/{cid}/guide').json()
  old=client.get(f'/api/proposals/{card["id"]}').json()['proposal']
  results.append({'locale':locale,'case':'修改同份草稿','http':reply.status_code,'passed':reply.status_code==200 and guide['args'].get('ok')==130 and old['status']=='superseded','response':reply.json()})
  if guide.get('proposal'):
   p=guide['proposal'];client.post(f'/api/proposals/{p["id"]}/confirm',json={'digest':p['digest'],'approved':False})
  print(json.dumps({'locale':locale,'results':[{k:v for k,v in r.items() if k!='response'} for r in results[-3:]]},ensure_ascii=False),flush=True)
 assert all(r['status']=='cancelled' for r in client.get('/api/audit').json()['records']), '不得執行業務寫入'
output={'results':results,'budget':budget_summary(),'business_writes':0}
(ROOT/'.local/issue27-real-model.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(output['budget'],ensure_ascii=False))
sys.exit(0 if all(r['passed'] for r in results) else 1)
