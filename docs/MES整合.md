# MES 整合與正式寫入狀態

本版有可信 MES 登入橋接、正式資料唯讀查詢，以及報工／模具交易執行器。正式寫入預設鎖閉。已完成 SQL 替身與新隔離 SQL Server 的交易驗收，結果見 `SQL驗收.md`；隔離通過不代表正式環境已獲准上線。排程另交由 `mes_schedule.py` 的受控交易適配器，沿用同一可信身分與確認邊界。

## 已確認的資料來源

前端與部署組件來源為 `WeYuTech/test@979d2c63d90a3310b00486c755c18e7a25aaba5c`，完整操作盤點見 `inventory/`。2026-10-30 額外使用已授權連線讀取 `sys.tables`、`sys.columns`、`sys.types`、`sys.triggers`、`sys.sql_modules`、`BAS_QUERYREPORT`，未執行業務寫入或遷移。

已核對：

- `SEC_USER` 的 USER_SID、ACCOUNT_NO、USER_NAME、ENABLE_FLAG、REFRESH_TOKEN 存在；不查詢或傳回密碼欄位。
- 報工主檔 `WIP_OPI_WDOEACICOOUTPUT_HIST`、不良明細 `WIP_OPI_WDOEACICONG_HIST_DETAIL` 及其識別欄位存在。不良明細主鍵確實是 `WDOEACICONG_NG_HIST_DETAIL_SID`。
- 作業歷程 `WIP_OPI_WDOEACICO_HIST` 有四個 `ZZ_MODLE_*`、進出站、完工、模穴與稽核欄位。PART_NO 不在此表，不能把明細查詢投影當成可寫入欄位。
- 報工主檔 COMMENT 實際為 nvarchar(255)，正式適配器依 UTF-16 單位限制 255，超長時先拒絕。
- `EQP_MASTER`、排程與排程明細欄位存在。
- 在此帳號可見的 metadata 中，作業歷程與排程主表未回傳觸發器。這不是其他表或下游沒有副作用的保證。
- 對使用者指定的作業歷程成功載入唯讀交易上下文：1 筆作業歷程、1 筆排程、1 筆明細、1 筆設備、17 筆 EPS 不良原因；既有報工與不良明細皆為 0。輸出只保留筆數，未保存憑證或正式資料快照。

EPS 原因查詢 SID `391182452103864` 的 MASTER_SQL 指向 `BAS_REASON WHERE REASON_TYPE='NG_EPS'`；`350218189246470` 指向 NG_SCR。適配器將已確認的 NG_EPS 查詢寫成固定 SQL 加參數，不執行 registry 裡的任意 SQL。

## 可信身分沿用

呼叫鏈如下：

1. 使用者瀏覽器的 MES Session Cookie 到達同來源的助理後端。
2. 後端只抽取部署指定的 Session Cookie；缺少、格式錯誤、重複 Cookie 一律拒絕。不轉發其他 Cookie、使用者聲稱的帳號或 localStorage。
3. 向部署固定的 MES API 基底網址呼叫 `GET /api/session/check`。禁止轉址、禁止環境代理，不接受模型指定網址。
4. 驗證回應中的期限；沒有時區的 MES 時間依 MES_SERVER_UTC_OFFSET_HOURS 解讀。本環境只讀核對為 UTC+07:00，部署設為 7；不能假定和使用者電腦相同。
5. 以參數化查詢將 TokenKey 對應 `SEC_USER.REFRESH_TOKEN`，要求 ENABLE_FLAG=Y 且唯一一筆。Token 比對使用二進位排序規則，避免不分大小寫比對。
6. 由資料庫取得帳號與姓名，再套用部署端的帳號／模組 allowlist，預設不授權。
7. 身分附內部短效簽章，只供伺服器端使用。每個 HTTP 請求重新解析 MES Session，不將此身分存成長期登入快取。

登入程式會把 TokenKey 寫入 SEC_USER.REFRESH_TOKEN（反編譯 Auth_H5.cs:378），session/check 只回傳 TokenKey 與 Expiration（H5_LoginController.cs:269）。舊權杖更新流程可能使兩者不再對應；此時拒絕並要求重新登入，不降級接受聲稱的 uid。固定 `WeyuTech` 前置標記僅依舊 helper 證據移除；實際 Token 不進一般日誌。

`resolve_identity` 回傳 `id`、`name`、`user_sid`、`modules`、`roles`、`source`、`_expires`、`_proof`。HTTP 層只能輸出不以底線開頭的欄位。不得把模型產生的 dict 當成 identity。

## 服務介面

```python
bridge = MesBridge.from_env()
identity = bridge.resolve_identity(request.headers.get("cookie", ""), module)
snapshot = bridge.snapshot(identity, module, filters)
preview = bridge.prepare(identity, module, action, args)
result = bridge.execute(identity, module, action, args, expected_version, operation_id)
```

