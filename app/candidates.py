"""固定來源的有界候選搜尋；不接受欄位、表名或任意 SQL。"""
from fastapi import HTTPException

KINDS = {'equipment','parts','work_orders','molds'}

def validate(kind, search='', part_no='', page=1, page_size=20):
    if kind not in KINDS or not 1 <= page <= 500 or not 1 <= page_size <= 100 or len(search)>100 or len(part_no)>100:
        raise HTTPException(422, '候選查詢條件無效')
    if kind in {'work_orders','molds'} and not part_no:
        raise HTTPException(422, '請先選擇品號，再搜尋工單或模具')

def envelope(kind, records, search, part_no, page, page_size, has_more):
    return {'kind':kind,'records':records,'filters':{'search':search,'part_no':part_no},'page':page,'page_size':page_size,
            'has_more':has_more,'truncated':has_more,'total':None,'match':'contains','sort':'identifier_ascending'}

def simulation(state,kind,search='',part_no='',page=1,page_size=20):
    validate(kind,search,part_no,page,page_size)
    keys={'equipment':('EQP_NO','EQP_NAME'),'parts':('PART_NO','PART_SPEC'),'work_orders':('WO','PART_NO'),'molds':('TOL_NO','TOL_NAME')}
    records=list(state['tables']['EQP_MASTER'].values()) if kind=='equipment' else state['catalogs'][kind]
    records=[r for r in records if (not part_no or (part_no in r.get('PART_NOS',[]) if kind=='molds' else r.get('PART_NO')==part_no))
             and (not search or any(search.casefold() in str(r.get(k,'')).casefold() for k in keys[kind]))]
    records=sorted(records,key=lambda r:tuple(str(r.get(k,'')) for k in keys[kind]))
    offset=(page-1)*page_size
    return envelope(kind,records[offset:offset+page_size],search,part_no,page,page_size,len(records)>offset+page_size)

def live(bridge,actor,kind,search='',part_no='',page=1,page_size=20):
    validate(kind,search,part_no,page,page_size)
    bridge._authorize(actor,'schedule')
    sources={
        'equipment':('dbo.EQP_MASTER AS c',[],['c.EQP_TYPE=?'],['EPS'],['EQP_NO','EQP_NAME'],'EQP_NO'),
        'parts':('dbo.GET_ZZ_KAOSU_PLAN_PART(?) AS c',['EPS-FORMING'],[],[],['PART_NO','PART_SPEC'],'PART_NO'),
        'work_orders':('dbo.V_ZZ_SCHEDULE_WO_TOL_SID_NEW AS c',[],['c.PART_NO=?'],[part_no],['WO','PART_NO','WO_SID'],'WO'),
        # 原函式只回傳識別、作業與週期；名稱來自主檔，仍以函式決定可選範圍。
        'molds':('(SELECT m.TOL_NO,t.TOL_NAME,m.TOL_SID FROM dbo.GET_ZZ_KAOSU_PLAN_TOL(?,?) AS m LEFT JOIN dbo.TOL_MASTER AS t ON t.TOL_SID=m.TOL_SID) AS c',[part_no,'EPS-FORMING'],[],[],['TOL_NO','TOL_NAME','TOL_SID'],'TOL_NO'),
    }
    source,parameters,clauses,values,columns,order=sources[kind]
    if search:
        clauses.append('('+' OR '.join(f'c.[{column}] LIKE ?' for column in columns[:2])+')')
        values.extend([bridge._like(search)]*2)
    # DISTINCT 讓來源 join 重複列不影響穩定頁碼；識別欄位排序作為同名次序。
    order_columns=[order]+[column for column in columns if column!=order]
    sql='SELECT DISTINCT '+','.join(f'c.[{c}]' for c in columns)+f' FROM {source} WHERE '+(' AND '.join(clauses) or '1=1')
    sql+=' ORDER BY '+','.join(f'c.[{c}]' for c in order_columns)+' OFFSET ? ROWS FETCH NEXT ? ROWS ONLY'
    with bridge._db() as db:
        cursor=db.cursor();cursor.execute(sql,*parameters,*values,(page-1)*page_size,page_size+1)
        records=[{column:bridge._normal(value,column) for column,value in zip(columns,row)} for row in cursor.fetchall()]
    return envelope(kind,records[:page_size],search,part_no,page,page_size,len(records)>page_size)
