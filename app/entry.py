"""未綁模組的入口紀錄與一次交接；沿用 JSON Store，不新增資料表。"""
import os
import secrets
from datetime import timedelta
from typing import Literal

from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field


class EntryMessage(BaseModel):
    model_config = ConfigDict(extra='forbid')
    entry_id: str = Field(min_length=8, max_length=100)
    request_id: str = Field(min_length=8, max_length=100)
    text: str = Field(min_length=1, max_length=4000)
    locale: Literal['zh-TW', 'en', 'th'] = 'zh-TW'
    context: dict = Field(default_factory=dict)
    module_choice: Literal['schedule','report','mold'] | None = None


def install(app, store, actor_for, allowed, now, create_conversation, process_message, classifier=None, launch_stream=None):
    from app.main import Conversation, Message
    from app.intents import classify
    from app.domain import actions

    def receipt(db, rid, actor):
        row = store.get(db, 'STATE', 'entry-request:v1:'+rid)
        if not row or row['actor_id'] != actor['id']:
            raise HTTPException(404, '找不到這筆入口訊息')
        return row

    def view(row):
        if row['status'] == 'processing' and row['expires_at'] < now().isoformat():
            return {'status': 'unknown', 'request_id': row['id'], 'conversation_id': row.get('conversation_id'), 'module':row.get('module')}
        return {'status': row['status'], 'request_id': row['id'], **row.get('result', {}), 'conversation_id': row.get('conversation_id'), 'module':row.get('module')}

    @app.get('/api/entry/requests/{rid}')
    def read_receipt(rid: str, request: Request):
        actor = actor_for(request)
        with store.transaction() as db:
            row = receipt(db, rid, actor)
            if row['status']=='processing' and row['expires_at'] < now().isoformat():
                # 過期只查回既有工作，撤銷舊回呼；沒有工作時明確結束入口租約。
                convo=store.get(db,'CONVERSATION',row['conversation_id']) if row.get('conversation_id') else None
                entry=store.get(db,'STATE','entry:v1:'+row['entry_id'])
                row['token']=secrets.token_urlsafe(24)
                row['status']='routed' if convo else 'failed'
                row['result']={'messages':convo['messages'] if convo else (entry or {}).get('messages',[]),'error':'訊息處理逾時；已查核並保留原作業，沒有自動重送。' if convo else '訊息處理逾時，沒有建立作業；原句仍保留。'}
                if convo and (convo.get('processing') or {}).get('expires_at','') < now().isoformat():
                    convo.pop('processing',None)
                    store.put(db,'CONVERSATION',convo['id'],convo)
                if entry and entry.get('processing')==rid:
                    entry.pop('processing',None)
                    store.put(db,'STATE','entry:v1:'+row['entry_id'],entry)
                store.put(db,'STATE','entry-request:v1:'+rid,row)
            return view(row)

    @app.get('/api/entry/{eid}')
    def read_entry(eid: str, request: Request):
        actor = actor_for(request)
        with store.transaction() as db:
            row = store.get(db, 'STATE', 'entry:v1:'+eid)
        if not row or row['actor_id'] != actor['id']:
            raise HTTPException(404, '找不到入口對話')
        return {'id': eid, 'messages': row['messages']}

    if launch_stream:
        @app.post('/api/entry/messages/stream')
        def stream_entry(body: EntryMessage, request: Request):
            actor = actor_for(request)
            return launch_stream(actor, body.locale, lambda: entry_message(body, request))

    @app.post('/api/entry/messages')
    def entry_message(body: EntryMessage, request: Request):
        actor = actor_for(request)
        if not body.text.strip():
            raise HTTPException(422, '請輸入問題')
        if body.module_choice:
            allowed(actor, body.module_choice)
        token = secrets.token_urlsafe(24)
        with store.transaction() as db:
            existing = store.get(db, 'STATE', 'entry-request:v1:'+body.request_id)
            if existing:
                row = receipt(db, body.request_id, actor)
                if row['entry_id'] != body.entry_id or row['text'] != body.text or row.get('module_choice') != body.module_choice:
                    raise HTTPException(409, '訊息識別已用於其他內容')
                return view(row)
            entry = store.get(db, 'STATE', 'entry:v1:'+body.entry_id)
            if entry and entry['actor_id'] != actor['id']:
                raise HTTPException(404, '找不到入口對話')
            if entry and entry.get('processing'):
                raise HTTPException(409, {'code': 'entry_unresolved', 'message': '前一則訊息待查核，請先讀取原訊息結果。', 'request_id': entry['processing']})
            entry = entry or {'id': body.entry_id, 'actor_id': actor['id'], 'messages': []}
            row = {'id': body.request_id, 'actor_id': actor['id'], 'entry_id': body.entry_id,
                   'text': body.text, 'module_choice':body.module_choice, 'status': 'processing', 'token': token,
                   'expires_at': (now()+timedelta(minutes=10)).isoformat()}
            entry['processing'] = body.request_id
            store.put(db, 'STATE', 'entry:v1:'+body.entry_id, entry)
            store.put(db, 'STATE', 'entry-request:v1:'+body.request_id, row)
        conversation_id = None
        try:
            language = body.locale
            def L(zh, en, th):
                return en if language == 'en' else th if language == 'th' else zh
            messages = entry['messages'] + [{'role':'user','content':body.text}]
            context = {'module': body.module_choice, 'messages': messages, 'locale': language}
            from app.model import budget_store
            from app.management import settings
            ledger=budget_store()
            with ledger.transaction() as db:
                context['model_settings']=settings(db,ledger)
            if not os.getenv('OPENAI_API_KEY') and not classifier:
                decision = {'intent':'capabilities','module':'none'}
                status = 'model_unavailable'
            else:
                from app.streaming import tracked
                decision = tracked("classify", lambda: classifier(context) if classifier else classify(context, actor['roles']))
                status = 'answered'
            fresh=actor_for(request)
            if fresh['id']!=actor['id']:
                raise HTTPException(401,'登入身分已改變')
            actor=fresh
            with store.transaction() as db:
                active=receipt(db,body.request_id,actor)
                if active['token']!=token or active['expires_at'] < now().isoformat():
                    raise HTTPException(409,'入口訊息已過期，請查核原訊息')
            from app.streaming import active
            if active.get():
                active.get().intent(decision.get("intent") != "change")
            intent, module = decision.get('intent'), body.module_choice or decision.get('module', 'none')
            permitted = {name: schema for name,schema in actions().items() if name.split('.')[0] in actor['roles']}
            choices = [m for m in ('schedule','report','mold') if m in actor['roles']]
            result = {'choices': choices, 'actions': list(permitted)}
            if intent == 'capabilities':
                labels = {'schedule':L('生產排程','Production scheduling','วางแผนการผลิต'), 'report':L('生產報工','Production reporting','รายงานการผลิต'), 'mold':L('模具上下模','Mold mounting/removal','ติดตั้งและถอดแม่พิมพ์')}
                content = L('依目前身分，可協助：','For your current role, I can help with: ','ตามสิทธิ์ปัจจุบัน ฉันช่วยได้: ')+'、'.join(labels[m] for m in choices)
                content += L('。可查詢資料、填寫作業與核對；寫入仍需人工確認。',' You can query, fill in and review operations. Writes require human confirmation.',' ค้นหา กรอก และตรวจสอบงาน การบันทึกต้องได้รับการยืนยันจากคุณ')
                if status == 'model_unavailable':
                    content += L('\nAI 尚未設定，這是目前可用功能清單；請點選作業捷徑使用人工流程。','\nAI is not configured. This is the available feature list; choose a task to use the manual workflow.','\nยังไม่ได้ตั้งค่า AI นี่คือรายการฟังก์ชันที่ใช้ได้ โปรดเลือกงานเพื่อทำด้วยตนเอง')
            elif intent == 'greeting':
                content = L('你好，我在。你可以直接問生產問題，例如「查 MC37 今天的工單」，或說明想完成的作業。','Hello! Ask a production question or describe the operation you need.','สวัสดี ถามข้อมูลการผลิตหรือบอกงานที่ต้องการได้เลย')
                status = 'answered'
            elif intent == 'unsupported' or module == 'none':
                content = L('你想查詢生產資料，還是進行排程、報工或模具作業？可以繼續補充需求，原句已保留。','Would you like to query production data or perform an operation? Add details; your original request is retained.','ต้องการดูข้อมูลการผลิตหรือทำงานใด โปรดเพิ่มรายละเอียด ข้อความเดิมถูกเก็บไว้') if intent != 'unsupported' else L('這個需求超出目前 MES 助理支援的範圍；我能查詢生產資料，並協助排程、報工與模具上下模。你可以補充相關需求，或使用下方捷徑。','This request is outside the MES assistant scope. I can query production data and help with scheduling, reporting and mold operations. Add a related request or use a shortcut.','คำขอนี้อยู่นอกขอบเขตผู้ช่วย MES รองรับข้อมูลการผลิต การวางแผน รายงานผลผลิต และแม่พิมพ์ ระบุคำขอที่เกี่ยวข้องหรือใช้ทางลัดได้')
                status = 'clarify' if intent != 'unsupported' else 'unsupported'
            elif intent in ('readonly','change','clarify'):
                allowed(actor, module)
                with store.transaction() as db:
                    unresolved = next((p for p in store.all(db, 'PROPOSAL') if p['actor_id']==actor['id'] and p['status'] in ('pending','unknown')), None)
                if unresolved:
                    result.update(recovery_proposal_id=unresolved['id'], recovery_conversation_id=unresolved.get('conversation_id'))
                    content = L('原作業尚未完成，請先返回確認、取消或查核。','An operation is unresolved. Return to confirm, cancel or reconcile it first.','ยังมีงานค้าง โปรดกลับไปยืนยัน ยกเลิก หรือตรวจสอบก่อน')
                    status = 'recovery_required'
                else:
                    convo = create_conversation(Conversation(module=module, context=body.context, locale=body.locale), actor)
                    conversation_id = convo['id']
                    with store.transaction() as db:
                        # 交接前先登錄對話，逾時只能查核此識別，不建立第二份。
                        active=receipt(db,body.request_id,actor)
                        if active['token']!=token or active['expires_at'] < now().isoformat():
                            raise HTTPException(409,'入口訊息已過期，請查核原訊息')
                        convo['messages'] = entry['messages']
                        store.put(db, 'CONVERSATION', conversation_id, convo)
                        active['conversation_id'] = conversation_id
                        active['module'] = module
                        store.put(db, 'STATE', 'entry-request:v1:'+body.request_id, active)
                    reply = process_message(conversation_id, Message(text=body.text), request, decision)
                    result.update(module=module, reply=reply)
                    messages = reply['messages']
                    content = None
                    status = 'routed'
            else:
                raise HTTPException(502, '無法確認入口意圖，原文保留')
            if content is not None:
                messages.append({'role':'assistant','content':content, **({'processing_summary':active.get().snapshot()} if active.get() else {})})
            result['messages'] = messages
            with store.transaction() as db:
                row = receipt(db, body.request_id, actor)
                if row['token'] != token:
                    raise HTTPException(409, '入口情境已改變')
                row.update(status=status, result=result)
                store.put(db,'STATE','entry-request:v1:'+body.request_id,row)
                entry['messages']=messages
                entry.pop('processing',None)
                store.put(db,'STATE','entry:v1:'+body.entry_id,entry)
            return view(row)
        except Exception as exc:
            with store.transaction() as db:
                row = receipt(db, body.request_id, actor)
                if row['token'] == token:
                    row.update(status='failed',result={'messages':entry['messages']+[{'role':'user','content':body.text}], 'error':str(exc.detail) if isinstance(exc,HTTPException) else '入口處理未完成；請查核原紀錄', 'conversation_id':conversation_id})
                    store.put(db,'STATE','entry-request:v1:'+body.request_id,row)
                    entry['messages']=row['result']['messages']
                    entry.pop('processing',None)
                    store.put(db,'STATE','entry:v1:'+body.entry_id,entry)
            raise
