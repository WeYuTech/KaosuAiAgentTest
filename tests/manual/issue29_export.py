"""匯出公開 HTTP 的隔離驗收結果，不讀取私密設定或正式資料。"""
import json
from pathlib import Path
import httpx

root=Path(__file__).resolve().parents[2]
cases=[json.loads(line) for line in (root/'.local/issue29-cases.jsonl').read_text(encoding='utf-8').splitlines()]
with httpx.Client(base_url='http://127.0.0.1:8033') as client:
    client.post('/api/session/demo',json={'identity':'supervisor'}).raise_for_status()
    def get(path):
        response=client.get(path);response.raise_for_status();return response.json()
    records=[]
    for case in cases:
        cid=case['conversation']
        records.append({'case':case['case'],'conversation':cid,'guide':get(f'/api/conversations/{cid}/guide'),'query':get(f'/api/conversations/{cid}/query')})
    result={'environment':'loopback 8033 隔離模擬資料；模型為離線替身','cases':records,'audit':get('/api/audit')['records']}
    (root/'docs/evidence/issue29/G2-隔離HTTP結果.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'已匯出 {len(records)} 個案例及 {len(result["audit"])} 筆稽核。')
