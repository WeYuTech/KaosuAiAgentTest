# 隔離 SQL Server 驗收紀錄

驗收日期：2026-10-30。正式來源 `kaosu_MES_KSS` 保持業務資料零寫入；只讀取 metadata、查詢結果及執行使用者授權的原登入流程。所有業務測試僅使用本次全新建立的 `ZZ_AI_AGENT_OPERATION_TEST_20261030`。

## 建立與隔離保護

- 建庫前查詢 sys.databases，指定名稱不存在才執行 CREATE DATABASE。程式再次遇到已存在名稱會拒絕建立，不自動刪除或重用。
- 每次測試連線先檢查 DB_NAME() 必須精確等於新庫名稱，再核對專用 marker 的用途文字。未通過時不執行業務 SQL。
- `.local/sql-test.env` 保存伺服器端連線設定，被 Git 忽略；腳本、文件、測試結果不包含真實密碼、API Key、Cookie 或 Token。
- 原庫只讀連線使用 ODBC read-only 屬性。來源 metadata 只用於建立結構；沒有 SELECT INTO、資料匯出或正式資料複製。
- 測試結束保留驗收庫、合成資料及操作稽核，不執行 DROP DATABASE，也不清空其他人的資料。

來源可見資料庫原本只有正式 MES、SQL 系統與 DW 系統資料庫，沒有明確指定的 MES 驗收庫。本次沒有把既有 DW 庫當作可寫測試環境。

## 結構與差異

從來源 metadata 複製必要資料表的欄位型別、長度、可空限制、預設值及主鍵，包含作業歷程、報工、不良明細、排程／表身、設備、工單、模具／模穴、品號、原因、班別及使用者。非必要的其他資料表、報表與排程工作沒有複製。不是正式資料庫完整備份，因此不宣稱已覆蓋所有外部報表／ERP 連動。

下列物件使用原庫定義，不以假函式取代：rand_view、GetSid、GET_DATETIME_STRING、三個 GET_ZZ_KAOSU_PLAN_* 函式、V_ZZ_SCHEDULE_WO_TOL_SID_NEW，以及表身的 ZZ_KAOSU_PROD_SCHEDULE_DETAIL_OPI_InsertUpdate trigger。來源 trigger 可在新增／修改／刪除排程明細時同步作業歷程；這也是排程交易驗收的一部分。

複製後已檢查 sys.sql_expression_dependencies，沒有 referenced_database_name 或 referenced_server_name。八個來源物件定義去除註解後未包含 USE、EXEC／EXECUTE、OPENQUERY、OPENROWSET、OPENDATASOURCE。腳本亦在後續結構設定前執行同檢查，避免新庫物件偷偷跨庫操作正式資料。故障注入 trigger 是另行在新庫建立的專用物件，只依 SESSION_CONTEXT 決定 THROW，沒有跨庫 SQL。

合成資料使用 TEST 帳號、TEST-MC36／37、TEST-PART-A／B、TEST-MOLD-A、TEST-WO-A／B 和 NG01／02，與正式主檔無關。測試登入的 session/check 使用 HTTP 替身，SEC_USER token 對應仍走新庫真實 SQL；此部分與另行完成的真實 MES 登入鏈核對分開記錄。

## 已通過的真實 SQL 交易案例

使用 `scripts/sql_acceptance.py --run`，10 個命令在新庫執行、讀回並提交：

| 命令 | 已記錄欄位異動數 |
|---|---:|
| report.add | 18 |
| report.update | 20 |
| report.delete | 18 |
| report.cavities | 1 |
| report.complete | 7 |
| mold.mount_start | 4 |
| mold.mount_finish | 2 |
| mold.unmount_start | 2 |
| mold.unmount_finish | 5 |
| mold.clear | 9 |

同時驗證：

