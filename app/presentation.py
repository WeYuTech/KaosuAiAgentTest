"""機器可讀錯誤碼與呈現語言；原始 detail 保留相容。"""
import re

MESSAGES = {
    "guide_stale": ("草稿已更新，請重新讀取後再試。", "The draft changed. Reload it before continuing.", "ฉบับร่างมีการเปลี่ยนแปลง โปรดโหลดใหม่ก่อนดำเนินการ"),
    "conversation_busy": ("上一則訊息仍在處理，請稍後再試。", "The previous message is still processing. Please wait.", "ข้อความก่อนหน้ายังประมวลผลอยู่ โปรดรอสักครู่"),
    "outcome_unknown": ("結果待核對，請查核執行結果；不得重送。", "The result is unknown. Reconcile the operation; do not resubmit it.", "ยังไม่ทราบผล โปรดตรวจสอบผลการดำเนินการ ห้ามส่งซ้ำ"),
    "guide_invalid": ("草稿欄位格式或範圍不符，請修正指定欄位。", "A draft field has an invalid format or value. Correct the indicated field.", "รูปแบบหรือค่าของช่องข้อมูลไม่ถูกต้อง โปรดแก้ไขช่องที่ระบุ"),
    "guide_action": ("請選擇目前模組允許的操作。", "Select an operation allowed in this module.", "โปรดเลือกการดำเนินการที่อนุญาตในโมดูลนี้"),
    "validation": ("資料未通過卡控，請核對內容。", "Validation failed. Please check the operation details.", "ข้อมูลไม่ผ่านการตรวจสอบ โปรดตรวจสอบรายละเอียด"),
    "unauthorized": ("登入失效，請重新登入。", "Your session is invalid. Please sign in again.", "เซสชันไม่ถูกต้อง โปรดเข้าสู่ระบบอีกครั้ง"),
    "forbidden": ("目前身分沒有操作權限。", "Your account is not authorized for this operation.", "บัญชีของคุณไม่มีสิทธิ์ดำเนินการนี้"),
    "not_found": ("找不到指定資料。", "The requested record was not found.", "ไม่พบข้อมูลที่ระบุ"),
    "conflict": ("資料狀態已變更，請重新核對。", "The operation state changed. Please review it again.", "สถานะข้อมูลเปลี่ยนแปลง โปรดตรวจสอบอีกครั้ง"),
    "unavailable": ("服務暫時無法完成請求，請稍後再試。", "The service could not complete the request. Please try again later.", "บริการไม่สามารถดำเนินการได้ในขณะนี้ โปรดลองอีกครั้งภายหลัง"),
    "linked_reports": ("明細已有報工，不能刪除或直接更換關聯；請先採獨立核准的清理流程。", "This detail has production reports. Do not delete it or change its linked order, part or mold detail; use a separately approved cleanup process.", "รายการนี้มีรายงานการผลิตแล้ว ห้ามลบหรือเปลี่ยนใบสั่ง ชิ้นส่วน หรือรายละเอียดแม่พิมพ์ ต้องใช้กระบวนการจัดการที่อนุมัติแยกต่างหาก"),
    "proposal_expired": ("確認卡已過期，請重新產生。", "The confirmation card expired. Prepare a new card after checking the current data.", "บัตรยืนยันหมดอายุ โปรดตรวจสอบข้อมูลปัจจุบันและสร้างบัตรใหม่"),
    "stale": ("資料已變更，請重新產生確認卡。", "The data changed. Reload it and prepare a new confirmation card.", "ข้อมูลเปลี่ยนแปลง โปรดโหลดข้อมูลและสร้างบัตรยืนยันใหม่"),
    "scope_too_large": ("資料範圍過大，請指定日期或設備。", "Too many records. Specify an equipment or a narrower date range.", "มีข้อมูลมากเกินไป โปรดระบุเครื่องจักรหรือช่วงวันที่ที่แคบลง"),
    "live_write_locked": ("正式寫入尚未啟用，可保留草稿請管理員核對。", "Live writes are disabled. Keep the draft and contact the administrator.", "ยังไม่เปิดใช้งานการบันทึกข้อมูลจริง โปรดเก็บฉบับร่างและติดต่อผู้ดูแลระบบ"),
}

