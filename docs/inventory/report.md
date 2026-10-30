# 報工模組功能、資料異動與卡控盤點

盤點日期：2026-10-30。來源版本：`979d2c63d90a3310b00486c755c18e7a25aaba5c`。

本文件由前端原始碼與後端 DLL 反編譯內容靜態交叉確認，未呼叫任何業務寫入 API、未修改業務資料。反編譯行號僅對應本次輸出，不等於原始 C# 行號。資料庫 trigger、constraint、查詢函式定義及實際部署版本如未另經驗證，不以本文件推定。

## 證據路徑與縮寫

| 縮寫 | 本次證據檔案 |
| --- | --- |
| 前端根目錄 | `C:\Users\rdpuser\Documents\ChatGPT\KaosuAgentDemo.references\snapshot\wwwroot` |
| 選單 | `MES-WIP/WIP-menu.js` |
| 執行中清單 | `MES-WIP/OPI/schedule_report/wip-opi_schedule_uping.js` |
| 歷史清單 | `MES-WIP/OPI/schedule_report/wip-query_schedule.js` |
| 明細 JS／HTML | `MES-WIP/OPI/schedule_report/wo-schedule.js`／`wo-schedule.html` |
| 後端根目錄 | `C:\Users\rdpuser\Documents\ChatGPT\KaosuAgentDemo.references\decompiled\MESH5_WEBAPI_20250228V2.Controllers` |
| 報工控制器 | `WIPOPI_SCHEDULE_WDOEAQ_CICOOUTPUTController.cs` |
| 執行控制器 | `WIPOPI_SCHEDULE_WDOEAQ_CICOController.cs` |
| 批次控制器 | `H5_WIPController.cs` |
| 資料庫執行器 | `C:\Users\rdpuser\Documents\ChatGPT\KaosuAgentDemo.references\decompiled-schedule-db\WeYuDB_H5\DBAction_H5.cs` |

## 現行入口與範圍

現行選單的排程、報工、模具上下模均為 EPS-FORMING。排程入口為 `setup/wip-query_schedule_plan_new.html`（選單第 89–95 行）；報工為 `OPI/schedule_report/wip-opi_schedule_uping.html`（第 146–153 行）；模具上下模為 `OPI/mold/wip-opi_schedule_mold_eqp.html` 並區分 fac1、fac2、fac3（第 155–163 行）。

報工明細 JS 尚有 FORMING、HEATING、CUTTING、EPS-PACKAGING 分支，但現行選單未呈現這些報工入口。另一套 `OPI/checkin`、`OPI/checkout` 是舊進出站流程，不能把其 NG_HIST_SID 與目前 OUTPUT_HIST_SID 混用。

## 功能與 API 對照

| 功能 | API／查詢識別 | 主要參數 | 前端證據 |
| --- | --- | --- | --- |
| 執行中清單 | `POST /api/H5_GetFunctionGrid`；SID `398780698646198` | 函式 `GET_ZZ_WIP_OPI_WDOEACICO_HIST_SCHEDULE_NG_OPI`、VALUE 為 OPERATION | 執行中清單第 68–79 行 |
| 歷史清單 | 同上；SID `398781696646709` | 同函式與 OPERATION | 歷史清單第 2、57–68 行 |
| 執行明細 | 同上；SID `398781696646709` | CON 篩選 `WIP_OPI_WDOEACICO_HIST_SID` | 明細 JS 第 35–46 行 |
| 設備選項 | `POST /api/H5_GetGrid`；SID `238522969613728` | EPS-FORMING 對應 EQP_TYPE=EPS | 歷史清單第 340–348 行 |
| 不良原因 | Grid SID `391182452103864` | EPS-FORMING 走此清單；FORMING／HEATING／CUTTING 使用 `350218189246470` | 明細 JS 第 18–28 行 |
| 報工歷史主檔 | `POST /api/H5_GetGrid`；SID `387029088326718` | CON 篩選執行主鍵；前端保留 ENABLE_FLAG=Y | 明細 JS 第 545–589 行 |
| 單筆報工原因明細 | `GET /api/WIPOPI_SCHEDULE_WDOEAQ_CICOOUTPUT` | query 為 `WIP_OPI_WDOEACICOOUTPUT_HIST_SID` | 明細 JS 第 602–635 行 |
| 新增人工報工 | `POST /api/WIPOPI_SCHEDULE_WDOEAQ_CICOOUTPUT` | 執行主鍵、人工 OK／NG、原因、帳號 | 明細 JS 第 283–323 行 |
| 修改人工報工 | `POST /api/H5_WIP_Update` | 報工主鍵、人工 OK／NG、原因、帳號 | 明細 JS 第 366–405 行 |
| 刪除人工報工 | `POST /api/H5_WIP_Del` | 報工主鍵、EDIT_USER | 明細 JS 第 447–468 行 |
| 修改報工模穴 | `POST /api/H5_WIP_OPI_CAV_UPDATE` | 執行主鍵、OPI_CAV | 明細 JS 第 752–827 行 |
| 排程完工 | `POST /api/H5_WIP_OPI_COMPLETE` | 排程主鍵、COMPLETED、LOGIN_USER | 明細 JS 第 692–750 行 |