1. 相同操作識別與請求重送，回傳原成功結果，不新增第二次業務變更。
2. 預覽後由另一連線修改模穴，確認時拒絕過期版本。
3. 新庫的稽核 CHANGE trigger 真正 THROW SQL 錯誤；業務 UPDATE 回復、OPERATION 無成功紀錄，確認模穴保留故障前數值。
4. 欄位讀回與預期一致後才記錄成功；所有操作使用實際 GetSid 與資料庫時間函式。

該輪完成時間為 `2026-10-30T07:50:27.188763+00:00`。完整操作 UUID 與結果留在被忽略的 `.local/sql-acceptance-result.json`，以及驗收庫 OPERATION／CHANGE，不把合成測試結果混入正式 MES。

## 公開 HTTP 邊界

排程另由 `tests/test_mes_schedule_http.py` 透過 FastAPI 公開 `/api/proposals` 與 `/confirm` 介面，執行真實新庫 SQL。負責排程的工作已回報四項通過：新增與可靠 SID、修改／刪除 trigger 連動、過期與已有報工刪除保護、稽核失敗完整回復。

報工／模具的完整公開 HTTP 生命週期測試 `tests/test_mes_http.py::test_SQL公開HTTP完成報工與模具生命週期` 已通過，耗時 214.93 秒。透過公開 API 依序開始／完成上模、報工新增／修改、模穴修改、報工刪除、整批完工、開始／完成下模、清除換模，逐項經確認卡才進入真實 SQL；最後讀回六時間清空、取消完工、模穴保留，以及十筆操作稽核。

此測試需明確 `MES_SQL_ACCEPTANCE=1` 才執行，預設跳過，不能在一般測試偷偷連正式資料庫。10 個公開 HTTP 操作 UUID 與結果另存 `.local/sql-http-lifecycle-result.json`。這輪 session/check 使用合成 Token 的 HTTP 替身，其後 SEC 身分對應、業務寫入與稽核均為新庫真實 SQL；不把它冒稱正式站台業務寫入。

## 真實 MES 登入與只讀核對

另使用原登入 API 的正常登入流程，取得 Session Cookie，再由 MesBridge 固定呼叫 session/check，於正式 SEC_USER 以 token 唯一對應帳號及部署 allowlist，最後讀取指定報工作業。成功帳號為 ADMINV2，授權模組為 schedule／report／mold，回傳 1 筆正式唯讀資料。第一次完整呼叫遇到 unauthorized，逐段核對後第二次完整鏈通過；不把首次失敗從驗收紀錄刪除。沒有輸出或保存實際憑證。

只讀比較 SQL GETDATE() 與 SYSUTCDATETIME()，此 MES 伺服器目前時差為 UTC+07:00。MesConfig.server_utc_offset_hours／MES_SERVER_UTC_OFFSET_HOURS 已新增，Session 的無時區期限依部署設定解讀；本環境使用 7。不能因操作人員在台灣而把資料庫記錄時間標示為 UTC+08:00。

## 重現方式與剩餘界線

先由部署管理員準備被忽略的本機連線設定。首次明確核准新庫建立時執行 `python scripts/sql_acceptance.py --provision`；已建立的本次驗收庫以 `--run` 新增一組合成情境，保留原紀錄。只有在已確認本次 marker 的新庫內，才可使用 `--setup-owned` 完成本次結構設定；不得把此命令用於其他資料庫。

一般快速測試執行 `python -m pytest tests/test_mes_http.py -q`。公開 HTTP 真 SQL 測試需額外設定 MES_SQL_ACCEPTANCE=1，再執行指定 SQL 測試。未提供驗收連線或未顯式啟用時跳過，不降級到正式庫。

目前正式寫入部署仍維持預設鎖閉。隔離資料庫測試不代表已獲准在正式 MES 建 AI 表或執行業務寫入。正式上線前仍要核對實際代理路徑與 Cookie 範圍、帳號模組授權、DDL 部署、來源物件版本、並行操作、網路中斷與提交結果未知的現場處理流程。
