# 模具上下模功能與後端盤點

盤點日期：2026-10-30。來源版本：`WeYuTech/test@979d2c63d90a3310b00486c755c18e7a25aaba5c`。本報告只做靜態讀取，未執行業務寫入、未在正式資料模擬上下模。

## 證據來源與限制

前端來源根目錄：`C:/Users/rdpuser/Documents/ChatGPT/KaosuAgentDemo.references/snapshot/wwwroot`。

後端為來源附帶組件的反編譯結果，並非原始 C# 專案。行號依本次反編譯輸出；若重新反編譯，行號可能改變。來源資料庫的觸發器、檢視與函式定義尚未在此子任務驗證，故不能宣稱已涵蓋所有資料庫連動。

| 代號 | 證據檔案 |
|---|---|
| M | `snapshot/wwwroot/MES-WIP/OPI/mold/wip-opi_schedule_mold_eqp.js` |
| MH | `snapshot/wwwroot/MES-WIP/OPI/mold/wip-opi_schedule_mold_eqp.html` |
| H | `snapshot/wwwroot/MES-WIP/OPI/mold/wip-query_schedule_clear.js` |
| HH | `snapshot/wwwroot/MES-WIP/OPI/mold/wip-query_schedule_clear.html` |
| API | `snapshot/wwwroot/js/weyu/weyu_comm_api_function.js` |
| C | `decompiled/MESH5_WEBAPI_20250228V2.Controllers/H5_KAOSUController.cs` |
| D | `decompiled-schedule-db/WeYuDB_H5/DBAction_H5.cs` |
| Q | `decompiled-schedule-db/WeYuDB_H5/DBQuery_H5.cs` |
| S | `decompiled-schedule-sec/WeYuSEC_H5/SECFun_H5.cs` |
| T | `decompiled/MESH5_WEBAPI_20250228V2.Helper/SessionHelper.cs` |

以上相對路徑均以 `KaosuAgentDemo.references` 為基準。

## 現行有效操作

| 操作 | 現行行為 | 證據 |
|---|---|---|
| 選廠別 | 三個 EPS 模具入口，傳 fac1、fac2、fac3 | `MES-WIP/WIP-menu.js:155–163` |
| 查詢設備／模具 | 設備精確比對；模具編號／名稱字串包含比對、不分大小寫 | M:1164、1249 |
| 分頁 | 每頁 20／50／100，前後頁、輸入頁碼 | MH:368、M:955 |
| 選列／取消 | 一次選一列；取消後隱藏四個動作 | M:1093 |
| 上模開始 | 先選設備，再選該設備候選排程；第一筆預設勾選 | M:170、182、213 |
| 上模完成 | 對選取列的排程識別碼操作 | M:258、636 |
| 下模開始 | 對選取列的排程識別碼操作 | M:339、708 |
| 下模完成 | 對選取列的排程識別碼操作，連動進出站及完工欄位 | M:416、780；C:1846 |
| 歷史查詢 | HIST 開另一頁，可查設備、模具、完工狀態；完工預設 N | M:119；H:360、383 |
| 清除換模 | 選歷史列並確認，清除六個時間欄位，取消完工 | H:103、110；C:1952 |
| 返回 | 依模組參數返回 | M:110；H:97 |
| 閒置刷新 | 主頁 30 秒刷新；換模操作或對話框開啟時暫停 | M:1273 |

有效 HTML 操作為四階段、查詢、HIST、返回（MH:343–360）。歷史的清除為 `clear_out`（HH:140）。新增與匯出均在註解內。歷史 `check_in`、`check_out`、`clear_in` 的 HTML 整段被註解（HH:134–139），雖保留 JS handler（H:590、643、694），不列為現行可操作功能。主頁殘留的 `EditData` 與 `EQP_STATUS` handler（M:100、854）沒有對應有效按鈕，後者亦未找到寫入。

## 查詢契約

`getFunctionGridData` 使用 `POST /api/H5_GetFunctionGrid`，SID 放在標頭，條件放 JSON 本文（API:111、123、134）。`getGridData` 與 `getGridDataV2` 使用 `POST /api/H5_GetGrid`（API:2、60）。以下 TABLE_NAME 是函式名稱，不是可據此認定的寫入表。

