"""審查第 9 項：正式適配器使用假連線，完整執行讀取 SQL，不連正式 MES。"""
from copy import deepcopy
import re
import pytest
from app import domain
from app.mes import MesBridge, MesConfig, READ_COLUMNS, EXECUTION, SCHEDULE, DETAIL
from test_mes_http import NOW


class ReadConnection:
    def __init__(self, empty=False, no_next=False):
        self.state = domain.seed_state()
        self.empty = empty
        self.calls = []
        self.description = []
        self.rows = []
        self.commits = 0
        if no_next:
            self.state['tables'][EXECUTION]['2003']['COMPLETED'] = 'Y'
    def cursor(self): return self
    def execute(self, sql, *params):
        self.calls.append((sql, params))
        self.rows = []
        if sql == 'SELECT dbo.GET_DATETIME_STRING()':
            self.rows = [('2026-10-30 12:00:00',)]
        elif sql.startswith('SELECT ZZ_KAOSU_PROD_SCHEDULE_SID'):
            self.rows = [('1001',)]
        elif 'GET_ZZ_KAOSU_PLAN_TOL_DETAILS' in sql:
            records = deepcopy(self.state['catalogs']['molds'][0]['DETAILS'])
            for row in records: row['TOL_DETALS_NAME'] = '測試模具明細'
            self.result([] if self.empty else records, ['TOL_DETALS_SID','TOL_DETALS_NO','TOL_DETALS_NAME'])
        elif 'GET_ZZ_KAOSU_PROD_SCHEDULE_DETAIL' in sql:
            self.result([] if self.empty else [{**self.state['tables'][DETAIL]['1101'], 'TOL_DETALS_NO':'MOLD-A-L','TOL_DETALS_NAME':'測試模具明細'}], ['TOL_DETALS_NO','TOL_DETALS_NAME'])
        elif 'FROM dbo.[' in sql:
            table = re.search(r'FROM dbo.\[([^]]+)\]', sql)[1]
            records = list(self.state['tables'][table].values())
            if table == EXECUTION:
                records = [r for r in records if r['EQP_NO']=='MC37']
                if 'WHERE ZZ_KAOSU_PROD_SCHEDULE_SID=?' in sql:
                    records = [r for r in records if r['ZZ_KAOSU_PROD_SCHEDULE_SID']==params[0]]
            self.rows = [tuple(r.get(k) for k in READ_COLUMNS[table]) for r in records]
        elif 'BAS_REASON' in sql:
            self.rows = [('NG01','缺料')]
        elif not sql.startswith('SET TRANSACTION'):
            raise AssertionError('不允許非預期 SQL：'+sql)
        return self
    def result(self, records, columns):
        names = list(records[0]) if records else columns
        self.description = [(n,) for n in names]
        self.rows = [tuple(r.get(n) for n in names) for r in records]
    def fetchall(self): return self.rows
    def fetchmany(self,n): return self.rows[:n]
    def fetchone(self): return self.rows[0] if self.rows else None
    def rollback(self): pass
    def close(self): pass
    def commit(self): self.commits += 1


def bridge(db):
    b=MesBridge(MesConfig('https://mes.invalid','不含真實憑證',{'TEST':['report']},writes_enabled=False),connect=lambda write:db,clock=lambda:NOW)
    actor={'id':'TEST','name':'測試','modules':['report'],'_expires':NOW.timestamp()+30}
    actor['_proof']=b._sign(actor)
    return b,actor


def assert_read_only(db):
    assert db.commits==0
    assert all(sql.startswith(('SELECT','SET TRANSACTION')) for sql,_ in db.calls)


@pytest.mark.parametrize('empty',[False,True])
def test_正式報工明細函式有值或空集合均可讀且零寫入(empty):
    db=ReadConnection(empty=empty); b,_=bridge(db)
    rows=[deepcopy(db.state['tables'][EXECUTION]['2001'])]
    b._enrich_rows(db,'report',rows)
    assert rows[0]['mold_detail_name']==(None if empty else '測試模具明細')
    assert rows[0]['mold_detail_no']==(None if empty else 'MOLD-A-L')
    assert any('GET_ZZ_KAOSU_PROD_SCHEDULE_DETAIL' in sql for sql,_ in db.calls)
    assert_read_only(db)


@pytest.mark.parametrize('empty',[False,True])
def test_正式模穴預覽使用實際讀取路徑並帶回原值(empty):
    db=ReadConnection(empty=empty); b,actor=bridge(db)
    result=b.prepare(actor,'report','report.cavities',{'execution_id':'2001','cavities':0})
    assert result['target']['cavities_before']==2
    assert result['target']['mold_detail_name']==(None if empty else '測試模具明細')
    assert any('GET_ZZ_KAOSU_PLAN_TOL_DETAILS' in sql for sql,_ in db.calls)
    assert db.state['tables'][EXECUTION]['2001']['OPI_CAV']==2
    assert_read_only(db)


@pytest.mark.parametrize('no_next',[False,True])
def test_正式完工預覽回傳下一排程或明確空值且不寫入(no_next):
    db=ReadConnection(no_next=no_next); b,actor=bridge(db)
    result=b.prepare(actor,'report','report.complete',{'schedule_id':'1001'})
    target=result['target']
    assert target['affected_orders']==['WO-A','WO-B']
    assert target['next_schedule']==(None if no_next else {'orders':['WO-A'],'start_time':'2026-10-30 12:00:00'})
    assert db.state['tables'][EXECUTION]['2001']['COMPLETED']=='N'
    assert_read_only(db)
