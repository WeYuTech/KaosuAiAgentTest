"""串流工作的事件紀錄；HTTP 連線與工作生命週期分離，不新增資料表。"""
import contextvars
import secrets
import threading
import time
from contextlib import contextmanager

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from app.store import dumps

active = contextvars.ContextVar('stream_work', default=None)


class Stopped(Exception):
    pass


class Work:
    def __init__(self, store, actor, locale):
        self.store, self.actor, self.locale = store, actor, locale
        self.id, self.token = secrets.token_urlsafe(18), secrets.token_urlsafe(24)
        self.started = time.monotonic()
        self.steps = []
        self.readonly = None
        with store.transaction() as db:
            store.put(db, 'STATE', self.key, {'id': self.id, 'actor': actor['id'], 'token': self.token,
                      'events': [], 'status': 'processing', 'readonly': None})

    @property
    def key(self):
        return 'stream:v1:' + self.id

    def emit(self, kind, **data):
        with self.store.transaction() as db:
            row = self.store.get(db, 'STATE', self.key)
            row['events'].append({'event': kind, 'data': data})
            if kind in ('done', 'error', 'stopped'):
                row['status'] = kind
            self.store.put(db, 'STATE', self.key, row)

    def intent(self, readonly):
        self.readonly = readonly
        with self.store.transaction() as db:
            row = self.store.get(db, 'STATE', self.key)
            row['readonly'] = readonly
            self.store.put(db, 'STATE', self.key, row)
        self.emit('intent', readonly=readonly, request_id=self.id, token=self.token)
        self.check()

    def check(self):
        with self.store.transaction() as db:
            row = self.store.get(db, 'STATE', self.key)
        if self.readonly and row.get('stop'):
            raise Stopped()

    def snapshot(self):
        return {'steps': self.steps, 'elapsed_seconds': round(time.monotonic()-self.started, 2), 'request_id': self.id}


LABELS = {
    'classify': ('辨識需求', 'Identify request', 'ระบุความต้องการ'),
    'model': ('整理回覆', 'Compose reply', 'เรียบเรียงคำตอบ'),
    'query': ('查詢作業資料', 'Query operation records', 'ค้นหาข้อมูลงาน'),
    'knowledge': ('查詢已審核知識', 'Search reviewed knowledge', 'ค้นหาความรู้ที่ตรวจสอบแล้ว'),
    'draft': ('更新作業草稿', 'Update operation draft', 'ปรับปรุงฉบับร่างงาน'),
    'proposal': ('建立確認卡（尚未送出）', 'Prepare confirmation (not submitted)', 'เตรียมบัตรยืนยัน (ยังไม่ส่ง)'),
}


@contextmanager
def step(kind):
    work = active.get()
    if not work:
        yield
        return
    work.check()
    labels = LABELS[kind]
    value = {'id': len(work.steps)+1, 'label': labels[{'zh-TW': 0, 'en': 1, 'th': 2}.get(work.locale, 0)], 'status': 'running'}
    work.steps.append(value)
    work.emit('step', **value)
    try:
        yield value
        work.check()
    except BaseException:
        value['status'] = 'failed'
        work.emit('step', **value)
        raise
    else:
        value['status'] = value.get('outcome', 'done')
        value.pop('outcome', None)
        work.emit('step', **value)


def tracked(kind, fn, *args, **kwargs):
    with step(kind) as value:
        result = fn(*args, **kwargs)
        if value is not None and isinstance(result, dict) and (result.get('saved') is False or result.get('error')):
            value['outcome'] = 'failed'
        return result


def check():
    if active.get():
        active.get().check()


def install(app, store, actor_for, get_chat, process, message_type):
    # 同步工作由獨立執行緒持有；StreamingResponse 取消只終止事件讀取。
    def launch(actor, locale, fn):
        work = Work(store, actor, locale)
        def run():
            binding = active.set(work)
            try:
                result = fn()
                work.emit('done', **result, processing_summary=work.snapshot())
            except Stopped:
                work.emit('stopped', **work.snapshot())
            except Exception as exc:
                work.emit('error', status=exc.status_code if isinstance(exc, HTTPException) else 502,
                          message={'zh-TW':'處理未完成，請查核原對話','en':'Processing failed. Check the original conversation.','th':'ประมวลผลไม่สำเร็จ โปรดตรวจสอบบทสนทนาเดิม'}.get(locale,'Processing failed'), processing_summary=work.snapshot())
            finally:
                active.reset(binding)
        threading.Thread(target=run, daemon=True).start()
        def events():
            cursor = 0
            yield ': accepted\n\n'
            while True:
                with store.transaction() as db:
                    row = store.get(db, 'STATE', work.key)
                for event in row['events'][cursor:]:
                    cursor += 1
                    yield 'event: '+event['event']+'\ndata: '+dumps(event['data'])+'\n\n'
                if row['status'] != 'processing':
                    return
                time.sleep(.04)
        return StreamingResponse(events(), media_type='text/event-stream', headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})

    from fastapi import Request
    # 使用既有 Pydantic 型別，避免動態閉包註記無法解析。
    def stream(cid: str, body: message_type, request: Request):
        actor = actor_for(request)
        convo = get_chat(cid, actor)
        return launch(actor, convo.get('locale', 'zh-TW'), lambda: process(cid, body, request))
    app.post('/api/conversations/{cid}/messages/stream')(stream)

    @app.post('/api/streams/{rid}/stop')
    def stop(rid: str, body: dict, request: Request):
        actor = actor_for(request)
        with store.transaction() as db:
            row = store.get(db, 'STATE', 'stream:v1:'+rid)
            if not row or row['actor'] != actor['id'] or not secrets.compare_digest(str(body.get('token', '')), row['token']):
                raise HTTPException(404, '找不到此請求')
            if row['status'] != 'processing':
                return {'status': row['status']}
            if row['readonly'] is not True:
                return {'status': 'waiting_stopped', 'cancelled': False}
            if row.get('conversation_id'):
                convo = store.get(db, 'CONVERSATION', row['conversation_id'])
                if (convo.get('processing') or {}).get('token') != row['token']:
                    raise HTTPException(409, '原請求已結束')
            row['stop'] = True
            store.put(db, 'STATE', 'stream:v1:'+rid, row)
        return {'status': 'stopping'}
    return launch