| 用途 | SID | 條件 | 證據 |
|---|---|---|---|
| 設備主表 | `398787693226131` | `TABLE_NAME=GET_ZZ_WIP_OPI_WDOEACICO_HIST_SCHEDULE_MOLD_EQP`；`VALUE=[OPERATION,EQP_TYPE]`；空 CON | M:11、907 |
| 上模候選排程 | `398787875683937` | `TABLE_NAME=GET_ZZ_WIP_OPI_WDOEACICO_HIST_SCHEDULE`；`VALUE=[OPERATION,"N"]`；CON 的 Field、Oper、Value 分別為 `["EQP_NO"]`、`["="]`、`[eqp]` | M:12、182 |
| 歷史與清除 | `398791667773160` | `TABLE_NAME=GET_ZZ_WIP_OPI_WDOEACICO_HIST_SCHEDULE_CLEAR`；`VALUE=[OPERATION]`；空 CON | H:10、151 |
| 設備選項 | `238522969613728` | `EQP_TYPE=EQP_TYPE` 的精確條件 | M:1214；H:423 |
| 伺服器時間 | `391878764126506` | 空條件，取 `Grid_Data[0].TIME` | M:237、314、393 |

`EPS-FORMING` 映射設備型別 `EPS`，其餘使用原 OPERATION（M:898）。廠別在取得主表後由前端依設備編號篩選：fac1 是 MC1–20、fac2 是 MC21–46、fac3 是 MC47–60；未知／未傳 fac 保持空陣列（M:920–933）。這是展示篩選，不能當作伺服器授權。

URL 接受 SCHEDULE_DATE，但上述查詢沒有加入該日期條件。M:11 與 H:10 的舊 view 註解也不是目前執行的查詢。

## 寫入契約與實際資料影響

### 四階段

四階段共用 `POST /api/H5_KAOSU_OPI_DATA_MODIFY`。DTO 的八個欄位全部是 string，未見驗證標註（C:274–290）：

```text
ZZ_KAOSU_PROD_SCHEDULE_SID
ZZ_MODLE_UPLOAD_START
ZZ_MODLE_UPLOAD_END
ZZ_MODLE_REMOVE_START
ZZ_MODLE_REMOVE_END
CHECK_IN_TIME
CHECK_OUT_TIME
LOGIN_USER
```

MODLE 是原契約拼字，不能自行改成 MODEL。前端時間為伺服器時間截到分鐘後加 `:00`；其他未操作的時間欄位傳空字串。後端只將非空欄位加入 SET，空字串表示不修改，並非清空（C:1842–1867）。

| 階段 | 前端非空時間欄位 | 後端額外變更 | 證據 |
|---|---|---|---|
| 上模開始 | `ZZ_MODLE_UPLOAD_START=t`、`CHECK_IN_TIME=t` | `EDIT_USER=LOGIN_USER`、`EDIT_TIME=資料庫現在時間` | M:576；C:1842、1852、1869 |
| 上模完成 | `ZZ_MODLE_UPLOAD_END=t` | 同上 | M:646；C:1856、1869 |
| 下模開始 | `ZZ_MODLE_REMOVE_START=t` | 同上 | M:718；C:1860、1869 |
| 下模完成 | `ZZ_MODLE_REMOVE_END=t`、`CHECK_OUT_TIME=t` | 同上，另 `COMPLETED='Y'`、`COMPLETED_TIME=資料庫現在時間` | M:790；C:1846–1850、1864、1869 |

**已證實直接更新的表是 `WIP_OPI_WDOEACICO_HIST`，條件是 `ZZ_KAOSU_PROD_SCHEDULE_SID`，不是該表單筆主鍵，也不是更新 `ZZ_KAOSU_PROD_SCHEDULE` 表。** SQL 見 C:1869。若一個排程對應多筆歷程，這個條件會更新全部符合的歷程。實際基數及觸發器待資料庫證據確認。

下模完成不只是記錄拆模結束，同時將該排程匹配的歷程標示完工。確認卡須列出影響筆數與此連動；不能顯示成單一模具時間修改。

### 清除換模

`POST /api/H5_KAOSU_SCHEDULE_CHECK_IN_OUT_CANCEL`。DTO 同樣為八個 string 欄位（C:293–309）。前端把四個模具時間及 CHECK_IN_TIME、CHECK_OUT_TIME 全傳 `"CLEAR"`，加排程 SID 與 LOGIN_USER（H:112）。

後端以不分大小寫的 CLEAR 判斷，將對應時間設成 NULL；清除 CHECK_OUT_TIME 還設定 `COMPLETED='N'`、`COMPLETED_TIME=NULL`（C:1952–1976）。更新同一張 `WIP_OPI_WDOEACICO_HIST`，同樣以排程 SID 篩選，並改 EDIT_USER、EDIT_TIME（C:1979）。

