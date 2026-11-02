/* 固定介面詞彙：中文原文為鍵，不翻譯 MES 主檔名稱或歷史訊息。 */
export const translations: Record<string, [string, string]> = Object.fromEntries(`
此處可切換模擬身分；正式 MES 沿用登入權限。|Switch simulation roles here. Production MES uses your signed-in permissions.|สลับบทบาทจำลองได้ที่นี่ ระบบ MES จริงใช้สิทธิ์ของผู้เข้าสู่ระบบ
沿用 MES 登入權限，請確認本次作業人員。|MES sign-in permissions apply. Confirm the operator.|ใช้สิทธิ์การเข้าสู่ระบบ MES กรุณายืนยันผู้ปฏิบัติงาน
定時報告|Scheduled reports|รายงานตามกำหนด
聊天側欄寬度|Chat sidebar width|ความกว้างแถบแชต
{0} 像素|{0} pixels|{0} พิกเซล
收合側欄|Collapse sidebar|ย่อแถบด้านข้าง
關閉搜尋|Close search|ปิดการค้นหา
封存聊天|Archived chats|แชตที่เก็บถาวร
縮窄側欄|Narrow sidebar|ลดความกว้างแถบ
加寬側欄|Widen sidebar|เพิ่มความกว้างแถบ
重設寬度|Reset width|คืนค่าความกว้าง
刪除聊天|Delete chat|ลบแชต
刪除聊天？|Delete chat?|ลบแชตหรือไม่?
可在「已刪除」還原；MES 業務與稽核紀錄保留。|Restore it from Deleted. MES operations and audit records are retained.|กู้คืนได้จากรายการที่ลบ ข้อมูลงาน MES และบันทึกตรวจสอบยังคงอยู่
名稱|Name|ชื่อ
請取消後重新開啟此操作。|Cancel and reopen this action.|ยกเลิกแล้วเปิดการดำเนินการนี้อีกครั้ง
儲存設定？|Save settings?|บันทึกการตั้งค่าหรือไม่?
調整額度？|Change budget?|ปรับวงเงินหรือไม่?
建立定時報告？|Create scheduled report?|สร้างรายงานตามกำหนดหรือไม่?
暫停定時報告？|Pause scheduled report?|หยุดรายงานตามกำหนดชั่วคราวหรือไม่?
恢復定時報告？|Resume scheduled report?|เปิดรายงานตามกำหนดต่อหรือไม่?
刪除定時報告？|Delete scheduled report?|ลบรายงานตามกำหนดหรือไม่?
停止後續執行；已開始的查詢可完成。|Stops future runs. Queries already started may finish.|หยุดการทำงานครั้งต่อไป การค้นหาที่เริ่มแล้วอาจทำจนเสร็จ
建立|Create|สร้าง
儲存|Save|บันทึก
次|calls|ครั้ง
金鑰已設定|Key configured|ตั้งค่าคีย์แล้ว
金鑰尚未設定|Key not configured|ยังไม่ได้ตั้งค่าคีย์
可查詢與準備草稿；寫入仍需人工確認。|Can query and prepare drafts. Writes require human confirmation.|ค้นหาและเตรียมฉบับร่างได้ การบันทึกต้องได้รับการยืนยันจากคน
每輪呼叫上限（次）|Call limit per turn|จำนวนครั้งสูงสุดต่อรอบ
快速填入（選用）|Quick fill (optional)|กรอกอย่างรวดเร็ว (ไม่บังคับ)
執行條件|Run conditions|เงื่อนไขการทำงาน
產生前一排程日的唯讀報告，不自動報工。|Read-only report for the previous schedule date. No automatic production entry.|รายงานแบบอ่านอย่างเดียวของวันแผนก่อนหน้า ไม่บันทึกผลผลิตอัตโนมัติ
執行說明|Execution details|รายละเอียดการทำงาน
依頻率於 MES 時間執行，不使用模型費用。|Runs at MES time at the selected frequency, without model costs.|ทำงานตามความถี่และเวลา MES ที่เลือก โดยไม่มีค่าใช้จ่ายโมเดล
報告操作|Report actions|การดำเนินการรายงาน
額度設定|Budget settings|การตั้งค่าวงเงิน
用量提醒比例（%）|Usage warning (%)|แจ้งเตือนการใช้งาน (%)
累計模型費用|Cumulative model cost|ค่าใช้จ่ายโมเดลสะสม
已使用|Spent|ใช้แล้ว
已預留|Reserved|สำรองแล้ว
累計上限|Cumulative limit|วงเงินสะสม
剩餘額度|Remaining budget|วงเงินคงเหลือ
費用明細|Cost details|รายละเอียดค่าใช้จ่าย
模型呼叫次數|Model calls|จำนวนการเรียกโมเดล
未知用量呼叫次數|Calls with unknown usage|จำนวนการเรียกที่ไม่ทราบการใช้งาน
累計帳本包含全部模型用量；未知用量保留預留，不重複加總。|The cumulative ledger includes all model usage. Unknown usage remains reserved and is not counted twice.|บัญชีสะสมรวมการใช้งานโมเดลทั้งหมด การใช้งานที่ไม่ทราบยังคงสำรองไว้และไม่นับซ้ำ
原作業已保留。先關閉視窗；完成或取消作業後，再重新整理。|Your task is retained. Close this window, complete or cancel the task, then refresh.|เก็บงานเดิมไว้แล้ว ปิดหน้าต่างนี้ ทำงานให้เสร็จหรือยกเลิก แล้วจึงรีเฟรช
摘要|Summary|สรุป
資料|Data|ข้อมูล
紀錄|Records|บันทึก
作業|Task|งาน
訊息尚未送出，請先處理資料保存錯誤。|Message not sent. Resolve the draft save error first.|ยังไม่ได้ส่งข้อความ กรุณาแก้ไขข้อผิดพลาดในการบันทึกก่อน
聊天範圍|Chat scope|หมวดแชต
聊天|Chats|แชต
尚無封存聊天|No archived chats yet|ยังไม่มีแชตที่เก็บถาวร
目前沒有已刪除的聊天|There are no deleted chats|ไม่มีแชตที่ลบในขณะนี้
清除搜尋|Clear search|ล้างการค้นหา
重試|Try again|ลองอีกครั้ง
正在載入報告…|Loading reports…|กำลังโหลดรายงาน…
正在解析條件…|Interpreting conditions…|กำลังแปลเงื่อนไข…
正在儲存設定…|Saving settings…|กำลังบันทึกการตั้งค่า…
已填入，請核對|Filled in. Please review.|กรอกแล้ว กรุณาตรวจสอบ
描述快速填入（選用）|Quick fill from description (optional)|กรอกเร็วจากคำอธิบาย (ไม่บังคับ)
報告條件|Report conditions|เงื่อนไขรายงาน
例如：每天 08:00 產生 MC37 的報工報告|For example: Every day at 08:00 generate a production report for MC37|ตัวอย่าง: ทุกวัน 08:00 สร้างรายงานผลผลิต MC37
依所選頻率，於 MES 時間產生前一排程日的唯讀報告；不自動報工，不使用模型費用。|At the selected frequency and MES time, generate a read-only report for the previous schedule date. No automatic production reporting or model cost.|สร้างรายงานอ่านอย่างเดียวของวันกำหนดการก่อนหน้าตามความถี่ที่เลือกและเวลา MES ไม่รายงานการผลิตอัตโนมัติและไม่มีค่าใช้จ่ายโมเดล
報告清單讀取失敗，請關閉後重新開啟。|Failed to load reports. Close and reopen this panel.|โหลดรายการรายงานไม่สำเร็จ กรุณาปิดแล้วเปิดหน้าต่างนี้อีกครั้ง
待處理 · 尚未取得回覆|Pending · No response received yet|รอดำเนินการ · ยังไม่ได้รับคำตอบ
請求已拒絕，未重新送出|Request rejected. Not resent.|คำขอถูกปฏิเสธ ยังไม่ได้ส่งซ้ำ
送達結果未知，未重新送出|Delivery unknown. Not resent.|ไม่ทราบผลการส่ง ยังไม่ได้ส่งซ้ำ
正在處理你的需求…|Processing your request…|กำลังดำเนินการตามคำขอ…
管理介面載入失敗|Management panel failed to load|โหลดหน้าจอจัดการไม่สำเร็จ
管理介面載入失敗。原作業已保留，請關閉此視窗；完成或取消目前作業後，再重新整理頁面。|The management panel failed to load. Your work is preserved. Close this window, then finish or cancel the current operation before refreshing the page.|โหลดหน้าจอจัดการไม่สำเร็จ งานเดิมยังอยู่ กรุณาปิดหน้าต่างนี้ แล้วทำงานให้เสร็จหรือยกเลิกก่อนรีเฟรชหน้า
複製訊息|Copy message|คัดลอกข้อความ
複製未完成，請選取文字後手動複製。|Copy failed. Select the text and copy it manually.|คัดลอกไม่สำเร็จ กรุณาเลือกข้อความแล้วคัดลอกด้วยตนเอง
複製回答|Copy answer|คัดลอกคำตอบ
今天|Today|วันนี้
昨天|Yesterday|เมื่อวาน
更早|Earlier|ก่อนหน้านี้
近期|Recent|ล่าสุด
尚無聊天|No chats yet|ยังไม่มีแชต
用量|Usage|การใช้งาน
側欄|Sidebar|แถบด้านข้าง
可至「更多功能 → 已刪除聊天」還原；MES 業務與稽核紀錄保留。|Restore via More features → Deleted chats. MES operations and audit records are retained.|กู้คืนได้ที่ คุณสมบัติเพิ่มเติม → แชตที่ลบ ข้อมูลงาน MES และบันทึกตรวจสอบยังคงอยู่
已釘選|Pinned|ปักหมุดแล้ว
複製程式碼|Copy code|คัดลอกโค้ด
原句已恢復，先前送達結果未知；系統不會自動重送。|Your text was restored. The earlier delivery is unknown; it will not be sent again automatically.|กู้คืนข้อความแล้ว ยังไม่ทราบผลการส่งครั้งก่อน ระบบจะไม่ส่งซ้ำอัตโนมัติ
原句已恢復，先前請求已拒絕；尚未再次送出。|Your text was restored. The earlier request was rejected; it has not been sent again.|กู้คืนข้อความแล้ว คำขอก่อนหน้าถูกปฏิเสธ ยังไม่ได้ส่งซ้ำ
聊天紀錄|Chat history|ประวัติแชต
新聊天|New chat|แชตใหม่
搜尋聊天|Search chats|ค้นหาแชต
返回聊天|Back to chat|กลับไปที่แชต
封存聊天室|Archived chats|แชตที่เก็บถาวร
已刪除聊天|Deleted chats|แชตที่ลบแล้ว
找不到符合的聊天|No matching chats|ไม่พบแชตที่ตรงกัน
還沒有歷史聊天|No chat history yet|ยังไม่มีประวัติแชต
聊天室選單：{0}|Chat menu: {0}|เมนูแชต: {0}
還原聊天|Restore chat|กู้คืนแชต
重新命名|Rename|เปลี่ยนชื่อ
取消釘選|Unpin|เลิกปักหมุด
釘選|Pin|ปักหมุด
取消封存|Unarchive|ยกเลิกการเก็บถาวร
封存|Archive|เก็บถาวร
刪除聊天室|Delete chat|ลบแชต
重新讀取|Reload|โหลดใหม่
用量與使用統計|Usage and statistics|การใช้งานและสถิติ
請先完成、取消或查核原操作，再切換聊天。|Complete, cancel or verify the current operation before switching chats.|โปรดดำเนินการให้เสร็จ ยกเลิก หรือตรวจสอบงานเดิมก่อนเปลี่ยนแชต
重新命名聊天室|Rename chat|เปลี่ยนชื่อแชต
刪除聊天室？|Delete this chat?|ลบแชตนี้หรือไม่
修改名稱，聊天內容保持不變。|Change the name and keep the chat content.|เปลี่ยนชื่อโดยเก็บเนื้อหาแชตไว้
只移出聊天清單，保留 MES 業務與稽核紀錄。可從已刪除聊天還原。|Remove from the chat list only. MES data and audit records remain. Restore from deleted chats.|นำออกจากรายการแชตเท่านั้น ข้อมูล MES และบันทึกตรวจสอบยังอยู่ กู้คืนได้จากแชตที่ลบแล้ว
聊天室名稱|Chat name|ชื่อแชต
儲存名稱|Save name|บันทึกชื่อ
更多功能|More options|ตัวเลือกเพิ่มเติม
深藍模式|Navy mode|โหมดสีน้ำเงินเข้ม
MES 藍色|MES blue|สีน้ำเงิน MES
調整聊天室大小|Resize chat|ปรับขนาดแชต
拖曳調整大小，方向鍵微調，Enter 還原|Drag to resize, use arrows to adjust, Enter to reset|ลากเพื่อปรับขนาด ใช้ลูกศรปรับ กด Enter เพื่อคืนค่า
封存聊天為唯讀，取消封存後可接續操作。|Archived chats are read-only. Unarchive to continue.|แชตที่เก็บถาวรเป็นแบบอ่านอย่างเดียว ยกเลิกการเก็บถาวรเพื่อดำเนินการต่อ
統計只包含目前登入者可存取的聊天與操作。模型費用沿用既有累計帳本。|Statistics cover chats and operations accessible to this user. Model costs use the existing cumulative ledger.|สถิติครอบคลุมแชตและงานที่ผู้ใช้ปัจจุบันเข้าถึงได้ ค่าโมเดลใช้บัญชีสะสมเดิม
聊天紀錄已更新，請重新讀取後再操作。|Chat history changed. Reload before making changes.|ประวัติแชตเปลี่ยนแล้ว โปรดโหลดใหม่ก่อนดำเนินการ
請先完成、取消或查核原操作，再封存或刪除聊天。|Complete, cancel or verify the operation before archiving or deleting the chat.|โปรดทำให้เสร็จ ยกเลิก หรือตรวจสอบงานก่อนเก็บถาวรหรือลบแชต
聊天室名稱不可空白|Chat name cannot be blank|ชื่อแชตต้องไม่ว่าง
請先還原聊天室，再繼續操作。|Restore the chat before continuing.|โปรดกู้คืนแชตก่อนดำเนินการต่อ
聊天總數|Total chats|จำนวนแชตทั้งหมด
訊息總數|Total messages|จำนวนข้อความทั้งหมด
封存數量|Archived chats|จำนวนแชตที่เก็บถาวร
操作總數|Total operations|จำนวนงานทั้งหมด
成功操作|Successful operations|งานที่สำเร็จ
結果待核對數量|Results to verify|จำนวนผลที่รอตรวจสอบ
設定|Settings|การตั้งค่า
語言與外觀|Language and appearance|ภาษาและรูปลักษณ์
目前階段|Current stage|ขั้นตอนปัจจุบัน
尚需補充|Still needed|ข้อมูลที่ยังขาด
清除文字，繼續人工操作|Clear text and continue manually|ล้างข้อความและดำเนินการด้วยตนเอง
AI 尚未設定，文字可保留或清除，請從操作卡填寫資料。|AI is not configured. Keep or clear your text and enter details using the operation card.|ยังไม่ได้ตั้งค่า AI เก็บหรือล้างข้อความและกรอกข้อมูลในบัตรงาน
選好作業範圍後，將接續送出這段需求。|After you choose a task, this request will be sent once.|เมื่อเลือกงานแล้ว ระบบจะส่งคำขอนี้หนึ่งครั้ง
另一分頁的操作仍待核對，請先查看原操作。|An operation in another tab needs verification. Open the original operation first.|งานในแท็บอื่นยังรอตรวจสอบ โปรดเปิดงานเดิมก่อน
恢復並查核原操作|Restore and verify original operation|กู้คืนและตรวจสอบงานเดิม
返回先前作業|Return to previous task|กลับไปยังงานก่อนหน้า
已查回原操作結果。|The original operation result has been retrieved.|อ่านผลการดำเนินงานเดิมแล้ว
作業情境已切換|The task context has changed|บริบทงานเปลี่ยนแล้ว
草稿保存狀態|Draft save status|สถานะการบันทึกฉบับร่าง
本次提交已拒絕，請返回修改後重新核對。|This submission was rejected. Go back, update the details and review again.|การส่งครั้งนี้ถูกปฏิเสธ โปรดย้อนกลับ แก้ไขข้อมูลและตรวจสอบอีกครั้ง
登入或權限已失效，請重新核對MES身分。|Login or permission expired. Verify your MES identity again.|การเข้าสู่ระบบหรือสิทธิ์หมดอายุ โปรดยืนยันตัวตน MES อีกครั้ง
正在讀取資料…|Loading data…|กำลังโหลดข้อมูล…
以此工單報工|Report for this order|รายงานผลผลิตสำหรับใบสั่งนี้
無法讀取恢復資訊，請先確認瀏覽器儲存。|Recovery information cannot be read. Check browser storage.|อ่านข้อมูลกู้คืนไม่ได้ โปรดตรวจสอบพื้นที่จัดเก็บเบราว์เซอร์
查看資料|View data|ดูข้อมูล
切換工單前，請先送出或清除尚未送出的文字。|Send or clear the unsent text before changing orders.|โปรดส่งหรือล้างข้อความที่ยังไม่ได้ส่งก่อนเปลี่ยนใบสั่งผลิต
本次作業摘要|Task summary|สรุปงานครั้งนี้
收起附屬面板|Close panel|ปิดแผง
直接描述需求，或使用下方操作卡；只需補齊缺少的資料。|Describe your task or use the cards below. Add only missing details.|บอกสิ่งที่ต้องการหรือใช้การ์ดด้านล่าง เติมเฉพาะข้อมูลที่ขาด
AI 尚未設定，可用下方操作卡完成作業。|AI is not configured. Use the cards below.|ยังไม่ได้ตั้งค่า AI ใช้การ์ดด้านล่างได้
AI 已設定|AI configured|ตั้งค่า AI แล้ว
先說需求，再選擇作業範圍|Describe the task, then choose the module|บอกสิ่งที่ต้องการ แล้วเลือกโมดูล
已有送出紀錄，請先查核原操作。|A submission exists. Check the original operation.|มีประวัติส่งแล้ว โปรดตรวจสอบรายการเดิม
無法保存恢復資訊，尚未送出。請確認瀏覽器儲存可用。|Recovery information could not be saved. Nothing was submitted. Check browser storage.|บันทึกข้อมูลกู้คืนไม่ได้ ยังไม่ได้ส่ง โปรดตรวจสอบพื้นที่จัดเก็บเบราว์เซอร์
作業已完成，清單更新失敗；請重新查詢。|Operation completed; list refresh failed. Query again.|ดำเนินการเสร็จแล้ว แต่รีเฟรชรายการไม่ได้ โปรดค้นหาใหม่
查詢不會寫入；實際異動請核對作業單。|Queries do not save changes. Review the operation sheet before writing.|การค้นหาไม่บันทึกการเปลี่ยนแปลง โปรดตรวจสอบใบงานก่อนบันทึก
瀏覽其他工單|Browse other orders|ดูใบสั่งผลิตอื่น
開始上模並進站|Start mounting and check in|เริ่มติดตั้งแม่พิมพ์และเข้างาน
完成下模、出站及完工|Finish removal, check out and complete production|ถอดแม่พิมพ์เสร็จ ออกจากงาน และจบการผลิต
清除換模與進出站時間並取消完工|Clear mold and check-in/out times and undo completion|ล้างเวลาเปลี่ยนแม่พิมพ์และเข้าออกงาน และยกเลิกสถานะเสร็จ
修改報工模穴|Change production cavities|แก้ไขจำนวนโพรงสำหรับผลผลิต
與助理對話|Chat with assistant|สนทนากับผู้ช่วย
本次作業|Current operation|งานครั้งนี้
作業單|Operation sheet|ใบงาน
查詢資料|Find records|ค้นหาข้อมูล
描述需求，右側同步整理|Describe your task; review it on the right|บอกสิ่งที่ต้องการ แล้วตรวจสอบทางขวา
說說你想完成的作業|What would you like to do?|คุณต้องการทำงานอะไร?
可以直接描述完整需求，也可以在右側選擇作業。|Describe your task or choose an operation on the right.|บอกสิ่งที่ต้องการ หรือเลือกงานทางขวา
切換作業模組|Switch operation module|เปลี่ยนโมดูลงาน
尚未設定 AI 模型，可使用右側作業單。|AI is not configured. You can use the operation sheet on the right.|ยังไม่ได้ตั้งค่า AI สามารถใช้ใบงานทางขวาได้
預計結束|Scheduled end|เวลาสิ้นสุดตามแผน
目標件數|Target units|จำนวนชิ้นเป้าหมาย
進站時間|Check-in time|เวลาเข้างาน
出站時間|Check-out time|เวลาออกงาน
其他工具／進階|Other tools / Advanced|เครื่องมืออื่น / ขั้นสูง
MES伺服器當地日期時間 YYYY-MM-DD HH:mm:ss；帶明確 ISO 時區時依伺服器設定換算，無時區輸入保持原數字。|MES local date and time, YYYY-MM-DD HH:mm:ss. Explicit ISO timezones are converted to MES time; values without a timezone stay unchanged.|วันเวลาท้องถิ่นของ MES รูปแบบ YYYY-MM-DD HH:mm:ss เขตเวลา ISO ที่ระบุจะถูกแปลงเป็นเวลา MES หากไม่ระบุจะคงตัวเลขเดิม
既有排程明細的 ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID；修改該列時保留。|Existing schedule detail ID; preserve it when editing that row.|รหัสรายละเอียดตารางผลิตเดิม ให้คงไว้เมื่อแก้ไขแถวนั้น
模具明細的 TOL_DETALS_SID；從 catalogs.molds[].DETAILS 選取。同模具同品號有多筆時必須明確選擇，不得猜第一筆。修改已明確選定的排程明細時可省略以保留原模具明細。|Select the mold detail from the catalog. If several details share the same part, choose explicitly. For an existing selected schedule detail, omission preserves the original mold detail.|เลือกรายละเอียดแม่พิมพ์จากรายการ หากชิ้นงานเดียวกันมีหลายรายการต้องเลือกให้ชัดเจน สำหรับรายละเอียดตารางเดิมที่เลือกแล้ว สามารถเว้นไว้เพื่อคงรายละเอียดแม่พิมพ์เดิม
此確認卡已處理，未重複執行|This card was already processed; the operation was not repeated.|บัตรนี้ดำเนินการแล้ว ไม่ได้ทำงานซ้ำ
結果尚待核對，請保留操作識別碼，不得重新送出相同操作|Result needs checking. Keep the operation ID and do not resubmit.|ต้องตรวจสอบผล เก็บรหัสการดำเนินการไว้และห้ามส่งงานซ้ำ
已完成並記錄異動|Completed and changes recorded|ดำเนินการสำเร็จและบันทึกการเปลี่ยนแปลงแล้ว
已取消，未寫入業務資料|Cancelled; no business data was written|ยกเลิกแล้ว ไม่มีการบันทึกข้อมูลงาน
已從既有提交紀錄查核成功，沒有重送業務操作|Existing submission verified successfully; no operation was resubmitted.|ตรวจสอบรายการที่ส่งไว้แล้วสำเร็จ ไม่มีการส่งงานซ้ำ
尚無完整提交證據，請保留操作識別碼交由管理員核對；未重送業務操作|Submission evidence is incomplete. Keep the operation ID for administrator review; nothing was resubmitted.|หลักฐานการส่งยังไม่ครบ เก็บรหัสงานให้ผู้ดูแลตรวจสอบ ไม่มีการส่งงานซ้ำ
已查回確認卡目前狀態，未執行業務寫入|Current card status retrieved; no business write was performed.|เรียกสถานะบัตรปัจจุบันแล้ว ไม่มีการบันทึกข้อมูลงาน
無法連線至作業服務，請確認網路後再試。|Cannot connect to the operation service. Check the network and try again.|เชื่อมต่อบริการงานไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่
設備名稱|Equipment name|ชื่อเครื่องจักร
模具明細名稱|Mold detail name|ชื่อรายละเอียดแม่พิมพ์
模具明細編號|Mold detail number|หมายเลขรายละเอียดแม่พิมพ์
異動時間以人員確認後執行時的 MES 伺服器時間為準；目前顯示為預覽時間|Changes use MES server time when the confirmed operation executes; the time shown now is a preview.|ใช้เวลาเซิร์ฟเวอร์ MES ขณะดำเนินงานหลังยืนยัน เวลาที่แสดงตอนนี้เป็นตัวอย่าง
新增識別碼在提交時由 MES GetSid 配置，預覽不代表正式識別碼|MES assigns new IDs on submission. Preview IDs are not final.|MES กำหนดรหัสใหม่เมื่อส่งงาน รหัสในตัวอย่างไม่ใช่รหัสจริง
新增排程與明細識別碼於確認執行時分配；模具明細編號與識別為已核對的正式主檔。|New schedule and detail IDs are assigned on execution; mold detail identifiers refer to verified master data.|กำหนดรหัสตารางผลิตและรายละเอียดใหม่เมื่อดำเนินงาน รหัสรายละเอียดแม่พิมพ์อ้างอิงข้อมูลหลักที่ตรวจสอบแล้ว
歷史對話|Conversation history|ประวัติการสนทนา
生產排程|Production scheduling|จัดตารางการผลิต
排程|Scheduling|ตารางผลิต
安排設備、工單與模穴，確認每一個生產時段。|Plan equipment, work orders and cavities for each production slot.|วางแผนเครื่องจักร ใบสั่งผลิต และจำนวนคาวิตี้ในแต่ละช่วงการผลิต
查詢目前的生產排程|Show current production schedules|แสดงตารางการผลิตปัจจุบัน
幫我安排一筆新排程，請引導我補齊需要的資料|Help me create a schedule and ask for the required details|ช่วยสร้างตารางผลิตใหม่และสอบถามข้อมูลที่จำเป็น
我要修改排程的工單與模穴數|I want to change the work order and cavities in a schedule|ต้องการแก้ไขใบสั่งผลิตและจำนวนคาวิตี้ในตารางผลิต
生產報工|Production reporting|บันทึกผลผลิต
報工|Reporting|รายงานผลผลิต
記錄良品與不良、修改報工、調整模穴及完工。|Record good and defective quantities, edit reports, adjust cavities and complete work.|บันทึกชิ้นงานดีและของเสีย แก้ไขรายงาน ปรับคาวิตี้ และจบงาน
查看目前可以報工的工單|Show work orders available for reporting|แสดงใบสั่งผลิตที่บันทึกผลผลิตได้
我要新增一筆報工，請先確認工單和數量|Create a production report; first confirm the work order and quantities|สร้างรายงานผลผลิต โดยยืนยันใบสั่งผลิตและจำนวนก่อน
查看報工歷史，分開列出人工報工與 IoT 產量|Show report history with manual and IoT quantities separately|แสดงประวัติรายงานโดยแยกจำนวนที่บันทึกเองกับ IoT
模具上下模|Mold mounting and removal|ขึ้นและลงแม่พิมพ์
上下模|Mold operations|งานแม่พิมพ์
依現場進度，完成上模與下模各階段作業。|Follow each mounting and removal stage according to shop-floor progress.|ดำเนินการขึ้นและลงแม่พิมพ์แต่ละขั้นตอนตามงานจริง
查詢各設備目前的模具狀態|Show the mold status of each machine|แสดงสถานะแม่พิมพ์ของแต่ละเครื่องจักร
我要開始上模，請確認排程與模具|Start mounting; confirm the schedule and mold first|เริ่มขึ้นแม่พิมพ์ กรุณายืนยันตารางผลิตและแม่พิมพ์
查詢可以開始下模的排程|Show schedules ready for mold removal|แสดงตารางผลิตที่พร้อมเริ่มลงแม่พิมพ์
生管人員|Production planner|ผู้วางแผนการผลิต
安排與調整生產排程|Create and adjust production schedules|สร้างและปรับตารางการผลิต
現場作業員|Production operator|พนักงานฝ่ายผลิต
登錄產量與報工資料|Record quantities and production reports|บันทึกจำนวนและรายงานผลผลิต
模具技術員|Mold technician|ช่างแม่พิมพ์
執行模具上下模作業|Mount and remove molds|ดำเนินงานขึ้นและลงแม่พิมพ์
現場主管|Shop-floor supervisor|หัวหน้าฝ่ายผลิต
跨模組驗證與作業確認|Review and confirm operations across modules|ตรวจสอบและยืนยันงานข้ามโมดูล
儲存排程|Save schedule|บันทึกตารางผลิต
新增報工|Add production report|เพิ่มรายงานผลผลิต
修改報工|Edit production report|แก้ไขรายงานผลผลิต
刪除報工|Delete production report|ลบรายงานผลผลิต
調整模穴數|Adjust cavities|ปรับจำนวนคาวิตี้
排程完工|Complete schedule|จบตารางผลิต
清空上下模|Clear mold operation times|ล้างเวลาขึ้นลงแม่พิมพ์
開始上模|Start mounting|เริ่มขึ้นแม่พิมพ์
完成上模|Finish mounting|ขึ้นแม่พิมพ์เสร็จ
開始下模|Start removal|เริ่มลงแม่พิมพ์
完成下模|Finish removal|ลงแม่พิมพ์เสร็จ
威友科技|WeYu Technology|WeYu Technology
生產情報助理|Production assistant|ผู้ช่วยงานผลิต
尚未連上作業服務，請確認後端已啟動。|Cannot reach the operation service. Check that it is running.|เชื่อมต่อบริการงานไม่ได้ กรุณาตรวจสอบว่าบริการทำงานอยู่
操作未完成，請稍後再試。|Operation incomplete. Please try again later.|ดำเนินการไม่สำเร็จ กรุณาลองใหม่ภายหลัง
正式 MES 必須沿用目前登入身分。|Live MES must use the current signed-in identity.|MES จริงต้องใช้บัญชีที่เข้าสู่ระบบอยู่
請先選擇作業身分。|Select an operating identity first.|กรุณาเลือกผู้ปฏิบัติงานก่อน
初次資料查詢未完成|Initial data query incomplete|เรียกข้อมูลครั้งแรกไม่สำเร็จ
初次資料查詢未完成：{0}。你仍可在對話補充設備與日期，或到「作業資料」縮小查詢範圍。|Initial query incomplete: {0}. Specify equipment and dates in chat, or narrow the query in Work data.|เรียกข้อมูลครั้งแรกไม่สำเร็จ: {0} ระบุเครื่องจักรและวันที่ในแชต หรือจำกัดช่วงค้นหาในข้อมูลงาน
已依補充需求取代前一張草稿，請核對新的確認卡。|The previous draft was replaced. Review the new confirmation card.|แทนที่ร่างเดิมตามข้อมูลเพิ่มเติมแล้ว กรุณาตรวจสอบบัตรยืนยันใหม่
前一張草稿已停止確認。補齊資料後會建立新的確認卡。|The previous draft can no longer be confirmed. Complete the details for a new card.|ร่างเดิมไม่สามารถยืนยันได้แล้ว เมื่อข้อมูลครบจะสร้างบัตรใหม่
正式寫入尚未啟用。可以查看預覽或取消草稿。|Live writes are disabled. You can preview or cancel the draft.|ยังไม่เปิดการบันทึกจริง สามารถดูตัวอย่างหรือยกเลิกร่างได้
此操作結果待核對，請先查核執行結果。|This operation needs reconciliation. Check its result first.|ต้องตรวจสอบผลของงานนี้ก่อน กรุณาตรวจสอบผลการดำเนินการ
目前有待確認的草稿。請先確認或取消，再切換作業資料。|Confirm or cancel the pending draft before switching work data.|กรุณายืนยันหรือยกเลิกร่างที่รออยู่ก่อนเปลี่ยนข้อมูลงาน
已切換作業資料，接下來的對話會帶入這筆資料。|Work data switched. The conversation will use this record.|เปลี่ยนข้อมูลงานแล้ว การสนทนาถัดไปจะใช้รายการนี้
MES 作業測試|MES operation test|ทดสอบงาน MES
MES 生產作業|MES production operations|งานผลิต MES
排程、報工與模具上下模。|Scheduling, production reporting and mold operations.|ตารางผลิต รายงานผลผลิต และงานขึ้นลงแม่พิมพ์
目前使用隔離模擬資料。|Using isolated simulation data.|กำลังใช้ข้อมูลจำลองแยกจากระบบจริง
沿用目前 MES 登入身分。|Using the current MES identity.|ใช้บัญชี MES ที่เข้าสู่ระบบอยู่
正在確認作業環境。|Checking the operating environment.|กำลังตรวจสอบสภาพแวดล้อมการทำงาน
點選右下角助理開始操作。|Open the assistant at the bottom right to begin.|เปิดผู้ช่วยที่มุมล่างขวาเพื่อเริ่มงาน
開啟生產情報助理|Open production assistant|เปิดผู้ช่วยงานผลิต
收合生產情報助理|Collapse production assistant|ย่อผู้ช่วยงานผลิต
縮小聊天室|Reduce chat window|ย่อหน้าต่างแชต
放大聊天室|Expand chat window|ขยายหน้าต่างแชต
縮小助理|Minimize assistant|ย่อผู้ช่วย
縮小助理（Esc）|Minimize assistant (Esc)|ย่อผู้ช่วย (Esc)
01 / 選擇作業|01 / Select operation|01 / เลือกงาน
02 / 確認身分|02 / Confirm identity|02 / ยืนยันผู้ปฏิบัติงาน
返回選擇|Back to selection|กลับไปเลือก
今天，想完成什麼作業？|What would you like to do today?|วันนี้ต้องการทำงานอะไร?
開始{0}前，選擇你的身分|Select your identity before {0}|เลือกผู้ปฏิบัติงานก่อนเริ่ม {0}
開始{0}前，確認登入身分|Confirm your identity before {0}|ยืนยันบัญชีก่อนเริ่ม {0}
選擇一個入口，我會陪你確認資料，完成現場作業。|Choose an operation. I will help you check the details and complete the work.|เลือกงาน ผู้ช่วยจะช่วยตรวจสอบข้อมูลและดำเนินงานให้เสร็จ
身分決定可執行的功能；每次寫入都會留下操作紀錄。|Your identity determines available actions. Every write is logged.|สิทธิ์ของบัญชีกำหนดงานที่ทำได้ และทุกการบันทึกมีประวัติ
目前登入身分無此模組權限|Your identity has no access to this module|บัญชีนี้ไม่มีสิทธิ์ใช้งานโมดูลนี้
進入|Enter|เข้าสู่
目前為模擬驗證環境。此處身分切換僅供測試，正式 MES 將沿用已登入身分與伺服器權限。|This is a simulation. Identity switching is for testing only; live MES uses the signed-in identity and server permissions.|นี่คือระบบจำลอง การเปลี่ยนผู้ใช้ใช้เพื่อทดสอบเท่านั้น MES จริงใช้บัญชีที่เข้าสู่ระบบและสิทธิ์จากเซิร์ฟเวอร์
沿用目前 MES 已登入身分與伺服器授予的模組權限。確認身分後即可開始，不需再次輸入帳號密碼。|Use your MES sign-in and assigned permissions. Confirm your identity to begin without entering credentials again.|ใช้บัญชี MES และสิทธิ์ที่ได้รับ ยืนยันบัญชีเพื่อเริ่มโดยไม่ต้องกรอกรหัสผ่านซ้ำ
沿用目前身分：|Current identity: |บัญชีปัจจุบัน:\u0020
（此入口無權限）|(No access)|(ไม่มีสิทธิ์)
尚未取得可信的 MES 登入身分。請先在原 MES 登入，再重新開啟助理。|No verified MES identity. Sign in to MES, then reopen the assistant.|ยังไม่มีบัญชี MES ที่ยืนยันแล้ว กรุณาเข้าสู่ MES แล้วเปิดผู้ช่วยใหม่
重新確認登入|Check sign-in again|ตรวจสอบการเข้าสู่ระบบอีกครั้ง
正在準備作業資料…|Preparing work data…|กำลังเตรียมข้อมูลงาน…
自然語言操作|Natural language operation|สั่งงานด้วยภาษาธรรมชาติ
確認後寫入|Write after confirmation|บันทึกหลังยืนยัน
完整作業紀錄|Traceable operations|ประวัติงานตรวจสอบได้
返回模組入口|Back to modules|กลับไปเลือกโมดูล
請先查核執行結果|Check the operation result first|ตรวจสอบผลการดำเนินการก่อน
請先確認或取消草稿|Confirm or cancel the draft first|ยืนยันหรือยกเลิกร่างก่อน
EPS 成型|EPS forming|ขึ้นรูป EPS
AI 已連線|AI connected|เชื่อมต่อ AI แล้ว
AI 尚未設定|AI not configured|ยังไม่ได้ตั้งค่า AI
檢查連線中|Checking connection|กำลังตรวจสอบการเชื่อมต่อ
作業檢視|Operation views|มุมมองงาน
對話作業|Chat|สนทนางาน
作業資料|Work data|ข้อมูลงาน
操作紀錄|Operation log|ประวัติการดำเนินการ
關閉錯誤訊息|Dismiss error|ปิดข้อความผิดพลาด
目前作業資料|Current work data|ข้อมูลงานปัจจุบัน
查看|View|ดู
一起完成這次|Let's complete this |มาทำงานนี้ให้เสร็จ:\u0020
直接描述你要做的事。缺少的資料，我會逐一詢問；|Describe your task. I will ask for any missing details.|บอกงานที่ต้องการ ผู้ช่วยจะถามข้อมูลที่ยังขาดทีละรายการ
準備好後，會先提供變更清單讓你核對。|Once ready, I will show the changes for your review.|เมื่อพร้อมจะแสดงรายการเปลี่ยนแปลงให้ตรวจสอบก่อน
你|You|คุณ
操作確認卡|Operation confirmation|บัตรยืนยันงาน
作業處理結果|Operation result|ผลการดำเนินงาน
待你確認 · 尚未寫入|Awaiting confirmation · not written|รอการยืนยัน · ยังไม่บันทึก
已過期|Expired|หมดอายุ
MES 時間|MES time|เวลา MES
；未指定時區的作業時間依 MES 顯示時間解讀。|; times without a timezone use the MES clock.|; เวลาที่ไม่ระบุเขตเวลาใช้ตามนาฬิกา MES
正式寫入尚未啟用|Live writes disabled|ยังไม่เปิดการบันทึกจริง
目前可查詢及預覽異動，尚不能執行寫入。你仍可取消或修改這筆草稿。|Queries and previews are available; live writes are disabled. You can cancel or edit this draft.|ค้นหาและดูตัวอย่างการเปลี่ยนแปลงได้ แต่ยังบันทึกจริงไม่ได้ สามารถยกเลิกหรือแก้ไขร่างได้
查看資料異動明細|View detailed changes|ดูรายละเอียดการเปลี่ยนแปลง
項|items|รายการ
檢視完整操作參數|View full operation parameters|ดูพารามิเตอร์งานทั้งหมด
確認已過期，請重新建立草稿。|Confirmation expired. Create a new draft.|การยืนยันหมดอายุ กรุณาสร้างร่างใหม่
確認期限：{0}|Confirm by: {0}|ยืนยันภายใน: {0}
我已核對這筆「|I have checked the target and impact of “|ตรวจสอบเป้าหมายและผลกระทบของ “
」的對象及影響，確認要單獨執行。|” and confirm this individual operation.|” แล้ว และยืนยันให้ดำเนินงานนี้แยกต่างหาก
取消草稿|Cancel draft|ยกเลิกร่าง
確認這筆操作|Confirm this operation|ยืนยันงานนี้
同意並寫入|Approve and save|ยืนยันและบันทึก
操作識別碼：|Operation ID: |รหัสการดำเนินการ:\u0020
結果待核對|Result needs checking|ต้องตรวจสอบผล
請保留操作識別碼。查核只讀取執行紀錄，不會再次送出報工或其他業務操作。|Keep the operation ID. Checking only reads the execution record and never resubmits the operation.|เก็บรหัสการดำเนินการไว้ การตรวจสอบอ่านประวัติเท่านั้น ไม่ส่งงานซ้ำ
查核執行結果|Check operation result|ตรวจสอบผลการดำเนินการ
正在核對資料與處理作業…|Checking data and processing…|กำลังตรวจสอบข้อมูลและดำเนินงาน…
尚未設定 AI 模型，自然語言對話暫不可用。可展開「結構化操作草稿」驗證流程。|AI is not configured. Natural language chat is unavailable; use the structured draft form to test the workflow.|ยังไม่ตั้งค่า AI จึงใช้สนทนาธรรมชาติไม่ได้ สามารถใช้แบบฟอร์มร่างงานเพื่อทดสอบขั้นตอน
描述作業需求|Describe your task|อธิบายงานที่ต้องการ
此操作結果待核對，請先按確認卡的「查核執行結果」|Check the result using the confirmation card before continuing|ตรวจสอบผลด้วยปุ่มบนบัตรยืนยันก่อนดำเนินการต่อ
可直接補充修改，例如：良品改成 25，請重新確認|Add a correction, e.g. change good quantity to 25 and confirm again|แก้ไขเพิ่มเติมได้ เช่น เปลี่ยนชิ้นงานดีเป็น 25 แล้วขอยืนยันใหม่
描述你的{0}需求，例如：{1}|Describe your {0} task, e.g. {1}|อธิบายงาน {0} เช่น {1}
送出訊息|Send message|ส่งข้อความ
確認後才會寫入|Written only after confirmation|บันทึกเมื่อยืนยันแล้วเท่านั้น
Enter 送出 · Shift + Enter 換行|Enter to send · Shift + Enter for a new line|Enter เพื่อส่ง · Shift + Enter เพื่อขึ้นบรรทัดใหม่
選擇一筆資料，帶入新的作業對話。|Select a record to start a new work conversation.|เลือกรายการเพื่อเริ่มการสนทนางานใหม่
重新整理|Refresh|รีเฟรช
人工報工與 IoT 推算數量各自呈現；未有 IoT 資料不代表產量為零。|Manual reports and IoT estimates are shown separately. Missing IoT data does not mean zero output.|แสดงจำนวนที่บันทึกเองและค่าประมาณ IoT แยกกัน ไม่มีข้อมูล IoT ไม่ได้หมายถึงผลผลิตเป็นศูนย์
第 {0} 筆|Record {0}|รายการที่ {0}
已完工|Completed|จบงานแล้ว
以此筆資料開始|Start with this record|เริ่มด้วยรายการนี้
尚無作業資料|No work data yet|ยังไม่มีข้อมูลงาน
請重新整理，或從對話建立需要的作業。|Refresh or create the required operation in chat.|รีเฟรชหรือสร้างงานที่ต้องการผ่านการสนทนา
查看設備、工單與模具選項|View equipment, work order and mold options|ดูตัวเลือกเครื่องจักร ใบสั่งผลิต และแม่พิมพ์
作業選項|Operation options|ตัวเลือกงาน
每次變更，都有紀錄。|Every change is recorded.|ทุกการเปลี่ยนแปลงมีประวัติ
核對操作時間、執行人員與資料前後差異。|Check when, who and what changed.|ตรวจสอบเวลา ผู้ดำเนินการ และข้อมูลก่อนหลัง
回報問題與用量|Feedback and usage|แจ้งปัญหาและการใช้งาน
讓作業經驗留下來|Keep operational knowledge|เก็บความรู้จากการปฏิบัติงาน
錯誤回報先送審核，再經候選案例回歸後發布，不會自動改變卡控。|Feedback is reviewed and regression-tested before publication; it never changes safeguards automatically.|ข้อเสนอแนะต้องตรวจสอบและทดสอบก่อนเผยแพร่ ไม่เปลี่ยนกฎควบคุมอัตโนมัติ
關閉問題回報|Close feedback|ปิดการแจ้งปัญหา
遇到什麼問題？|What went wrong?|พบปัญหาอะไร?
描述你預期的結果、實際發生的情況，或需要補充的操作知識。|Describe the expected result, what happened, or missing operational knowledge.|อธิบายผลที่คาดหวัง สิ่งที่เกิดขึ้นจริง หรือความรู้ที่ต้องเพิ่มเติม
送出問題回報|Submit feedback|ส่งแจ้งปัญหา
已收到，將由主管審查後處理。|Received. A supervisor will review it.|ได้รับแล้ว หัวหน้างานจะตรวจสอบก่อนดำเนินการ
來源版本與 API 用量|Source version and API usage|รุ่นข้อมูลอ้างอิงและการใช้ API
作業盤點版本：979d2c6 · 2026-10-30|Inventory version: 979d2c6 · 2026-10-30|รุ่นรายการงาน: 979d2c6 · 2026-10-30
目前無法取得用量資訊。|Usage information is unavailable.|ไม่สามารถเรียกข้อมูลการใช้งานได้
回報問題與來源|Feedback and sources|แจ้งปัญหาและแหล่งข้อมูล
高塑 · 生產作業助理|Kaosu · Production assistant|Kaosu · ผู้ช่วยงานผลิต
設備|Equipment|เครื่องจักร
全部設備|All equipment|เครื่องจักรทั้งหมด
日期或區間|Date or range|วันที่หรือช่วงวันที่
2026-10-30 或 起日~迄日|2026-10-30 or start~end|2026-10-30 หรือ วันเริ่ม~วันสิ้นสุด
工單|Work order|ใบสั่งผลิต
全部工單|All work orders|ใบสั่งผลิตทั้งหมด
每頁|Per page|ต่อหน้า
20 筆|20 records|20 รายการ
50 筆|50 records|50 รายการ
100 筆|100 records|100 รายการ
套用查詢|Apply filters|ใช้ตัวกรอง
共|Total|ทั้งหมด
筆 · 第|records · Page|รายการ · หน้า
頁|page|หน้า
上一頁|Previous page|หน้าก่อนหน้า
下一頁|Next page|หน้าถัดไป
查詢結果|Query results|ผลการค้นหา
筆|records|รายการ
第|Record|รายการที่
目前沒有符合條件的資料。|No matching records.|ไม่มีข้อมูลตรงตามเงื่อนไข
展開內容|Show contents|แสดงเนื้อหา
未知|Unknown|ไม่ทราบ
人工報工歷史（|Manual report history (|ประวัติรายงานด้วยตนเอง (
筆）|records)|รายการ)
人工報工明細|Manual report details|รายละเอียดรายงานด้วยตนเอง
詳細資料|Details|รายละเอียด
結構化操作草稿|Structured operation draft|แบบฟอร์มร่างงาน
依伺服器規格填寫|Follow the server schema|กรอกตามรูปแบบเซิร์ฟเวอร์
這是人工表單，適合核對欄位或測試流程。送出只建立預覽，確認後才寫入。|Use this manual form to check fields or test workflows. Submission creates a preview; confirmation is required to write.|ใช้แบบฟอร์มนี้ตรวจสอบช่องข้อมูลหรือทดสอบขั้นตอน การส่งสร้างตัวอย่างเท่านั้น ต้องยืนยันก่อนบันทึก
請填寫{0}|Enter {0}|กรุณากรอก {0}
{0}必須為有效數字|{0} must be a valid number|{0} ต้องเป็นตัวเลขที่ถูกต้อง
{0}必須為整數|{0} must be an integer|{0} ต้องเป็นจำนวนเต็ม
草稿格式不正確|Invalid draft format|รูปแบบร่างไม่ถูกต้อง
操作類型|Operation type|ประเภทงาน
選擇要執行的功能|Select an action|เลือกงานที่ต้องการ
請選擇|Please select|กรุณาเลือก
是|Yes|ใช่
否|No|ไม่ใช่
請填寫 JSON；欄位格式會由伺服器再次驗證。|Enter JSON; the server will validate the fields again.|กรอก JSON เซิร์ฟเวอร์จะตรวจสอบรูปแบบข้อมูลอีกครั้ง
建立確認草稿|Create confirmation draft|สร้างร่างเพื่อยืนยัน
待審核|Awaiting review|รอตรวจสอบ
已審核，待案例回歸與發布|Reviewed; awaiting regression and publication|ตรวจสอบแล้ว รอทดสอบและเผยแพร่
已發布|Published|เผยแพร่แล้ว
無法取得回饋紀錄。|Unable to load feedback.|ไม่สามารถเรียกประวัติข้อเสนอแนะได้
回饋紀錄與審核|Feedback records and review|ประวัติข้อเสนอแนะและการตรวจสอบ
回饋追蹤與知識審核|Feedback tracking and knowledge review|ติดตามข้อเสนอแนะและตรวจสอบความรู้
我的回饋紀錄|My feedback|ข้อเสนอแนะของฉัน
只顯示你獲授權的模組；審核後仍須由管理員完成候選案例回歸，才會發布。|Only authorized modules are shown. Publication requires administrator regression tests after review.|แสดงเฉพาะโมดูลที่มีสิทธิ์ หลังตรวจสอบผู้ดูแลยังต้องทดสอบก่อนเผยแพร่
查看回饋處理進度；修正內容經審核與案例回歸後才會發布。|Track feedback progress. Corrections are published only after review and regression tests.|ติดตามความคืบหน้าข้อเสนอแนะ การแก้ไขเผยแพร่หลังตรวจสอบและทดสอบแล้วเท่านั้น
重新整理回饋|Refresh feedback|รีเฟรชข้อเสนอแนะ
處理狀態|Processing status|สถานะการดำเนินการ
全部|All|ทั้งหมด
已審核，待發布|Reviewed; awaiting publication|ตรวจสอบแล้ว รอเผยแพร่
回報人員：|Reported by: |ผู้แจ้ง:\u0020
查看審核內容與來源|View review and source|ดูเนื้อหาที่ตรวจสอบและแหล่งข้อมูล
來源：|Source: |แหล่งข้อมูล:\u0020
審核人員：|Reviewer: |ผู้ตรวจสอบ:\u0020
修訂審核內容|Revise review|แก้ไขเนื้อหาการตรวจสอบ
審核這筆回饋|Review this feedback|ตรวจสอบข้อเสนอแนะนี้
目前沒有此狀態的回饋。|No feedback with this status.|ไม่มีข้อเสนอแนะในสถานะนี้
知識審核表單|Knowledge review form|แบบฟอร์มตรวจสอบความรู้
已提交審核內容，尚未發布。請交由管理員完成候選案例回歸。|Review submitted, not published. Ask an administrator to run candidate regression tests.|ส่งผลตรวจสอบแล้ว ยังไม่เผยแพร่ ให้ผู้ดูแลทดสอบกรณีตัวอย่างก่อน
審核未完成。|Review incomplete.|ตรวจสอบไม่สำเร็จ
審核|Review|ตรวจสอบ
回饋|feedback|ข้อเสนอแนะ
原回饋：|Original feedback: |ข้อเสนอแนะเดิม:\u0020
修正後的知識說明|Corrected knowledge|คำอธิบายความรู้ที่แก้ไขแล้ว
填入已核對的正確說明；不能以知識文字改寫業務卡控。|Enter verified guidance; knowledge text cannot override business safeguards.|กรอกคำอธิบายที่ตรวจสอบแล้ว ข้อความความรู้ไม่สามารถเปลี่ยนกฎควบคุมงานได้
核實來源|Verified source|แหล่งข้อมูลที่ตรวจสอบแล้ว
文件、程式版本或其他可追查的來源。|Document, code version or other traceable source.|เอกสาร รุ่นโปรแกรม หรือแหล่งข้อมูลที่ตรวจสอบย้อนกลับได้
取消編輯|Cancel editing|ยกเลิกการแก้ไข
提交審核（尚不發布）|Submit review (not publish)|ส่งผลตรวจสอบ (ยังไม่เผยแพร่)
模具明細待核對|Mold detail needs checking|ต้องตรวจสอบรายละเอียดแม่พิมพ์
人工良品|Manual good quantity|ชิ้นงานดีที่บันทึกเอง
件|pcs|ชิ้น
不良合計|Total defects|ของเสียรวม
不良原因|Defect reason|สาเหตุของเสีย
以上為人工報工數量，與 IoT 推算產量分開記錄。|These are manually reported quantities, recorded separately from IoT estimates.|จำนวนนี้บันทึกด้วยตนเอง แยกจากค่าประมาณผลผลิต IoT
將刪除人工良品|Manual good quantity to delete|ชิ้นงานดีที่บันทึกเองที่จะลบ
將刪除不良數|Defective quantity to delete|จำนวนของเสียที่จะลบ
報工模穴數|Reported cavities|คาวิตี้สำหรับรายงาน
穴|cavities|คาวิตี้
完工時間|Completion time|เวลาจบงาน
開始上模時間|Mounting start time|เวลาเริ่มขึ้นแม่พิมพ์
完成上模時間|Mounting finish time|เวลาขึ้นแม่พิมพ์เสร็จ
開始下模時間|Removal start time|เวลาเริ่มลงแม่พิมพ์
完成下模時間|Removal finish time|เวลาลงแม่พิมพ์เสร็จ
清除時間|Clear time|ล้างเวลา
預計開始|Scheduled start|กำหนดเริ่ม
模具|Mold|แม่พิมพ์
週期|Cycle time|เวลารอบ
秒|seconds|วินาที
目標模次|Target shots|จำนวนรอบเป้าหมาย
模|shots|รอบ
工單與模具明細分配|Work order and mold detail allocation|การจัดสรรใบสั่งผลิตและรายละเอียดแม่พิมพ์
影響工單|Affected work orders|ใบสั่งผลิตที่ได้รับผลกระทบ
請核對上方作業對象與摘要。|Check the target and summary above.|ตรวจสอบเป้าหมายและสรุปงานด้านบน
同一排程的所有工單會一併完工。|All work orders in this schedule will be completed together.|ใบสั่งผลิตทั้งหมดในตารางนี้จะจบงานพร้อมกัน
會清除這張排程的上下模時間，請確認現場狀態。|This clears the schedule's mold operation times. Check the shop-floor status.|จะล้างเวลาขึ้นลงแม่พิมพ์ของตารางนี้ กรุณาตรวจสอบสถานะหน้างาน
連動作業|Related changes|งานที่เปลี่ยนแปลงร่วมกัน
下一張排程的實際開始時間會一併更新為：|The next schedule's actual start will also change to: |เวลาเริ่มจริงของตารางถัดไปจะเปลี่ยนเป็น:\u0020
備註|Comment|หมายเหตุ
圖片：|Image: |ภาพ:\u0020
未提供說明|No description|ไม่มีคำอธิบาย
助理回覆表格|Assistant response table|ตารางคำตอบของผู้ช่วย
結果待核對。請保留操作識別碼，按「查核執行結果」讀取紀錄；不要重新送出相同操作。|Result needs checking. Keep the operation ID and use Check operation result; do not resubmit.|ต้องตรวจสอบผล เก็บรหัสงานและใช้ปุ่มตรวจสอบผล ห้ามส่งงานเดิมซ้ำ
待確認|Awaiting confirmation|รอยืนยัน
已完成|Succeeded|สำเร็จแล้ว
已取消|Cancelled|ยกเลิกแล้ว
已被取代|Superseded|ถูกแทนที่แล้ว
未完成|Failed|ไม่สำเร็จ
已拒絕|Rejected|ถูกปฏิเสธ
已查核執行成功並記錄異動。|Execution confirmed and changes recorded.|ตรวจสอบแล้วว่าดำเนินการสำเร็จและบันทึกการเปลี่ยนแปลงแล้ว
此操作{0}。|Operation status: {0}.|สถานะงาน: {0}
作業服務必須與目前 MES 頁面同源。|The operation service must share the MES page origin.|บริการงานต้องมีต้นทางเดียวกับหน้า MES
伺服器回應格式異常，請重新整理資料後再試。|Invalid server response. Refresh the data and try again.|รูปแบบคำตอบเซิร์ฟเวอร์ผิดปกติ กรุณารีเฟรชข้อมูลแล้วลองใหม่
料號|Part number|รหัสชิ้นงาน
規格|Specification|ข้อกำหนด
班日|Shift date|วันที่กะ
排程日期|Schedule date|วันที่ตารางผลิต
製程|Process|กระบวนการ
完工狀態|Completion status|สถานะจบงาน
報工模穴|Reporting cavities|คาวิตี้รายงานผลผลิต
排程模穴|Scheduled cavities|คาวิตี้ตามแผน
週期秒數|Cycle seconds|เวลารอบเป็นวินาที
人工良品數|Manual good quantity|จำนวนชิ้นงานดีที่บันทึกเอง
不良數|Defective quantity|จำนวนของเสีย
不良總數|Total defective quantity|จำนวนของเสียรวม
IoT 產量|IoT quantity|จำนวนผลผลิต IoT
IoT 模次|IoT shots|จำนวนรอบ IoT
目標產量|Target quantity|จำนวนผลผลิตเป้าหมาย
建立時間|Created at|เวลาสร้าง
更新時間|Updated at|เวลาอัปเดต
實際開始時間|Actual start time|เวลาเริ่มจริง
預計開始時間|Scheduled start time|เวลาเริ่มตามแผน
預計結束時間|Scheduled end time|เวลาสิ้นสุดตามแผน
啟用狀態|Enabled status|สถานะเปิดใช้งาน
執行識別|Execution ID|รหัสการปฏิบัติงาน
報工識別|Report ID|รหัสรายงาน
排程識別|Schedule ID|รหัสตารางผลิต
不良原因明細|Defect reason details|รายละเอียดสาเหตุของเสีย
不良數量|Defective quantity|จำนวนของเสีย
操作|Action|การดำเนินการ
模組|Module|โมดูล
操作人員|Operator|ผู้ปฏิบัติงาน
結果|Result|ผลลัพธ์
執行時間|Executed at|เวลาดำเนินการ
排程識別（新增時留空）|Schedule ID (leave blank for new)|รหัสตารางผลิต (เว้นว่างเมื่อสร้างใหม่)
不良明細|Defect details|รายละเอียดของเสีย
模穴數|Cavity count|จำนวนคาวิตี้
設備編號|Equipment number|หมายเลขเครื่องจักร
模具編號|Mold number|หมายเลขแม่พิมพ์
開始時間|Start time|เวลาเริ่ม
週期（秒）|Cycle (seconds)|รอบ (วินาที)
模具模穴明細識別|Mold cavity detail ID|รหัสรายละเอียดคาวิตี้แม่พิมพ์
既有排程明細識別|Existing schedule detail ID|รหัสรายละเอียดตารางผลิตเดิม
優先順序|Priority|ลำดับความสำคัญ
工單與模穴明細|Work order and cavity details|รายละเอียดใบสั่งผลิตและคาวิตี้
原因代碼|Reason code|รหัสสาเหตุ
數量|Quantity|จำนวน
人工報工良品合計|Total manually reported good quantity|ชิ้นงานดีที่บันทึกเองรวม
人工報工不良合計|Total manually reported defects|ของเสียที่บันทึกเองรวม
IoT 推算良品（IoT 產量－不良數）|IoT estimated good quantity (IoT − defects)|ชิ้นงานดีประมาณจาก IoT (IoT − ของเสีย)
人工報工歷史|Manual report history|ประวัติรายงานด้วยตนเอง
下一階段|Next stage|ขั้นตอนถัดไป
操作時間|Operation time|เวลาปฏิบัติงาน
事件時間|Event time|เวลาเหตุการณ์
欄位變更明細|Field changes|รายละเอียดการเปลี่ยนแปลงช่องข้อมูล
環境|Environment|สภาพแวดล้อม
使用額度（美元）|Budget (USD)|งบประมาณ (USD)
已使用（美元）|Spent (USD)|ใช้แล้ว (USD)
處理中預留（美元）|Reserved (USD)|สำรองไว้ (USD)
API 呼叫次數|API calls|จำนวนครั้งเรียก API
語言|Language|ภาษา
主題|Theme|ธีม
淺色|Light|สว่าง
深色|Dark|มืด
跟隨系統|System|ตามระบบ
切換語言未完成，請稍後再試。|Could not change language. Please try again.|เปลี่ยนภาษาไม่สำเร็จ กรุณาลองใหม่
請求未完成（{0}）|Request failed ({0})|คำขอไม่สำเร็จ ({0})
新增人工報工|Add manual report|เพิ่มรายงานด้วยตนเอง
修改人工報工|Edit manual report|แก้ไขรายงานด้วยตนเอง
刪除人工報工|Delete manual report|ลบรายงานด้วยตนเอง
調整報工模穴|Adjust reporting cavities|ปรับคาวิตี้รายงาน
清除上下模|Clear mold operation times|ล้างเวลาขึ้นลงแม่พิมพ์
執行時伺服器時間|Server time at execution|เวลาเซิร์ฟเวอร์ขณะดำเนินการ
提交後取得識別碼|ID assigned after submission|รับรหัสหลังส่งงาน
不良原因名稱|Defect reason name|ชื่อสาเหตุของเสีย
資料明細|Record details|รายละเอียดรายการ
項目 {0}|Item {0}|รายการ {0}
技術資料|Technical details|ข้อมูลทางเทคนิค
不可讀取|Unavailable|ไม่พร้อมใช้งาน
請核對「{0}」的對象及影響，再獨立確認執行。|Review the target and impact of “{0}”, then confirm this operation separately.|ตรวจสอบเป้าหมายและผลกระทบของ “{0}” แล้วยืนยันงานนี้แยกต่างหาก
共 {0} 筆 · 第 {1} / {2} 頁|{0} records · Page {1} / {2}|ทั้งหมด {0} รายการ · หน้า {1} / {2}
人工報工歷史（{0} 筆）|Manual report history ({0} records)|ประวัติรายงานด้วยตนเอง ({0} รายการ)
模擬資料|Simulation data|ข้อมูลจำลอง
時間將於執行時由伺服器產生|Time will be assigned by the server at execution|เซิร์ฟเวอร์จะกำหนดเวลาขณะดำเนินการ
新增識別碼於提交後取得|New ID will be assigned after submission|รับรหัสใหม่หลังส่งงาน
資料已更新，請重新建立確認卡|Data changed. Create a new confirmation card|ข้อมูลเปลี่ยนแล้ว กรุณาสร้างบัตรยืนยันใหม่
沒有此模組權限。|You do not have permission for this module.|ไม่มีสิทธิ์ใช้โมดูลนี้
正式寫入未啟用。|Live writes are disabled.|ยังไม่เปิดการบันทึกจริง
請先登入並核對操作身分|Sign in and verify your identity first|กรุณาเข้าสู่ระบบและยืนยันผู้ปฏิบัติงานก่อน
目前身分沒有此模組的操作權限|Your identity cannot operate this module|บัญชีนี้ไม่มีสิทธิ์ดำเนินงานในโมดูลนี้
MES 登入身分已改變，請重新開啟對話並核對操作身分。|MES identity changed. Reopen the conversation and verify your identity.|บัญชี MES เปลี่ยนแล้ว กรุณาเปิดการสนทนาใหม่และยืนยันผู้ปฏิบัติงาน
MES 登入無法驗證；請重新登入或洽管理員。|MES sign-in could not be verified. Sign in again or contact an administrator.|ยืนยันการเข้าสู่ MES ไม่ได้ กรุณาเข้าสู่ระบบใหม่หรือติดต่อผู้ดูแล
來源不在允許清單|Origin is not allowed|ต้นทางไม่ได้รับอนุญาต
上一則訊息仍在處理|The previous message is still processing|ข้อความก่อนหน้ายังอยู่ระหว่างดำเนินการ
找不到此對話|Conversation not found|ไม่พบการสนทนานี้
保留本頁，只查核原操作|Keep this draft and check the original operation|เก็บฉบับร่างนี้และตรวจสอบงานเดิม
原操作查核結果|Original operation result|ผลการตรวจสอบงานเดิม
作業導覽|Operation navigation|การนำทางงาน
作業範圍|Operation scope|ขอบเขตงาน
查看最新內容|View latest content|ดูเนื้อหาล่าสุด
確認卡已過期|Confirmation card expired|บัตรยืนยันหมดอายุ
關閉|Close|ปิด
低|Low|ต่ำ
中|Medium|ปานกลาง
高|High|สูง
處理中|Processing|กำลังดำเนินการ
返回修改|Back to edit|กลับไปแก้ไข
刪除定時報告|Delete scheduled report|ลบรายงานตามเวลา
刪除|Delete|ลบ
今天想查什麼？|What would you like to know today?|วันนี้อยากทราบอะไร?
輸入生產問題…|Enter a production question…|พิมพ์คำถามเกี่ยวกับการผลิต…
隔離模擬環境，正式 MES 資料不會變更|Isolated simulation. Live MES data will not change.|สภาพแวดล้อมจำลองแยก ข้อมูล MES จริงจะไม่เปลี่ยนแปลง
登入已逾時，請重新登入 MES 後再使用|Your session expired. Sign in to MES again.|เซสชันหมดอายุ โปรดเข้าสู่ระบบ MES อีกครั้ง
MES 登入已驗證|MES sign-in verified|ยืนยันการเข้าสู่ระบบ MES แล้ว
用量額度|Usage limit|วงเงินการใช้งาน
尚未登入|Not signed in|ยังไม่ได้เข้าสู่ระบบ
尚未取得用量|Usage unavailable|ยังไม่ทราบการใช้งาน
Agent API 設定|Agent API settings|การตั้งค่า Agent API
排程報告|Scheduled reports|รายงานตามเวลา
介面外觀|Appearance|รูปลักษณ์
明亮模式|Light mode|โหมดสว่าง
黑暗模式|Dark mode|โหมดมืด
使用統計|Usage statistics|สถิติการใช้งาน
收合聊天室|Collapse chat|ย่อแชต
API 設定|API settings|การตั้งค่า API
Agent 設定|Agent settings|การตั้งค่า Agent
調整用量額度|Adjust usage limit|ปรับวงเงินการใช้งาน
定時產生報告|Scheduled reports|รายงานตามเวลา
設定已保存。|Settings saved.|บันทึกการตั้งค่าแล้ว
請先完成、取消或查核原操作，再修改管理設定。|Complete, cancel or reconcile the original operation before changing settings.|โปรดดำเนินงานเดิมให้เสร็จ ยกเลิก หรือตรวจสอบผลก่อนแก้ไขการตั้งค่า
核對管理設定|Review settings|ตรวจสอบการตั้งค่า
這不會寫入 MES 業務資料。|This does not write MES business data.|การดำเนินการนี้ไม่บันทึกข้อมูลธุรกิจ MES
同意並儲存|Confirm and save|ยืนยันและบันทึก
僅供查看；設定由既有主管權限調整。|Read-only. Existing supervisor permissions are required to change settings.|อ่านได้อย่างเดียว ต้องมีสิทธิ์หัวหน้างานเดิมเพื่อแก้ไข
額度調整立即生效，不會重設既有用量。|Limit changes apply immediately and never reset existing usage.|การเปลี่ยนวงเงินมีผลทันทีและไม่ล้างยอดใช้งานเดิม
服務未於原訂時間執行，未補跑。|The service missed the scheduled time. No catch-up run was performed.|บริการพลาดเวลาที่กำหนดและไม่ได้ทำงานย้อนหลัง
查詢或權限驗證未完成；沒有可確認的報告，不會自動重送。|Query or permission verification failed. No confirmed report is available; this run will not retry automatically.|การสอบถามหรือการตรวจสอบสิทธิ์ไม่สำเร็จ ไม่มีรายงานที่ยืนยันได้และจะไม่ลองซ้ำอัตโนมัติ
服務中斷，報告未完成；未自動重送。|The service was interrupted. The report is incomplete and was not retried.|บริการหยุดชะงัก รายงานไม่สมบูรณ์และไม่ได้ลองซ้ำ
設定於新聊天生效；既有作業不變。|Settings apply to new chats; existing tasks remain unchanged.|การตั้งค่าใช้กับแชตใหม่ งานเดิมไม่เปลี่ยนแปลง
API 來源|API provider|ผู้ให้บริการ API
後端金鑰已設定，不回傳秘密。|Backend key configured. Secrets are never returned.|ตั้งค่าคีย์ในเซิร์ฟเวอร์แล้ว ไม่ส่งข้อมูลลับกลับ
後端金鑰尚未設定。|Backend key is not configured.|ยังไม่ได้ตั้งค่าคีย์ในเซิร์ฟเวอร์
推理強度|Reasoning effort|ระดับการให้เหตุผล
僅提供已配置費率的模型，金鑰由伺服器管理。|Only models with configured rates are available. Keys are managed on the server.|มีเฉพาะโมเดลที่กำหนดอัตราค่าบริการแล้ว คีย์จัดการบนเซิร์ฟเวอร์
MES 受限工具助理|MES constrained-tool agent|ผู้ช่วย MES ที่จำกัดเครื่องมือ
只可查詢、補充草稿與準備確認卡；不能批准或執行寫入。|May query, update drafts and prepare confirmation cards. Cannot approve or execute writes.|สอบถาม แก้ไขฉบับร่าง และเตรียมบัตรยืนยันได้ ไม่สามารถอนุมัติหรือบันทึกเอง
每輪最多模型呼叫次數|Maximum model calls per turn|จำนวนครั้งเรียกโมเดลสูงสุดต่อรอบ
每次呼叫都保留費用，最多五次；未完成時會補問，不自動提交。|Each call reserves cost, up to five calls. Incomplete tasks ask for details; they are never submitted automatically.|สำรองค่าใช้จ่ายทุกครั้ง สูงสุดห้าครั้ง งานที่ข้อมูลไม่ครบจะถามเพิ่ม ไม่ส่งอัตโนมัติ
累計費用上限（美元）|Cumulative cost limit (USD)|วงเงินค่าใช้จ่ายสะสม (USD)
用量提醒比例|Usage warning percentage|เปอร์เซ็นต์แจ้งเตือนการใช้งาน
上限不可超過 US$20 與部署限制；已使用及未知用量不會清零。|The limit cannot exceed US$20 or the deployment limit. Used and unknown usage are never reset.|วงเงินต้องไม่เกิน US$20 และข้อจำกัดการติดตั้ง ไม่ล้างยอดใช้แล้วหรือยอดที่ยังไม่ทราบ
核對設定|Review settings|ตรวจสอบการตั้งค่า
返回定時報告|Back to scheduled reports|กลับสู่รายงานตามเวลา
尚未產生報告|No reports generated yet|ยังไม่มีรายงาน
報告狀態|Report status|สถานะรายงาน
資料日期|Data date|วันที่ข้อมูล
尚未取得完整報告，不代表零產出。|No complete report is available. This does not mean zero output.|ยังไม่มีรายงานครบถ้วน ไม่ได้หมายความว่าผลผลิตเป็นศูนย์
依 MES 時間每天產生前一排程日的唯讀快照；不自動報工，不使用模型費用。|Generate a read-only snapshot of the previous schedule date in MES time. No automatic reporting writes or model cost.|สร้างภาพข้อมูลแบบอ่านอย่างเดียวของวันตารางผลิตก่อนหน้าตามเวลา MES ไม่บันทึกผลผลิตอัตโนมัติและไม่มีค่าโมเดล
描述定時報告|Describe the scheduled report|อธิบายรายงานตามเวลา
例如：每天 08:00 報工 MC37|Example: daily 08:00 report MC37|ตัวอย่าง: ทุกวัน 08:00 ผลผลิต MC37
解析並填入|Parse and fill|แปลความและกรอกข้อมูล
報告名稱|Report name|ชื่อรายงาน
作業模組|Operation module|โมดูลงาน
設備（留空為全部）|Equipment (blank for all)|เครื่องจักร (ว่างหมายถึงทั้งหมด)
頻率|Frequency|ความถี่
每天|Daily|ทุกวัน
週一至週五|Weekdays|วันจันทร์ถึงศุกร์
執行時間|Run time|เวลาทำงาน
核對並建立|Review and create|ตรวจสอบและสร้าง
我的定時報告|My scheduled reports|รายงานตามเวลาของฉัน
尚未建立定時報告|No scheduled reports yet|ยังไม่มีการตั้งเวลารายงาน
下次執行|Next run|รอบถัดไป
查看報告|View reports|ดูรายงาน
暫停|Pause|หยุดชั่วคราว
恢復|Resume|ดำเนินการต่อ
已暫停|Paused|หยุดชั่วคราวแล้ว
錯過原訂時間|Scheduled time missed|พลาดเวลาที่กำหนด
執行中斷|Interrupted|การทำงานถูกขัดจังหวะ
額度已達上限|Usage limit reached|ถึงวงเงินการใช้งานแล้ว
用量已達提醒門檻|Usage warning threshold reached|ถึงระดับแจ้งเตือนการใช้งานแล้ว
模型|Model|โมเดล
剩餘額度（美元）|Remaining limit (USD)|วงเงินคงเหลือ (USD)
用量提醒|Usage warning|แจ้งเตือนการใช้งาน
已達上限|Limit reached|ถึงวงเงินแล้ว
查詢未完成|Query incomplete|การสอบถามไม่เสร็จ
執行中|Active|ทำงานอยู่
已刪除|Deleted|ลบแล้ว
` .trim().split('\n').map(line => { const [key, en, th] = line.split('|'); return [key, [en, th]]; }));