`H5_WIP_Update` 與 `H5_WIP_Del` 實際位於「報工控制器」第 260、374 行，並非 `H5_WIPController.cs`。後者處理 `/api/WIP/LotCreate`、`LotCheckIn`、`LotCheckOut`、`LotFinished` 等批次流程（第 267、303、394、533 行），不可因檔名相近而誤接。

### 主鍵關聯

- `ZZ_KAOSU_PROD_SCHEDULE_SID`：排程識別；完工以此篩選全部執行資料。
- `WIP_OPI_WDOEACICO_HIST_SID`：單筆排程執行識別；新增報工、更新模穴使用此鍵。
- `WIP_OPI_WDOEACICOOUTPUT_HIST_SID`：單次人工報工識別；修改、刪除與查詢原因使用此鍵。
- `WDOEACICONG_NG_HIST_DETAIL_SID`：單筆不良原因明細識別。
- 各 Grid SID 為查詢定義識別，不得當成業務資料主鍵。

## 後端實際寫入與回應

### 新增人工報工

報工控制器第 158–258 行；要求 session 的 Key 非空並建立／更新 token，第 171–176 行。DTO 的總量與原因數量均為字串，第 25–60 行；後端轉為 Int32，第 195、198、208 行。

```json
{
  "WIP_OPI_WDOEACICO_HIST_SID": "執行主鍵",
  "NG_TOTAL": "2",
  "OK_TOTAL": "98",
  "NG_CODE_INFOS": [{ "NG_CODE_NO": "原因代碼", "NG_CODE_QTY": "2" }],
  "COMMENT": "備註",
  "EDIT_USER": "登入帳號"
}
```

| 資料表 | 寫入欄位／行為 | 證據 |
| --- | --- | --- |
| `WIP_OPI_WDOEACICOOUTPUT_HIST` | INSERT：主鍵、執行主鍵、NG_QTY、OK_QTY、ENABLE_FLAG=Y、CREATE_USER、CREATE_TIME、EDIT_USER、EDIT_TIME、COMMENT | 報工控制器第 188、212–213 行 |
| `WIP_OPI_WDOEACICONG_HIST_DETAIL` | 每個傳入原因 INSERT：明細主鍵、報工主鍵、NG_CODE、NG_CODE_QTY、CREATE_USER、CREATE_TIME、EDIT_USER、EDIT_TIME | 第 189、205–210 行 |

時間取 `GetDBTime()`，格式為秒；主鍵取「DB 時間距 2013-04-01 的毫秒數 × 100」，明細主鍵依迴圈索引遞增，第 196–209 行。此方法不是資料庫 sequence；不能假設高併發下完全不碰撞。

目前只檢查執行主鍵及原因陣列非 null，第 192 行；未見執行資料存在、上模、完工、非負數、原因有效性、原因總和等於 NG_TOTAL、工單剩餘數量、權限與 EDIT_USER 一致性等驗證。整數轉換會拒絕非整數字串或溢位，但不拒絕負整數。空原因陣列可通過外層判斷。

成功回 HTTP 200、`result:true`、新報工 SID；基本參數判斷失敗回 400；session 缺失或例外回 417，第 216–256 行。實際 SQL 失敗不一定進例外，詳見交易缺口。

### 修改人工報工