清除換模因此是「六個時間清空、取消完工」的組合動作，並非刪除資料列。沒有直接 DELETE。對已報工資料或其他表的間接影響，這兩個方法未直接處理；需核對資料庫觸發器與下游查詢。

## 狀態、身分與卡控

### 現行前端卡控

| 上模開始 | 上模完成 | 下模開始 | 唯一顯示的動作 |
|---|---|---|---|
| 空 | 任意 | 任意 | 上模開始 |
| 有 | 空 | 任意 | 上模完成 |
| 有 | 有 | 空 | 下模開始 |
| 有 | 有 | 有 | 下模完成 |

判斷位於 M:1108–1139，未檢查下模完成時間；完成後是否從主表消失依查詢函式結果，尚未證實。`isBlankTime` 會處理 NULL、空字串、字串 null／undefined／n/a／na、0、零日期等（M:982）。

四個動作開啟前要求選列（M:172、262、341、419）；儲存要求時間非空（M:563、640、712、784）；上模開始另要求選候選排程（M:569），且只能勾一筆（M:232）。時間選擇器設定 `allowInput:false`、`clickOpens:false`（M:242、322、398、481），正常操作沒有自行補登時間入口。

清除要求選列與獨立確認（H:104、110）；正常選列時有上模開始才顯示清除（H:328）。

### 後端已證實的檢查與缺口

1. 兩支 Controller 先檢查 Session Key 是否非空，建立權杖並呼叫 SessionHelper.UpdateToken（C:1831–1836、1942–1947）。執行 SQL 前，DB helper 另呼叫 VeriftyAndGetTokenObj（D:312）。
2. 權杖 helper 解析並檢查期限（S:247–301）；其中 `text2 == text2` 是恆真比較（S:271），不能宣稱它確實驗證模組或角色。此報告不列出任何金鑰材料。
3. SessionHelper.UpdateToken 依 TokenKeyTime 延長 Session Expiration；不合法設定預設 10 分鐘（T:13–36）。Session 更新在 SQL helper 驗證之前；不要把 Session 存在當成充分授權。
4. **兩支業務方法未查詢目前狀態、排程存在性、設備／模具相容性、時間先後、角色權限、登入者是否等於 LOGIN_USER，也沒有防重複或版本條件。** 判斷範圍是 C:1817–2035 及實際呼叫的 D:301–353；資料庫本身的約束尚待核對。
5. SQL 以字串串接接收時間、LOGIN_USER 與 SID（C:1844、1869、1979）。AI 橋接層只能使用白名單命令與嚴格型別，不能把模型文字直接交給此 SQL 組裝流程；若重做執行器需參數化。
6. 所有時間皆空或清除欄位皆不是 CLEAR，會形成 `SET , EDIT_USER...` 的無效 SQL；現行 Controller 沒有先回傳明確的缺欄位錯誤（C:1868–1869、1978–1979）。

現行模具頁沒有操作員或角色切換。LOGIN_USER 一律來自登入 localStorage 的 accountNo（M:584、654、726、798；H:120），頁首顯示 userName（`js/weyu/weyu_header.js:11`）。三廠入口不是身分。新助理的「選身分」應受可信登入及可代理範圍控制，不能靠自然語言冒用帳號。

## 共用 helper、交易與回應

Controller 的 MyDBQuery 為 DBQuery_H5、Action_H5 為 DBAction_H5（C:408、410）。每個模具方法準備一個 UPDATE，呼叫 `doExecute(ref token, string[])`（C:1876、1986）。

該 overload 開連線、逐項 ExecuteNonQuery、逐項捕捉例外並把結果放在 DataSet 第二張表（D:301–353）。**沒有 TransactionScope、BeginTransaction、Commit 或 Rollback；也沒有使用另外存在的 doTranExecute。** 此處只有單一 UPDATE，所以是 SQL Server 一般單敘述執行；不能把訊息中的 Transaction 字樣當作跨操作／跨稽核交易保證。

ExecuteNonQuery 的受影響筆數被丟棄（D:328）；沒拋例外就標 Result=true（D:330）。因此 SID 不存在、更新零筆也可能得到成功。它也沒有驗證更新筆數是否符合預期。