prepare 與 execute 必須由服務端確認卡流程呼叫。使用者確認之前不得呼叫 execute；operation_id 由服務端產生並在相同確認卡與重試中保持不變，格式為 UUID。

prepare 回傳 `version`、`changes`、`action`、`args` 與 `target`（設備、工單、排程／作業／報工識別碼及影響工單）；version 綁定資料快照、操作者、模組、動作、所有參數。正式資料變動、確認內容變動或服務重啟後，尚未執行的舊版本會失效。新增識別碼預覽改顯示「提交後取得識別碼」，不展示暫存數字；time_policy 明示真正異動時間取確認後執行時的 MES 伺服器時間。

`MesError.code` 包含 unauthorized、forbidden、configuration、validation、scope_too_large、not_found、ambiguous、unverified_contract、live_write_locked、stale、conflict、verification_failed、transaction_failed、outcome_unknown。不要在 HTTP 錯誤回應中輸出底層 SQL 例外、連線字串或 Session 值。

## 唯讀快照映射與範圍

snapshot 明確標示 `live_readonly`，限定 EPS-FORMING，採用已核對的原始檢視與 TVF，每次最多 1,000 列，超出拒絕並要求縮小範圍。支援設備、日期區間、工單、廠別、模具、完工、歷史狀態及識別碼；排序在受限結果內執行，不能變成 SQL 指令。

| 模組 | 主要表 | 可用篩選 | 未假造的資訊 |
|---|---|---|---|
| schedule | V_ZZ_KAOSU_PROD_SCHEDULE_OPI、GET_ZZ_KAOSU_PROD_SCHEDULE_DETAIL | 設備、日期／區間、工單、排程、品號、模具、廠別、完工 | 表頭 DETAILS，真實作業歷程 EXECUTIONS；不臆造正式歷程 |
| report | GET_ZZ_WIP_OPI_WDOEACICO_HIST_SCHEDULE_NG_OPI | 設備、日期／區間、工單、排程、作業識別碼、廠別、模具、品號、完工、history | REPORTS 及每筆 DEFECTS；MANUAL_OK／MANUAL_NG 與 IOT_QUANTITY／IOT_INFERRED_OK 分列 |
| mold | GET_ZZ_WIP_OPI_WDOEACICO_HIST_SCHEDULE_MOLD_EQP、CLEAR、SCHEDULE | 設備、日期／區間、工單、排程、廠別、模具、完工、history | 機台看板、歷史、待上模候選，EXECUTIONS、NEXT_ACTION 與 CANDIDATES |

報工 IOT_QUANTITY 直接映射原 TVF 的 IOT_PCS，IOT_INFERRED_OK 映射其 OK_QTY；已讀取函式定義確認公式是 IOT_PCS－NG_QTY。人工良品／不良則從 ENABLE_FLAG=Y 的報工主檔合計，不覆蓋 IoT 欄位。running 篩選保留原 SID 的 COMPLETED=N 且 CHECK_IN_TIME 非空條件。

模具 running 使用原機台看板 TVF，包含沒有進行中排程的 EPS 設備；history 使用 CLEAR 函式的近三個月且已有上模條件；pending 使用 SCHEDULE(OP,N) 且上模開始為空。all 合併原 SCHEDULE 函式的 N／Y 群組，保留函式既有 2026-07-01 起日條件。每台設備的 CANDIDATES 使用相同已核對待上模來源。

catalogs 包含設備、NG_EPS 不良原因、排程候選；排程模組另提供 GET_ZZ_KAOSU_PLAN_PART、GET_ZZ_KAOSU_PLAN_TOL、GET_ZZ_KAOSU_PLAN_TOL_DETAILS 及 V_ZZ_SCHEDULE_WO_TOL_SID_NEW 的品號、模具、模穴與工單。可用 catalog 只查選項、part_no 精確選品號、search 搜尋品號或規格、mold_no 查模具、wo 精確查工單。品號／工單選項超過 200 筆時，catalogs.truncated 明確要求縮小範圍，不讓模型誤以為清單已完整。

已用正式唯讀查詢核對指定作業：報工回傳 1 筆且人工／IoT 欄位分列；對應排程回傳 1 筆表頭表身、60 設備、200 品號（明示未全）、1 模具、1 工單、17 原因；該設備模具 running 1 筆、history 43 筆、pending 12 筆、all 71 筆、待上模候選 12 筆。筆數只代表當次讀取，不是固定測試答案。

正式 command 上下文會額外載入報工／不良明細、排程／明細、設備及 NG_EPS 原因目錄，供業務驗證使用；不將這些內部資料直接等同一般 snapshot。

## 交易執行器

已實作的受限正式命令包括：

- report.add、report.update、report.delete：人工良品、不良原因與總數、備註；新報工與不良明細使用資料庫 GetSid 重新配置主鍵。
- report.cavities：更新 OPI_CAV，小數拒絕，不默默四捨五入。
- report.complete：相同排程全部歷程完工，並將原規則選出的下一張排程全部歷程 REAL_CHECK_IN_TIME 更新。
- mold.mount_start、mount_finish、unmount_start、unmount_finish、clear：保留原進出站及完工連動。

