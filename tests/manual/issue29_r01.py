"""保存實際 UI 返回前後的公開 HTTP 快照及請求紀錄差異。"""
import json
import sys
from pathlib import Path
import httpx
root=Path(__file__).resolve().parents[2]
case=next(row for row in reversed([json.loads(line) for line in (root/'.local/issue29-cases.jsonl').read_text(encoding='utf-8').splitlines()]) if row['case']=='schedule.new')
with httpx.Client(base_url='http://127.0.0.1:8033') as c:
    c.post('/api/session/demo',json={'identity':'supervisor'}).raise_for_status()
    cid=case['conversation'];data=c.get(f'/api/conversations/{cid}').json();guide=c.get(f'/api/conversations/{cid}/guide').json()
    card=guide['proposal'];snapshot={'conversation':cid,'revision':data['revision'],'guide_version':guide['version'],'proposal_id':card['id'],'digest':card['digest'],'expires_at':card['expires_at']}
    trace=(root/'.local/issue29-http.jsonl').read_text(encoding='utf-8').splitlines()
    path=root/'.local/issue29-r01-before.json'
    if sys.argv[1]=='before':path.write_text(json.dumps({'snapshot':snapshot,'offset':len(trace)}),encoding='utf-8');print(snapshot)
    else:
        before=json.loads(path.read_text(encoding='utf-8'));requests=[json.loads(line) for line in trace[before['offset']:]]
        mutations=[row for row in requests if row['method']=='POST' and row['path']!='/api/session/demo']
        result={'before':before['snapshot'],'after':snapshot,'unchanged':before['snapshot']==snapshot,'mutation_requests':mutations,'requests':requests}
        assert result['unchanged'] and not mutations, result
        (root/'docs/evidence/issue29/G2-R01-實際返回請求.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        print('返回前後版本、卡片與期限相同，額外 mutation／prepare／confirm 為 0。')