FIELD_NAMES = {
    "execution_id": ("作業紀錄", "Execution record", "รายการปฏิบัติงาน"), "report_id": ("報工紀錄", "Production report", "รายงานการผลิต"),
    "schedule_id": ("排程", "Schedule", "แผนการผลิต"), "equipment": ("設備", "Equipment", "เครื่องจักร"),
    "part_no": ("品號", "Part", "ชิ้นส่วน"), "mold_no": ("模具", "Mold", "แม่พิมพ์"), "start_time": ("開始時間", "Start time", "เวลาเริ่มต้น"),
    "cycle_seconds": ("週期秒數", "Cycle seconds", "รอบเวลาเป็นวินาที"), "target_shots": ("目標模次", "Target shots", "จำนวนรอบเป้าหมาย"),
    "cavities": ("模穴數", "Cavities", "จำนวนโพรงแม่พิมพ์"), "ok": ("人工良品數", "Manual good quantity", "จำนวนชิ้นงานดีที่รายงานด้วยตนเอง"),
    "defects": ("不良明細", "Defect details", "รายละเอียดของเสีย"), "quantity": ("不良數", "Defect quantity", "จำนวนของเสีย"),
    "code": ("不良原因", "Defect reason", "สาเหตุของเสีย"), "details": ("排程明細", "Schedule details", "รายละเอียดแผนการผลิต"),
    "wo": ("工單", "Work order", "ใบสั่งผลิต"), "status": ("生產狀態", "Production status", "สถานะการผลิต"),
    "priority": ("優先序", "Priority", "ลำดับความสำคัญ"), "comment": ("備註", "Comment", "หมายเหตุ"),
    "mold_detail_id": ("模具明細", "Mold detail", "รายละเอียดแม่พิมพ์"), "detail_id": ("排程明細識別", "Schedule detail", "รายการแผนการผลิต"),
    "intent": ("新增或修改", "Create or update", "สร้างหรือแก้ไข"),
}
ACTION_NAMES = {
    "mold.mount_start": ("開始上模", "Start mounting", "เริ่มติดตั้งแม่พิมพ์"), "mold.mount_finish": ("完成上模", "Finish mounting", "ติดตั้งแม่พิมพ์เสร็จ"),
    "mold.unmount_start": ("開始下模", "Start unmounting", "เริ่มถอดแม่พิมพ์"), "mold.unmount_finish": ("完成下模", "Finish unmounting", "ถอดแม่พิมพ์เสร็จ"),
}


def field_name(path, index):
    key = re.sub(r"\[\d+\]", "", str(path)).split(".")[-1]
    label = FIELD_NAMES.get(key, (key, key, key))[index]
    row = re.search(r"\[(\d+)\]", str(path))
    return label + (f" ({int(row[1]) + 1})" if row else "")


