"""串流工作的事件紀錄；HTTP 連線與工作生命週期分離，不新增資料表。"""
import contextvars
import secrets
import threading
import time
from contextlib import contextmanager

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from app.store import dumps, PREFIX
from app.step_labels import result_label

RETENTION_SECONDS = 900

def cleanup_streams(store, timestamp=None):
    cutoff = time.time() if timestamp is None else timestamp
    with store.transaction() as db:
        db.execute(f"DELETE FROM {PREFIX}STATE WHERE id LIKE ? AND json_extract(data, '$.delete_after') <= ?", ("stream:v1:%", cutoff))

active = contextvars.ContextVar('stream_work', default=None)


class Stopped(Exception):
    pass


class Work:
    def __init__(self, store, actor, locale):
        self.store, self.actor, self.locale = store, actor, locale
        self.id, self.token = secrets.token_urlsafe(18), secrets.token_urlsafe(24)
        self.started = time.monotonic()
        self.steps = []
        self.events = []
        self.condition = threading.Condition()
        self.connected = True
        self.terminal = False
        cleanup_streams(store)
        self.readonly = None
        with store.transaction() as db:
            store.put(db, 'STATE', self.key, {'id': self.id, 'actor': actor['id'], 'token': self.token,
                      'steps': [], 'status': 'processing', 'readonly': None})

    @property
    def key(self):
        return 'stream:v1:' + self.id

    def emit(self, kind, **data):
        terminal = kind in ('done', 'error', 'stopped')
        # delta 與傳輸序列只存在記憶體；SQLite 僅保存步驟與控制／終態。
        if kind == 'step' or terminal:
            with self.store.transaction() as db:
                row = self.store.get(db, 'STATE', self.key)
                row['steps'] = self.steps
                if terminal:
                    row.update(status=kind, delete_after=time.time()+RETENTION_SECONDS)
                    row.pop('token', None)
                self.store.put(db, 'STATE', self.key, row)
        with self.condition:
            if self.connected:
                self.events.append({'event':kind, 'data':data})
            self.terminal = terminal
            if terminal:
                self.token = None
                for event in self.events:
                    if event['event']=='intent':event['data'].pop('token',None)
            self.condition.notify_all()
        if terminal:
            timer=threading.Timer(RETENTION_SECONDS, cleanup_streams, args=(self.store,))
            timer.daemon=True
            timer.start()

    def take_events(self):
        with self.condition:
            if not self.events and not self.terminal:
                self.condition.wait(1)
            events,self.events=self.events,[]
            return events,self.terminal

    def detach(self):
        with self.condition:
            self.connected=False
            self.events.clear()

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
        if self.readonly and row and row.get('stop'):
            raise Stopped()

    def snapshot(self):
        return {'steps': self.steps, 'elapsed_seconds': round(time.monotonic()-self.started, 1), 'request_id': self.id}


LABELS = {
    'classify': ('辨識需求', 'Identify request', 'ระบุความต้องการ'),
    'model': ('分析需求／規劃下一步', 'Analyze request / plan next step', 'วิเคราะห์คำขอ / วางแผนขั้นต่อไป'),
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
    except BaseException as exc:
        value['status'] = 'stopped' if isinstance(exc, Stopped) else 'failed'
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
        if value is not None and value.get('outcome') != 'failed':
            label = result_label(kind, result, args, active.get().locale)
            if label:value['label']=label
        return result


def check():
    if active.get():
        active.get().check()



@contextmanager
def watch_stream(events):
    """唯讀停止可關閉上游串流；瀏覽器斷線不設定 stop，因此不會觸發。"""
    work = active.get()
    finished = threading.Event()
    def watch():
        while not finished.wait(.1):
            try:
                work.check()
            except Stopped:
                events.close()
                return
    if work and hasattr(events, 'close'):
        threading.Thread(target=watch, daemon=True).start()
    try:
        yield
    finally:
        finished.set()


def install(app, store, actor_for, get_chat, process, message_type):
    # 同步工作由獨立執行緒持有；StreamingResponse 取消只終止事件讀取。
    def launch(actor, locale, fn):
        work = Work(store, actor, locale)
        work.emit("accepted", request_id=work.id)
        def run():
            binding = active.set(work)
            try:
                result = fn()
                work.emit('done', **result, processing_summary=work.snapshot())
            except Stopped:
                work.emit('stopped', **work.snapshot())
            except Exception as exc:
                work.emit('error', status=exc.status_code if isinstance(exc, HTTPException) else {"unauthorized":401,"forbidden":403}.get(getattr(exc,"code",None),502),
                          message={'zh-TW':'處理未完成，請查核原對話','en':'Processing failed. Check the original conversation.','th':'ประมวลผลไม่สำเร็จ โปรดตรวจสอบบทสนทนาเดิม'}.get(locale,'Processing failed'), processing_summary=work.snapshot())
            finally:
                active.reset(binding)
        threading.Thread(target=run, daemon=True).start()
        def events():
            try:
                yield ': accepted\n\n'
                while True:
                    batch, terminal = work.take_events()
                    for event in batch:
                        yield 'event: '+event['event']+'\ndata: '+dumps(event['data'])+'\n\n'
                    if terminal:return
                    if not batch:yield ': heartbeat\n\n'
            finally:
                work.detach()
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
            if not row or row['actor'] != actor['id'] :
                raise HTTPException(404, '找不到此請求')
            if row['status'] != 'processing':
                return {'status': row['status']}
            if not secrets.compare_digest(str(body.get('token', '')), row['token']):
                raise HTTPException(404, '找不到此請求')
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
