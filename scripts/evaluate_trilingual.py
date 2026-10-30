"""以正式累計帳本驗證三語模型；業務資料僅使用新建的隔離模擬庫。"""
import json
import os
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from fastapi.testclient import TestClient
from app.main import create_app
from app.model import budget_summary

SCENARIOS = {
    'zh-TW': [
        '請先查詢MC37的工單和人工良品、IoT數量，不修改。',
        '我要為正在生產的WO-A新增人工報工，請引導我補齊數量，現在先不要猜。',
        'MC37正在生產的WO-A，這次人工良品20個，沒有不良，請給我確認卡。',
        '先不要送，剛才那筆良品改成18個，仍然沒有不良，請重新給確認卡。',
    ],
    'en': [
        'Show work orders on MC37, manual good units and IoT quantities. Read only.',
        'I want to add a production record for the running WO-A. Help me supply the quantities; do not guess them.',
        'For running WO-A on MC37, record 20 manual good units and no defects. Give me a confirmation card.',
        'Do not submit. Change that draft to 18 good units, still no defects. Give me a replacement confirmation card.',
    ],
    'th': [
        'ขอดูใบสั่งผลิตของ MC37 จำนวนชิ้นงานดีที่บันทึกด้วยมือและจำนวน IoT ดูข้อมูลเท่านั้น ห้ามแก้ไข',
        'ต้องการเพิ่มบันทึกผลผลิตของ WO-A ที่กำลังผลิต ช่วยถามจำนวนที่ต้องกรอกก่อน อย่าเดาจำนวน',
        'สำหรับ WO-A ที่กำลังผลิตบน MC37 บันทึกชิ้นงานดีด้วยมือ 20 ชิ้น ไม่มีของเสีย ขอใบยืนยันก่อน',
        'ยังไม่ส่ง เปลี่ยนฉบับร่างเมื่อกี้เป็นชิ้นงานดี 18 ชิ้น ยังไม่มีของเสีย ขอใบยืนยันใหม่',
    ],
}


def run():
    previous = os.environ.get('MES_MODE')
    os.environ['MES_MODE'] = 'simulation'
    evidence = []
    passed = False
    try:
        with tempfile.TemporaryDirectory() as folder, TestClient(create_app(Path(folder) / 'trilingual.db')) as client:
            client.post('/api/session/demo', json={'identity': 'supervisor'}).raise_for_status()
            for locale, prompts in SCENARIOS.items():
                client.headers['X-AI-Locale'] = locale
                convo = client.post('/api/conversations', json={'module': 'report', 'locale': locale, 'context': {'EQP_NO': 'MC37'}}).json()
                old = None
                for index, prompt in enumerate(prompts):
                    before = client.get('/api/workspace?module=report').json()
                    response = client.post(f"/api/conversations/{convo['id']}/messages", json={'text': prompt})
                    evidence.append({'locale': locale, 'step': index + 1, 'http': response.status_code, 'response': response.json()})
                    response.raise_for_status()
                    body = response.json()
                    content = body['messages'][-1]['content']
                    assert not any(identifier in content for identifier in ('2001', '1001')), '正常產線回答不應顯示內部資料庫識別'
                    assert client.get('/api/workspace?module=report').json() == before, '自然語言不得直接寫入業務資料'
                    card = body.get('proposal')
                    if index < 2:
                        assert card is None, '查詢或缺少數量時不可產生可執行草稿'
                    else:
                        assert card and card['action'] == 'report.add' and card['args']['execution_id'] == '2001'
                        assert card['args']['ok'] == (20 if index == 2 else 18) and card['args']['defects'] == []
                        if old:
                            assert client.get(f"/api/proposals/{old['id']}").json()['proposal']['status'] == 'superseded'
                        old = card
                    guide = client.get(f"/api/conversations/{convo['id']}/guide").json()
                    if card:
                        assert guide['args']['ok'] == card['args']['ok'] and guide['step'] == 'review'
                    print(json.dumps({'locale': locale, 'step': index+1, 'status': 'passed'}), flush=True)
                digest = old['digest']
                client.post(f"/api/conversations/{convo['id']}/locale", json={'locale': 'th' if locale != 'th' else 'en'}).raise_for_status()
                assert client.get(f"/api/proposals/{old['id']}").json()['proposal']['digest'] == digest
                client.post(f"/api/proposals/{old['id']}/confirm", json={'digest': digest, 'approved': False}).raise_for_status()
            passed = True
    finally:
        if previous is None: os.environ.pop('MES_MODE', None)
        else: os.environ['MES_MODE'] = previous
        result = {'passed': passed, 'mode': 'simulation', 'source_business_writes': 0, 'evidence': evidence, 'budget': budget_summary()}
        output = ROOT / '.local' / 'trilingual-evaluation.json'
        output.parent.mkdir(exist_ok=True)
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        with (ROOT / '.local' / 'evaluation-history.jsonl').open('a', encoding='utf-8') as stream:
            stream.write(json.dumps(result, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    run()