報工／模具領域規則重用 domain.execute，但 mode 明確設為 live，並以正式表／欄白名單檢查每個差異。這條路徑禁止建立或刪除正式作業歷程；模擬器的缺少歷程補建邏輯不適用正式 MES。schedule.save 交由 mes_schedule.py，使用已查證的原 DETAIL trigger 生成歷程，未知排程命令仍拒絕。

每次 execute：

1. 驗證短效可信身分、模組、動作與部署開關。
2. 開 SQL Server 交易，設定 XACT_ABORT ON、SERIALIZABLE。
3. 以 OPERATION_ID 鎖定查詢操作紀錄；已完成且請求雜湊相同回傳原結果，不再次寫入；相同識別碼不同內容拒絕。
4. UPDLOCK/HOLDLOCK 載入目標排程，擴展至同機同班日的候選排程，再載入這些排程的全部歷程。這涵蓋完工後的下一張排程及所有同排程工單。
5. 鎖定報工、原因明細、相關主檔與原因目錄，再比對確認版本。範圍不唯一或不存在時拒絕。
6. 由資料庫取得現在時間，重新執行確定性領域驗證，產生欄位差異。
7. 以參數化 SQL 寫入白名單表／欄，每次新增、更新、刪除都要求影響一列。先刪子表，再刪主表；先新增主表，再新增子表。
8. 在相同交易內逐筆讀回，核對實際值與預期結果；不一致即回復。
9. 在相同交易寫入 OPERATION 與 CHANGE，最後提交。稽核失敗即回復業務變更。

提交時連線或回應異常標示 outcome_unknown。保留相同 operation_id 供核對，不建立新識別碼盲目重送。執行成功與實際欄位變更只在交易成功後回傳。

本機確認卡儲存與 SQL Server 業務交易不是同一交易，需由 HTTP 層保存該 operation_id，重試時依 SQL 操作紀錄核對，而非只看本機確認狀態。

## 部署設定

環境變數只放伺服器秘密管理或被忽略的本機設定；不得寫入前端或 Git。

| 名稱 | 用途 |
|---|---|
| MES_BASE_URL | 已驗證的既有 MES API 基底網址；不能由請求或模型覆寫 |
| MES_CONNECTION_STRING | 伺服器端 ODBC 連線設定；本文件不包含實際密碼 |
| MES_SESSION_COOKIE | 預設 ASP.NET_SessionId |
| MES_SERVER_UTC_OFFSET_HOURS | 無時區 MES Session 時間的伺服器 UTC 時差；本環境為 7，未設定預設 8 |
| MES_MODULE_ALLOWLIST | JSON，例：`{"TEST":["report","mold"]}`；未列帳號預設拒絕 |
| MES_ENABLE_WRITES | 預設關閉；完成隔離驗收後才可明確設為 1 |
| MES_WRITE_CONTRACT | 必須同時設定 transaction-v1 才開啟交易路徑 |

以同站來源的反向代理部署助理，使原 MES Session Cookie 可到達助理後端；Cookie 的 Domain／Path 必須實際驗證。不能把跨站 localStorage 或前端傳來的帳號當作同等登入。多 worker 部署目前每個 worker 簽章金鑰不同，未執行確認卡可能失效；應先採單 worker，或另設受控共用簽章金鑰與輪替規則後再擴展。程式沒有把簽章金鑰寫入磁碟。

遷移檔 `migrations/001_AI操作紀錄.sql` 只建立 AI 前綴資料表：OPERATION、CHANGE、PROPOSAL、FEEDBACK、KNOWLEDGE、BUDGET；沒有對正式業務表做測試寫入。此檔未執行。正式交易程式目前使用 OPERATION／CHANGE，其餘供後續正式確認、回饋與知識核准流程接入，不宣稱已取代本機 SQLite。

## 驗證紀錄與未完成部署條件

`tests/test_mes_http.py` 已通過 22 項快速測試，包括固定 HTTP 來源、Cookie 不外送、假帳號無效、逾期／重複登入拒絕、伺服器時差、部署授權、參數化、操作重送、稽核失敗回復、零筆寫入拒絕、過期確認、報工新增修改刪除、模穴、整批完工及下一張連動、四階段與清除。

快速測試使用 HTTP MockTransport 與 SQL 交易替身。另已完成正式資料庫 schema／TVF 唯讀核對、真實 Session 登入鏈，以及全新隔離 SQL Server 的遷移、實際 GetSid、參數化寫入／讀回、過期確認、重送與稽核故障回復。公開 HTTP SQL 測試與證據分開記載於 `SQL驗收.md`。正式資料庫沒有執行業務寫入；正式部署權限、並行及斷線處理仍須按現場條件驗證，不能僅切環境變數便宣稱上線完成。