報工控制器第 260–372 行。先檢查 `ENABLE_FLAG='Y'` 的報工主檔存在，第 290、295–297 行；未檢查所屬執行資料的完工狀態。

| 資料表 | 寫入欄位／條件 | 證據 |
| --- | --- | --- |
| `WIP_OPI_WDOEACICOOUTPUT_HIST` | 以報工主鍵 UPDATE NG_QTY、ENABLE_FLAG=Y、EDIT_USER、EDIT_TIME、OK_QTY、COMMENT | 第 291、315–316 行 |
| `WIP_OPI_WDOEACICONG_HIST_DETAIL` | 以報工主鍵 + NG_CODE UPDATE NG_CODE_QTY、EDIT_USER、EDIT_TIME | 第 292、308–313 行 |

此 API **只 UPDATE 已存在原因，不會新增原因明細**。若原因主檔新增代碼，舊報工無該明細，傳入數量可能更新零列，但總 NG_QTY 已改；必須測試並修復服務層一致性。

不存在／停用資料回 400；session 缺失及例外回 417；成功宣稱回 200、result=true、SID，第 319–370 行。SQL 影響列數未核對；DTO 主鍵判斷只有不等於空字串，NG_CODE_INFOS 未完整防 null。

### 刪除人工報工

報工控制器第 374–466 行。先查 `ENABLE_FLAG='Y'` 的主檔，第 397、402–404 行。實際是**硬刪**，順序為先刪主檔、後刪原因明細：

```sql
DELETE FROM WIP_OPI_WDOEACICOOUTPUT_HIST
WHERE WIP_OPI_WDOEACICOOUTPUT_HIST_SID = @報工主鍵;
DELETE FROM WIP_OPI_WDOEACICONG_HIST_DETAIL
WHERE WIP_OPI_WDOEACICOOUTPUT_HIST_SID = @報工主鍵;
```

以上是以參數形式表達原始 SQL 語意；舊程式實際採字串組合，第 398–414 行。EDIT_USER 與 DB 時間雖被讀取，第 395、406 行，沒有寫入刪除稽核。若有外鍵限制，原本先主後明細順序還可能造成部分失敗。

成功宣稱 200；查無資料 400；session／例外 417。錯誤文字提到 already Check-out，但實際 SELECT 只檢查 ENABLE_FLAG，不能把訊息當成有出站／完工卡控。

### 完工與下一張排程啟動時間

執行控制器第 253–337 行。payload 為排程主鍵、COMPLETED、LOGIN_USER；以 DB 現在時間執行下列流程：

1. UPDATE `WIP_OPI_WDOEACICO_HIST`，將相同 `ZZ_KAOSU_PROD_SCHEDULE_SID` 的**全部列**設為傳入的 COMPLETED、COMPLETED_USER、COMPLETED_TIME，第 273–281 行。**沒有直接 UPDATE `ZZ_KAOSU_PROD_SCHEDULE` 表。**
2. 回查該排程的執行列，第 282–285 行；取第一列 EQP_NO、SHIFT_DAY。
3. 在同設備／班日找 `COMPLETED='N'`，依 CHECK_IN_TIME 排序的第一列，第 288–292 行。
4. UPDATE 該下一張排程全部執行列的 `REAL_CHECK_IN_TIME` 為此次完工時間，第 295–296 行。

卡控缺口：未限制 COMPLETED 只能 Y；未防重複完工；未檢查上模／報工數／不良數／使用者；未限定下一張一定在當前排程之後、REAL_CHECK_IN_TIME 尚未填寫或 ENABLE_FLAG=Y。重複執行可能覆寫完工時間和下一張實際開始時間。查無當前排程也可能回 result=true，因未檢查影響列數。

正常回 200、result=true、排程 SID；內層 SQL／後續查詢失敗回 **200、result=false**，第 299–315 行；session／外層例外回 417。首個 UPDATE 與後續查詢、下一張 UPDATE 不在同一交易，可能當前已完工但後續失敗。

### 報工模穴更新

執行控制器第 339–406 行。只 UPDATE `WIP_OPI_WDOEACICO_HIST.OPI_CAV`，WHERE 為執行主鍵，第 361 行。不更新排程主表、EDIT_USER 或 EDIT_TIME；雖取得 DB 時間，第 359 行，卻沒有使用。未驗證數字格式／範圍、總模穴、完工狀態或影響列數。

