"""只用已執行工具的結構化資料組成三語步驟，不暴露內部欄位名稱。"""
from app.presentation import FIELD_NAMES, ACTION_NAMES

ACTIONS = {**ACTION_NAMES,
 'report.add': ('新增報工','Add production report','เพิ่มรายงานการผลิต'),
 'report.update': ('修改報工','Update production report','แก้ไขรายงานการผลิต'),
 'report.delete': ('刪除報工','Delete production report','ลบรายงานการผลิต'),
 'report.cavities': ('修改模穴','Update cavities','แก้ไขจำนวนโพรงแม่พิมพ์'),
 'report.complete': ('整張排程完工','Complete schedule','จบแผนการผลิต'),
 'schedule.save': ('儲存排程','Save schedule','บันทึกแผนการผลิต'),
 'mold.clear': ('清除換模紀錄','Clear mold records','ล้างบันทึกแม่พิมพ์')}


def result_label(kind, result, args, locale):
    index={'zh-TW':0,'en':1,'th':2}.get(locale,0)
    def L(*labels):return labels[index]
    if kind=='model':
        tools=any(item.type=='function_call' for item in result.output)
        return L('分析需求／規劃下一步','Analyze request / plan next step','วิเคราะห์คำขอ / วางแผนขั้นต่อไป') if tools else L('整理回覆','Compose reply','เรียบเรียงคำตอบ')
    if kind=='query' and isinstance(result,dict):
        filters=(result.get('query_context') or {}).get('filters') or (args[-1] if args and isinstance(args[-1],dict) else {})
        target=' / '.join(str(filters[k])[:80] for k in ('equipment','wo') if filters.get(k)) or L('作業資料','operation records','ข้อมูลงาน')
        count=len(result.get('records',[]))
        return L(f'已查詢 {target}（本頁 {count} 筆）',f'Queried {target} ({count} records on this page)',f'ค้นหา {target} แล้ว ({count} รายการในหน้านี้)')
    if kind=='knowledge':
        count=len(result)
        return L(f'已查詢已審核知識（命中 {count} 筆）',f'Reviewed knowledge searched ({count} matches)',f'ค้นหาความรู้ที่ตรวจสอบแล้ว ({count} รายการ)')
    if kind=='draft' and isinstance(result,dict):
        patch=args[0] if args else {}
        fields='、'.join(FIELD_NAMES[k][index] for k in patch.get('args',{}) if k in FIELD_NAMES)
        missing=len(result.get('missing',[]))
        return L(f'已更新草稿：{fields or "作業內容"}（尚缺 {missing} 項）',f'Draft updated: {fields or "operation details"} ({missing} fields missing)',f'ปรับปรุงฉบับร่าง: {fields or "รายละเอียดงาน"} (ยังขาด {missing} รายการ)')
    if kind=='proposal':
        action=(result.get('proposal') or {}).get('action') if isinstance(result,dict) else None
        action=action or (args[0] if args else None)
        name=ACTIONS.get(action,('作業','operation','งาน'))[index]
        return L(f'已建立{name}確認卡（尚未送出）',f'{name} confirmation prepared (not submitted)',f'เตรียมบัตรยืนยัน {name} แล้ว (ยังไม่ส่ง)')
    return None