| 情況 | HTTP 與本文 | 證據 |
|---|---|---|
| SQL helper 結果失敗 | HTTP 200，`result:false`、Msg、DtInfo | C:1880–1888、1990–1998 |
| SQL helper 未回失敗項 | HTTP 200，`result:true`、完成訊息 | C:1891–1896、2001–2006 |
| 執行區塊拋例外 | HTTP 417，`result:false`、`Msg:"Insert Fail"` | C:1898–1905、2008–2015 |
| Session Key 不存在 | HTTP 417，`result:false`、權杖失敗訊息 | C:1908–1913、2018–2023 |
| 其他例外 | HTTP 417，`result:false`、例外訊息、空 SID | C:1915–1924、2025–2034 |

GetDBTime 執行 `select dbo.GET_DATETIME_STRING()`（Q:296），而不是應用程式主機時間。兩個方法還呼叫未使用的 GetDBSid（C:1838、1949；Q:283 呼叫 dbo.GetSid），並再次取得未使用時間（C:1839、1950）。這些 DB 函式定義未納入本子任務核對。

## 既有缺陷與新助理必要補強

- M:994 的 RE_TIME 誤讀 ZZ_MODLE_REMOVE_START；RS_TIME 也讀同欄（M:1023），應修正展示，不應把錯誤映射當成業務規則。
- 歷史正常點列用 RAW_CHECK_IN_TIME（H:329），重新選取卻讀沒有放進 row mapping 的 data.ZZ_MODLE_UPLOAD_START（H:571），可能錯誤隱藏清除按鈕。全域 `$btnClearOut` 確有宣告（H:521），並非未宣告問題。
- 清除只檢查 HTTP 狀態（H:132），可把後端 HTTP 200/result=false 當成功；新介面須解析業務結果。
- 四階段接受 HTTP 200 空白／非 JSON 回應為成功（M:595、667、739、811）。執行器應有確定契約，並讀回驗證；逾時結果未知不得重送。
- 查詢清除對 `.query-input` 包裝層呼叫 val（M:1239、H:448）；需用瀏覽器確認是否真清除欄位。
- 提交前必須重讀匹配歷程集合，核對草稿版本、狀態、身分、影響筆數；不能只複製前端按鈕顯示邏輯。
- 稽核應逐個實際匹配歷程主鍵記錄前後值，至少涵蓋四個模具時間、CHECK_IN_TIME、CHECK_OUT_TIME、COMPLETED、COMPLETED_TIME、EDIT_USER、EDIT_TIME。未執行／結果未知不得寫成已完成變更。
- 直接呼叫舊 API 不能和新 AI 日誌保證同一資料庫交易；要明確記錄準備、執行結果／未知、讀回驗證的差異。若要求原子性，必須另設受控執行服務，不可聲稱舊 helper 已具備。

## 模擬與驗收情境

以下為待執行案例，並非本次已通過結果。

1. 三廠設備範圍、未知 fac、跨廠設備、設備名稱歧義。
2. 完整四階段成功路徑，核對上模開始同步進站、下模完成同步出站及完工。
3. 同排程多筆歷程，確認卡列影響範圍，逐筆讀回與稽核。
4. 多候選／無候選排程，使用者指定不是第一筆，不得默選並寫入。
5. 缺設備、排程、時間、未知 SID；零筆 UPDATE 不得當有效成功。
6. 越階段、重複階段、已完工、已有下模完成時間，及其他人同時修改狀態。
7. 草稿後狀態變動、雙擊確認、逾時重試、回應遺失；確認卡失效／結果未知處理。
8. 過去、未來、跨日時間；現行 UI 無補登入口，新增補登需另訂授權與規則。
9. 歷史未上模、已上模未出站、已出站、已完工的清除；確認六時間清空與取消完工。
10. 取消確認不寫入；清除與會連動完工的下模完成需明示影響並獨立確認。
11. HTTP 417／500、HTTP 200/result=false、空回應、讀回未變、受影響筆數與草稿不符。
12. 登入過期、無權角色、代理操作、冒用 LOGIN_USER；稽核保存可信身分。
13. 「上模／裝模」、「下模／拆模」同義詞，以及「幫我換模」不足以判定階段時的澄清。
14. 修正 RE_TIME 顯示並驗證歷史刷新後清除按鈕、篩選清空與資料刷新。

## 待取得的證據

三個 GET_ZZ_* 函式定義、相關 SID 查詢定義、WIP_OPI_WDOEACICO_HIST 表結構與觸發器、排程對歷程基數、現行登入／代理權限、實際回應範例與合法模擬資料集。取得前不宣稱「完美還原」或「已驗證所有資料庫卡控」。