正常回 200、result=true；內層例外回 200、result=false；session／外層例外回 417，第 368–404 行。必須在新稽核記錄操作者、前後模穴與執行時間。

### 舊別名端點不可誤接

- `H5_WIP_COMPLETE` 以 HIST_SID 修改單一執行列的 COMPLETED／COMPLETED_TIME，非目前排程整批完工，第 133–194 行。
- **`H5_WIP_CAV_UPDATE` 有欄位誤植**：以傳入 OPI_CAV 更新的是 `COMPLETED`，不是 OPI_CAV，第 196–218 行。新服務應明確禁止使用此端點。
- 預設 `POST WIPOPI_SCHEDULE_WDOEAQ_CICO` 直接改執行主檔 OK_QTY、NG_QTY、COMMENT、EDIT_USER、EDIT_TIME，第 77–131 行；不是新增人工報工歷史的 API。

## 交易、驗證與成功判斷的關鍵問題

資料庫執行器 `doExecute(ref WeyuToken, string[])` 第 301–351 行沒有開啟交易。它逐句 ExecuteNonQuery，每句 SQL 的例外被 catch，寫入回傳 DataSet 的 Result／ErrorMsg，接著繼續下一句（第 321–347 行）。

新增、修改、刪除報工控制器分別在第 216、319、414 行呼叫此方法，**完全不檢查回傳 DataSet**，隨後宣稱 result=true。因此既可能主檔成功而明細失敗，也可能全部 SQL 失敗仍回成功。這是由呼叫鏈確定的程式行為，不只是推測網路風險。

無 token 參數的 `doExecute(string[])` 第 214–237 行也沒有交易，但會在首個 SQL 例外時停止並拋出；`doExecute(string)` 第 67–84 行是單句獨立執行。完工使用這兩者，不能跨整個流程保證原子性。

所有上述 SQL 使用字串拼接／格式化，未參數化。舊控制器多接受 payload 內 EDIT_USER／LOGIN_USER，未核對 session 身分。新增、修改、刪除的執行器會額外驗 token；完工／模穴的無 token 執行器本身不驗 token。需另核對站台全域認證過濾器，不能僅憑 controller 推論匿名可寫。

新服務應將「參數化 SQL、明確交易、授權身分綁定、影響列數與業務 result 驗證、唯一操作鍵、過期確認防護」放在確定性執行層。模型只提出允許清單內的結構化意圖，不直接產生 SQL。若重用舊 API，至少要回讀前後資料且辨識部分成功；對這些多表操作，單純包一層 HTTP 並無法補上真正交易。

## 查詢回傳與現行介面差異

GET 報工明細在報工控制器第 91 行使用 OUTPUT 主檔 INNER JOIN NG_DETAIL，未限制 ENABLE_FLAG。沒有原因明細的報工可能回 No Data，即使主檔存在。方法回傳序列化 JSON 字串，DataArrays 內又存序列化物件字串，第 130–141 行；明細 JS 第 627 行因而二次解析，不能套用單層 JSON 假設。

前端卡控與可見性：

- 列表須先選取資料，才可進入明細；執行中清單第 109–121 行。
- 歷史設備／日期篩選主要在前端；預設 SCHEDULE_DATE，日期區間含起訖；歷史清單第 276–288、374–409 行。
- 新增／修改只有儲存，沒有額外確認；明細 JS 第 115–119 行。使用者要求的新助理需補全部寫入確認卡。
- 刪除有 await 確認，第 447–450 行；改模穴有 await 確認與按鈕防連點，第 755、777 行。
- 完工 checkbox 在 HTML 第 197–204 行被註解，Check-Out 按鈕在 JS 第 16 行被隱藏；完工屬需恢復的既有後端能力。
- 完工 handler 第 693 行漏 await customConfirm，不能照抄。
- 原因輸入允許小數，前端總和用 parseFloat，但送出時用 `value | 0` 截斷成 32 位整數，第 143–149、218–250、292 行。後端總量轉 Int32，兩者可能不一致。
- 人工 OK input 沒有 min／step；HTML 第 233 行。總 NG input 唯讀，第 235 行。
- 模穴 regex 可輸入非負小數，儲存只檢查非空及 NaN；JS 第 664–679、758–774 行。後端尚無對應限制。
- JS 雖讀取 ng-comment，但 HTML 無此元素；不能宣稱目前介面支援備註輸入。
- 新報工沒有可編輯事件時間；HTML 第 229–230 行只供顯示編輯資料時間。後端使用 DB 現在時間。
- 人工報工 OK／NG 與 IoT 推算良品須分開呈現，不覆蓋原有計算。