def rule_message(params, index):
    field = field_name(params.get("field", ""), index)
    rule = params.get("rule")
    if rule in {"range", "integer_range"}:
        lo, hi = params.get("minimum", 0), params.get("maximum", 2147483647)
        return (f"{field}須為 {lo} 至 {hi} 的整數。", f"{field} must be a whole number from {lo} to {hi}.", f"{field} ต้องเป็นจำนวนเต็มระหว่าง {lo} ถึง {hi}")[index]
    if rule == "type":
        kind = {"integer": ("整數", "a whole number", "จำนวนเต็ม"), "array": ("明細清單", "a list of details", "รายการรายละเอียด"), "object": ("欄位物件", "a set of fields", "ชุดข้อมูล"), "string": ("文字", "text", "ข้อความ")}.get(params.get("expected"), ("正確格式", "the correct format", "รูปแบบที่ถูกต้อง"))[index]
        return (f"{field}須為{kind}。", f"{field} must be {kind}.", f"{field} ต้องเป็น{kind}")[index]
    if rule == "missing":
        fields = ", ".join(field_name(key, index) for key in params.get("fields", []))
        return (f"請補充：{fields}。", f"Please provide: {fields}.", f"โปรดระบุ: {fields}")[index]
    if rule == "mold_stage":
        action = ACTION_NAMES.get(params.get("expected_action"))
        next_action = action[index] if action else ("重新查詢並核對所有工單", "reload and check all work orders", "โหลดข้อมูลใหม่และตรวจสอบใบสั่งผลิตทั้งหมด")[index]
        return (f"換模階段不符，請先{next_action}。", f"The mold stage does not allow this operation. Next: {next_action}.", f"ขั้นตอนแม่พิมพ์ไม่อนุญาตการดำเนินการนี้ ขั้นตอนถัดไป: {next_action}")[index]
    rules = {
        "time_format": ("請填寫 MES 當地日期時間，例如 2026-10-30 08:00。", "Enter a valid MES local date and time, for example 2026-10-30 08:00.", "โปรดระบุวันที่และเวลาท้องถิ่นของ MES เช่น 2026-10-30 08:00"),
        "time_order": ("時間早於上一階段，請核對 MES 伺服器時間。", "This time is earlier than the previous stage. Check the MES server clock.", "เวลานี้ก่อนขั้นตอนก่อนหน้า โปรดตรวจสอบเวลาของเซิร์ฟเวอร์ MES"),
        "work_order_match": ("請選擇符合品號的工單；非零模穴不得省略工單。", "Select a work order for this part. Nonzero cavities require a work order.", "โปรดเลือกใบสั่งผลิตที่ตรงกับชิ้นส่วน จำนวนโพรงที่ไม่เป็นศูนย์ต้องมีใบสั่งผลิต"),
        "work_order_required": ("至少選擇一筆有效工單，零模穴工單也可保留。", "Select at least one valid work order; a valid zero-cavity order is allowed.", "เลือกใบสั่งผลิตที่ถูกต้องอย่างน้อยหนึ่งรายการ อนุญาตรายการที่มีจำนวนโพรงเป็นศูนย์"),
        "already_completed": ("排程已完工，請勿重複完工。", "This schedule is already complete. Do not complete it again.", "แผนการผลิตนี้เสร็จสิ้นแล้ว ห้ามดำเนินการเสร็จสิ้นซ้ำ"),
        "no_mount_record": ("沒有上模紀錄可清除，請核對排程。", "There is no mounting record to clear. Check the schedule.", "ไม่มีบันทึกการติดตั้งให้ล้าง โปรดตรวจสอบแผนการผลิต"),
        "enum": (f"{field}不在允許選項內，請重新選擇。", f"{field} is not an allowed option. Select a valid option.", f"{field} ไม่อยู่ในตัวเลือกที่อนุญาต โปรดเลือกใหม่"),
        "maxLength": (f"{field}文字過長，請縮短。", f"{field} is too long. Shorten the text.", f"{field} ยาวเกินไป โปรดย่อข้อความ"),
        "maxItems": ("明細超過 500 筆，請縮小範圍。", "More than 500 details. Reduce the scope.", "มีรายละเอียดเกิน 500 รายการ โปรดลดขอบเขต"),
        "additionalProperties": ("請移除未允許的草稿欄位。", "Remove unsupported draft fields.", "โปรดลบช่องข้อมูลที่ไม่รองรับ"),
        "create_target": ("新增排程不可帶入既有排程識別；如需改原排程，請先選修改。", "A new schedule cannot use an existing schedule ID. Select Update if you intend to edit it.", "แผนใหม่ไม่สามารถใช้รหัสแผนเดิมได้ หากต้องการแก้ไข โปรดเลือกแก้ไขก่อน"),
    }
    return rules[rule][index] if rule in rules else None


def error_payload(detail, status, locale="zh-TW"):
    default = {401: "unauthorized", 403: "forbidden", 404: "not_found", 409: "conflict", 422: "validation"}.get(status, "unavailable")
    code = detail.get("code", default) if isinstance(detail, dict) else default
    if detail == "確認卡已過期，請重新產生":
        code = "proposal_expired"
    params = detail.get("params", {}) if isinstance(detail, dict) else {}
    translations = MESSAGES.get(code, MESSAGES[default])
    index = {"zh-TW": 0, "en": 1, "th": 2}.get(locale, 0)
    message = (detail.get("message", translations[0]) if isinstance(detail, dict) else detail) if index == 0 else translations[index]
    message = rule_message(params, index) or message
    return {"detail": detail, "code": code, "params": params, "message": message}
