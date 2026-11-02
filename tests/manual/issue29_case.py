"""透過公開 HTTP 建立合法隔離草稿；實際核對及確認由瀏覽器操作。"""
import json
import sys
from pathlib import Path
import httpx

case=sys.argv[1]
with httpx.Client(base_url='http://127.0.0.1:8033') as c:
    def get(path):
        r=c.get(path);r.raise_for_status();return r.json()
    def post(path,body):
        r=c.post(path,json=body);r.raise_for_status();return r.json()
    post('/api/session/demo',{'identity':'supervisor'})
    action=case
    intent=None
    if case=='query-page':action='';args={}
    elif case=='partial-focus':action='report.add';args={'ok':125,'defects':[{'code':'NG01','quantity':3}]}
    elif case.startswith('report.'):
        record=get('/api/workspace?module=report&execution_id=2001')['records'][0]
        if case=='report.add':args={'execution_id':'2001','ok':125,'defects':[{'code':'NG01','quantity':3},{'code':'NG02','quantity':2}]}
        elif case in {'report.update','report.delete'}:
            report=record['REPORTS'][-1]
            args={'report_id':report['WIP_OPI_WDOEACICOOUTPUT_HIST_SID']}
            if case=='report.update':args.update(ok=130,defects=[{'code':'NG01','quantity':1}])
        elif case=='report.cavities':args={'execution_id':'2001','cavities':3}
        else:args={'schedule_id':'1001'}
    elif case.startswith('mold.'):
        args={'schedule_id':'1003'}
    elif case in {'schedule.new','schedule.edit'}:
        action='schedule.save';intent='create' if case=='schedule.new' else 'update'
        args={'equipment':'MC36','part_no':'P-102','mold_no':'MOLD-A','start_time':'2026-11-03 08:00','cycle_seconds':60,'target_shots':10,'status':'DO','priority':0,'comment':'Issue29 隔離多工單驗收',
              'details':[{'mold_detail_id':'61','part_no':'P-102','wo':'WO-261102-0382','cavities':2},{'mold_detail_id':'62','part_no':'EPS-B','wo':'WO-B','cavities':1}]}
        if intent=='update':
            row=next(r for r in get('/api/workspace?module=schedule')['records'] if r.get('COMMENT')==args['comment'])
            args['schedule_id']=row['ZZ_KAOSU_PROD_SCHEDULE_SID']
            args['details']=[{'detail_id':d['ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID'],'mold_detail_id':d['TOL_DETALS_SID'],'part_no':d['PART_NO'],'wo':d['WO'] if i==0 else '', 'cavities':3 if i==0 else 0} for i,d in enumerate(row['DETAILS'])]
    else:raise ValueError(case)
    module=action.split('.')[0] if action else 'report'
    cid=post('/api/conversations',{'module':module,'locale':'zh-TW'})['id']
    post(f'/api/conversations/{cid}/metadata',{'version':0,'title':'G2｜'+case})
    guide=post(f'/api/conversations/{cid}/guide',{'version':0,'action':action,'args':args,'intent':intent,'step':'target' if case=='query-page' else 'details'})
    post(f'/api/conversations/{cid}/query',{'version':0,'filters':{'equipment':'MC37' if module=='report' else 'MC36','page_size':1 if case=='query-page' else 20}})
    if action and action not in {'report.add','report.update','report.cavities','schedule.save'}:
        post(f'/api/conversations/{cid}/proposals',{'version':guide['version'],'action':action,'args':guide['args']})
    entry={'case':case,'conversation':cid,'guide':get(f'/api/conversations/{cid}/guide')}
    path=Path(__file__).resolve().parents[2]/'.local/issue29-cases.jsonl'
    with path.open('a',encoding='utf-8') as out:out.write(json.dumps(entry,ensure_ascii=False)+'\n')
    print(json.dumps({'case':case,'conversation':cid},ensure_ascii=False))