## 舊進出站功能清單

此節記錄相鄰功能，並不代表自動納入現行 EPS 選單。

`OPI/checkin/wo-check-in.js` 第 341–369 行要求至少一位、最多兩位且不可相同的作業人員，以及設備、工單、進站時間。設備篩選未綁 WO，第 27–28 行。`POST /api/WIPOPI_WDOEAQ_CICO` 傳入 WO_ID、DEP_ID、OPE_ID、EQP_ID、ACCOUNT_ID、NUM_OF_ACC、CI_TIME、EDIT_USER，第 386–409 行。人員一／兩位選擇不等於權限角色選擇。

`OPI/checkout/wo-check-out.js` 使用舊不良 API `/api/WIPOPI_WDOEAQ_CICONG`：POST 以 CICO_SID 新增，第 467–501 行；PUT 以 NG_HIST_SID 修改，第 549–583 行；DELETE 以 NG_HIST_SID 刪除，第 628–650 行。出站使用 `PUT /api/WIPOPI_WDOEAQ_CICO`，傳 HIST_SID、CO_TIME、OK_QTY、NG_QTY、COMMENT、EDIT_USER，第 863–893 行；前端要求出站時間不早於進站，可相等，第 838–859 行。取消進站使用 DELETE 同端點，第 924–959 行。

## 可追溯稽核的最小內容

依使用者要求，新增表以 `ZZ_AI_AGENT_OPERATION_XX` 命名。稽核至少記錄操作識別、確認時間、執行時間、登入帳號、選定作業人員、模組、動作、目標主鍵、結果，以及每個受影響表／欄位的前後值。刪除保留被刪主檔與原因明細快照；完工另記下一張排程 REAL_CHECK_IN_TIME；模穴補上原 API 缺少的人員與時間。記錄應與新服務的業務寫入放在同一交易，避免成功無紀錄；敏感憑證不入紀錄。

## 模擬與驗收情境

| 情境 | 必須驗證 |
| --- | --- |
| 排程→上模→報工→完工→下模 | 主鍵關聯、設備／模具狀態、原流程卡控、前後資料一致 |
| 新增／修改人工 OK 與多種 NG | 原因合計、整數界線、人工量與 IoT 量分開 |
| 新原因加入後修改舊報工 | 原 API 只 UPDATE 導致原因缺列時，新服務正確處理 |
| 刪除 | 確認卡獨立、主檔與明細原子刪除、可追溯快照 |
| 同一排程多工單完工 | 確認卡揭露全部受影響列，以及下一張實際開始時間 |
| 重複完工／確認重送 | 不覆寫時間、不重複寫入；操作識別具冪等性 |
| 確認後他人修改 | 拒絕過期確認並重新顯示差異 |
| 已完工後新增／修改／刪除／改模穴 | 新服務依核准規則判斷；不要聲稱舊後端已有此卡控 |
| SQL 明細失敗、HTTP 200/result=false、回應遺失 | 不宣稱成功；無部分寫入或能清楚揭露異常 |
| 原因空陣列、負數、小數、Int32 溢位 | 明確拒絕不合法資料，無前端截斷造成的靜默差異 |
| 無效 SID、停用資料、跨工單 SID | 查存在／關聯／授權，影響列數符合預期 |
| 選擇代報人員與登入者不同 | 角色權限由伺服器認定，兩種身分均可追溯 |
| 舊別名 CAV_UPDATE | 明確禁止錯誤端點，防止把模穴寫到 COMPLETED |

尚待獨立驗證的項目包括：實際資料庫欄位型別與限制、trigger、查詢函式內 IoT 計算、部署 DLL 版本與快照是否一致、站台認證過濾器，以及使用者要採用的新增數量／完工規則。原程式未實作的規則必須標成新增卡控，不能冒稱為還原既有卡控。
