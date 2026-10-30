# 排程模組盤點與 AI 還原依據

本文件為原系統唯讀程式盤點，未執行業務寫入。來源版本：`WeYuTech/test`，commit `979d2c63d90a3310b00486c755c18e7a25aaba5c`。反編譯結果用於還原部署 DLL 的可見邏輯，不能取代尚未取得的資料庫函式、約束與觸發器定義。

2026-10-30 補證：已唯讀取得正式資料庫排程明細觸發器，確認排程保存即生成／同步執行歷程。以下最後一節的新證據取代前文「歷程生成機制未取得」的當時限制；未執行正式寫入。

## 來源定位

以下行號以盤點時檔案為準，縮寫對應完整相對路徑：

| 縮寫 | 來源根目錄及相對路徑 |
|---|---|
| 選單 | `snapshot/wwwroot/MES-WIP/WIP-menu.js` |
| 清單 | `snapshot/wwwroot/MES-WIP/setup/wip-query_schedule_plan_new.js` |
| 編輯 | `snapshot/wwwroot/MES-WIP/setup/wip-query_schedule_detail_new.js` |
| 頁面 | `snapshot/wwwroot/MES-WIP/setup/wip-query_schedule_detail_new.html` |
| 查詢共用 | `snapshot/wwwroot/js/weyu/weyu_comm_api_function.js` |
| 舊編輯 | `snapshot/wwwroot/MES-WIP/OPI/schedule/wip-schedule_add_edit.js` |
| 存檔控制器 | `decompiled/MESH5_WEBAPI_20250228V2.Controllers/H5_KAOSU_PROD_SAVE_V2_KSSController.cs` |
| 請求模型 | `decompiled/MESH5_WEBAPI_20250228V2.Controllers/H5_KAOSUController.cs` |
| 工作階段 | `decompiled/MESH5_WEBAPI_20250228V2.Helper/SessionHelper.cs` |
| DB 寫入 | `decompiled-schedule-db/WeYuDB_H5/DBAction_H5.cs` |
| DB 查詢 | `decompiled-schedule-db/WeYuDB_H5/DBQuery_H5.cs` |
| 權杖驗證 | `decompiled-schedule-sec/WeYuSEC_H5/SECFun_H5.cs` |

以上各根目錄均位於工作區旁的 `KaosuAgentDemo.references`。`decompiled-schedule-db` 與 `decompiled-schedule-sec` 分別由部署版本的 `assemblies/WeYuDB_H5.dll`、`assemblies/WeYuSEC_H5.dll` 產生。

## 現行入口與操作範圍

現行 WIP_PLAN 選單只有 EPS-FORMING，導向 `setup/wip-query_schedule_plan_new.html`（選單：89–95）。清單新增及修改導向 `wip-query_schedule_detail_new.html`（清單：63–74），頁面：447 載入現行編輯腳本。不能用同時存在的 `OPI/schedule` 舊版替代現行規格。

| 人員操作 | 行為 | 證據 |
|---|---|---|
| 依日期查排程 | 日期區間送後端查詢，單日轉相同起迄日 | 清單：80–117、446–481 |
| 依設備／工單篩選 | 前端過濾；設備和工單均完全相等；工單先從表身反查排程 SID | 清單：487–538 |
| 關閉查詢 | Queryclean 只關視窗，清空與重查已註解 | 清單：55–61 |
| 排序、換頁 | 全資料排序後切頁，預設 20 筆；支援多欄、上下頁、跳頁 | 清單：140–197、292–306、560–571 |
| 展開明細 | 顯示品號、規格、工單、工單量、模穴、目標件數 | 清單：311–315、346–368 |
| 選取排程 | 選中後顯示修改並隱藏新增；再次點選可取消 | 清單：319–341 |
| 新增 | 排程 SID 為 null，目標模次預設 0、優先序 3 | 編輯：165–168、522 |
| 修改 | 依 SID 載入主表和明細，保留原排程時間、週期等；工單或模具 SID 缺漏時嘗試由主檔補齊 | 編輯：170–209、346–363 |
| 選品號 | 顯示規格及品號，送品號；不存在或歧義時要求重新選 | 編輯：688–755 |
| 選模具 | 依品號及製程查詢；唯一模具自動選，多個須選擇；切品號或模具清明細 | 編輯：212–298 |
| 設定目標模次、週期與開始時間 | 結束時間＝開始＋模次×週期秒，畫面顯示到分鐘 | 編輯：147–155、580–595 |
| Confirm | 查所選模具明細，尚未寫入 | 編輯：300–325 |
| 選明細工單 | 限相同品號工單，帶工單 SID、工單量、累計量 | 編輯：341–394、424–431 |
| 修改模穴 | 計算該列目標件數＝當前目標模次×模穴 | 編輯：410–421 |
| Save | 先驗證，呼叫共用新增／修改 API，成功返回生產日清單 | 編輯：442–568 |
| 返回 | 沿用製程及原查詢日期 | 編輯：763–776 |

這兩個現行頁面沒有獨立「刪除整筆排程、取消排程、批次排程、拖曳排程」入口。修改保存卻可能刪除舊明細，見後端異動規則。`CHANGE_MOLD="Y"` 是固定送出的排程欄位，不能當成已執行實際上模的證據。

## 查詢契約

`POST /api/H5_GetGrid`：SID 放 header，body 為 CON 查詢條件（查詢共用：2–40、60–90）。`POST /api/H5_GetFunctionGrid`：SID 放 header，body 為 `{TABLE_NAME, VALUE:[依序參數], CON:{Field:[],Oper:[],Value:[]}}`（查詢共用：111–142；編輯：635–645）。共用查詢還會附權杖 header，文件不記錄權杖內容。

| 用途 | SID | 條件／TABLE_NAME 與參數 | 證據 |
|---|---|---|---|
| EPS 表頭 | `387711187913807` | `SCHEDULE_DATE between 起日~迄日` | 清單：82–117 |
| FORMING／HEATING／CUTTING 表頭 | `395771505956627`／`396090484856455`／`397822752940869` | 同上；現行選單未提供這三入口 | 清單：83–90 |
| 清單表身 | `387711223506358` | `ZZ_KAOSU_PROD_SCHEDULE_SID in 逗號串接SID`；註解為 `V_ZZ_KAOSU_PROD_SCHEDULE_DETAIL` | 清單：4、119–130 |
| 清單設備 | `238522969613728` | `EQP_TYPE=EPS` | 清單：541–556 |
| 編輯設備 | `387896927970819` | EPS-FORMING 對應 EQP_TYPE=EPS | 編輯：7、603–612 |
| 工單 | `396007464513465` | 全量讀取，再依品號前端過濾 | 編輯：8、342–344、615–617 |
| 製程品號 | `416934178110428` | `GET_ZZ_KAOSU_PLAN_PART`，`[OPERATION]` | 編輯：9、17、620–622 |
| 品號模具 | `416934226416990` | `GET_ZZ_KAOSU_PLAN_TOL`，`[PART_NO,OPERATION]` | 編輯：10、18、625–627 |
| 模具明細 | `416934347196374` | `GET_ZZ_KAOSU_PLAN_TOL_DETAILS`，`[TOL_SID]` | 編輯：11、19、630–632 |
| 修改表頭 | `416929720296743` | `GET_ZZ_KAOSU_PROD_SCHEDULE_OPI_ALL`，`[SID]` | 編輯：12、20、172 |
| 修改表身 | `416930429536092` | `GET_ZZ_KAOSU_PROD_SCHEDULE_DETAIL`，`[SID]` | 編輯：13、21、173 |

上述 TABLE_NAME 是函式查詢參數的直接證據；尚不能據此聲稱已看過函式內所有 SQL、關聯資料表或工單可用規則。

## 寫入契約與身分

EPS 使用 `POST /api/H5_KAOSU_PROD_SAVE_V2_KSS`；其他製程分支使用 `POST /api/H5_KAOSU_PROD_PULP_SAVE`（編輯：539–552）。本文件的完整後端盤點限定 EPS 控制器；紙漿 endpoint 不宣稱已等量驗證。

前端此呼叫只有 JSON Content-Type，沒有 TokenKey header；**後端有驗證 Session，不是匿名寫入**。存檔控制器：46–52 需要 Session Key，建立權杖並更新 Session。DB 查詢：191–195 及 DB 寫入：474–480 會再驗證權杖。工作階段：13–36 將 Key 與到期時間寫回 Session，預設延長 10 分鐘；全域 `decompiled/MESH5_WEBAPI_20250228V2/WebApiApplication.cs:57–59` 要求 Session。

權杖驗證：247–302 檢查權杖可解密、內容格式與到期時間後更新權杖；未見此路徑將 `LOGIN_USER` 與已登入帳號比對，也未見排程角色授權。其領域字串比較為自我比較（271），不能當成有效的領域限制。AI 閘道必須自行從可信登入環境取得操作者，不能讓對話覆寫 LOGIN_USER。

表頭 JSON（編輯：521–537；請求模型：78–108）：

```text
ZZ_KAOSU_PROD_SCHEDULE_SID：null／空白為新增，既有 SID 為修改
SCHEDULE_DATE、SCHEDULE_START_TIME、SCHEDULE_END_TIME
OPERATION_CODE、EQP_SID、TOL_SID
SCHEDULE_CYCLE_TIME、TARGET_SHOT、CHANGE_MOLD（前端固定 Y）
COMMENT、PRODUCTION_STATUS、LOGIN_USER
Priority（前端拼法；後端屬性 PRIORITY 為 int）
DETAILS：明細陣列
```

明細 JSON（編輯：494–503；請求模型：111–127）：

```text
ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID
TOL_DETALS_SID（沿用原系統拼字）
SCHEDULE_CUR_CAV、PART_NO、PART_SPEC
WO_SID、WO_QUANTITY、TARGET_PCS
```

後端模型除 PRIORITY 外上述資料皆字串或明細陣列。前端傳入模穴數字，後端依既有 JSON 模型綁定；新閘道應固定契約型別並測試相容性。

## 後端真正卡控與班別解析

存檔控制器：34–80 的順序：

1. data、DETAILS 不可 null；DETAILS 不得包含 null 元素。**空陣列並未擋下**（36–39）。
2. SCHEDULE_DATE 須可由 InvariantCulture TryParse 解析，取 Date；錯誤訊息雖說 yyyy-MM-dd，程式並非 TryParseExact（40–44）。
3. EQP_SID 必須是正整數 SID，最大 `999999999999999999`；既有排程與非空既有明細 SID 也套用同規則（45、187–188、205–207、222、229–235）。
4. Session Key 不存在，回 HTTP 417；權杖無效亦失敗（46–52；DB 查詢：192–194；DB 寫入：477–479）。
5. 查 `EQP_MASTER`：`SELECT FAB ... WHERE EQP_SID=...`，必須唯一一台且 FAB 不空（55–65）。
6. 查 `ZZ_KAOSU_PROD_SHIFT_DAILY_REPORT_BASE`：同 FAB 且 SHIFT_START_DAY 等於排程日期，或 FAB 空白且排程日期介於 SHIFT_START_DAY、SHIFT_END_DAY（67–70）。
7. 優先採 FAB 專用資料；無專用才採空 FAB 通用資料。選中集合 0 筆或超過 1 筆都拒絕，不能默選第一筆（114–130）。
8. 班起迄若是完整 DateTime，保留完整日期時間；若是 HH:mm 等 TimeSpan，用排程日期＋SHIFT_START_DATE_1／SHIFT_END_DATE_1／第二班對應欄位的整數天數位移。時間限 0 至不足 24 小時；位移不得溢位（133–170）。
9. 每班開始與結束必須同時存在或同時空白；若存在，結束必須嚴格晚於開始。兩班皆空白可通過；沒有檢查班與班重疊（173–182）。
10. 向 DB 取得時間及新 SID，再建立寫入 SQL（77–80）。

前端以開始時間 08:00 切出生產日（編輯：570–577）；**後端接受傳入 SCHEDULE_DATE，不再從開始時間重新推導**。因此 AI 應明確顯示生產日，且於準備與執行時一致驗證。

## 實際資料表與欄位異動

以下為 SQL 直接證據，不再只是依 payload 推論。尚未取得的 trigger／DB constraint 可能另外產生副作用。

| 資料表／函式 | 動作 | 欄位／用途 | 證據 |
|---|---|---|---|
| `EQP_MASTER` | SELECT | EQP_SID 定位；讀 FAB | 存檔控制器：55 |
| `ZZ_KAOSU_PROD_SHIFT_DAILY_REPORT_BASE` | SELECT | FAB、SHIFT_START_DAY、SHIFT_END_DAY 篩選；讀 SID、SHIFT_CLASS_1/2、SHIFT_START/END_TIME_1/2、SHIFT_START/END_DATE_1/2 | 存檔控制器：67–76、190–192 |
| `dbo.GET_DATETIME_STRING()` | SELECT | 建立／修改時間取 DB 時間 | DB 查詢：296–300 |
| `dbo.GetSid()` | SELECT | 新排程 SID 基底 | DB 查詢：283–287 |
| `ZZ_KAOSU_PROD_SCHEDULE` | INSERT | 排程 SID；所有下列表頭欄位；CREATE_USER、CREATE_TIME、EDIT_USER、EDIT_TIME | 存檔控制器：198 |
| `ZZ_KAOSU_PROD_SCHEDULE` | UPDATE | 依排程 SID 更新所有下列表頭欄位、EDIT_USER、EDIT_TIME，保留原 CREATE_* | 存檔控制器：202 |
| `ZZ_KAOSU_PROD_SCHEDULE_DETAIL` | DELETE | 修改且 DETAILS 非空時，刪除本排程中未列在傳入既有明細 SID 清單的明細；若全部為新明細，刪本排程全部舊明細 | 存檔控制器：203–209 |
| `ZZ_KAOSU_PROD_SCHEDULE_DETAIL` | INSERT | 明細 SID、排程 SID、下列明細欄位、CREATE_*、EDIT_* | 存檔控制器：212–218 |
| `ZZ_KAOSU_PROD_SCHEDULE_DETAIL` | UPDATE | 依「明細 SID 且排程 SID」更新下列明細欄位與 EDIT_* | 存檔控制器：222–223 |

表頭保存欄位完整清單：

```text
SCHEDULE_DATE, SCHEDULE_START_TIME, SCHEDULE_END_TIME,
OPERATION_CODE, EQP_SID, TOL_SID, SCHEDULE_CYCLE_TIME, TARGET_SHOT,
CHANGE_MOLD, COMMENT, SHIFT_TYPE（固定 NULL）, SHIFT_CLASS_1,
SHIFT_START_TIME_1, SHIFT_END_TIME_1, SHIFT_CLASS_2,
SHIFT_START_TIME_2, SHIFT_END_TIME_2,
ZZ_KAOSU_PROD_SHIFT_DAILY_REPORT_BASE_SID, PRODUCTION_STATUS, PRIORITY
```

明細保存欄位完整清單：

```text
TOL_DETALS_SID, SCHEDULE_CUR_CAV, PART_NO, PART_SPEC,
WO_SID, WO_QUANTITY, TARGET_PCS
```

新增時主 SID 使用 DB 取得的基底，第一筆新明細使用基底＋2，其後每列＋1；不是每列重新呼叫 GetSid（存檔控制器：188、212–218）。修改仍取得一次新 SID 基底，供新增明細使用。SID 函式的跨請求保留範圍與唯一性須另查 DB 定義。

文字 SQL 值使用 Unicode 引號並將單引號雙寫，空字串轉 SQL NULL（238–240）；PRIORITY 是模型 int，直接插值。此路徑不是參數化 SQL。稽核時需區分使用者輸入空字串和 DB 實際 NULL。

修改的特殊情況：DETAILS 空陣列會更新表頭並保留全部舊明細（203）。非空陣列包含不存在或別筆排程的明細 SID，後續 UPDATE 可能 0 列，但刪除仍依本排程及保留清單進行；必須在新閘道拒絕不屬於目標排程的明細 SID。

## 交易、回應與錯誤

控制器呼叫 `DBAction_H5.doTranExecute(ref token, string[])`（80）。已核對實際 overload：DB 寫入：466–524 使用 `TransactionScope`，同一 SqlConnection 依序執行表頭、刪除、明細 INSERT／UPDATE，全部無例外才 Complete（487–500）。失敗離開未 Complete 的 scope，交易回滾，回傳 Result=false（507–520）。讀機台、讀班別、取得時間與 SID 發生於寫入交易之前，沒有同交易鎖住這些查詢。

`ExecuteNonQuery()` 的受影響列數被忽略（496），成功計數是 SQL 指令數，不是異動列數。不存在的排程 SID 或過期明細 UPDATE 0 列仍可能被報成功；沒有 rowversion／修改版本比對、冪等鍵、更新前快照。

| 情況 | HTTP／內容 | 證據 |
|---|---|---|
| 成功 | 200，`{result:true,Msg:"The Insert Transaction has been completed"}`；不回傳新排程 SID | 存檔控制器：96–100 |
| SQL 交易結果失敗 | 200，`result:false, Msg, DtInfo` | 87–94 |
| 參數／班別驗證失敗 | 400，`{result:false,Msg:原因,SID:""}` | 102–105、248–255 |
| Session Key 不存在 | 417，Token Verify Fail | 47–49 |
| 無交易結果或一般例外 | 417，`result:false,Msg,SID:""` | 82–84、107–110 |

前端錯誤解析讀 `result.message`，但後端使用 `Msg`；HTTP 非 2xx 時也只顯示 HTTP 碼（編輯：555–564），因此真實班別卡控訊息可能被原畫面隱藏。AI adapter 必須正確解讀 Msg 與 DtInfo，但不能把 SQL、憑證或內部堆疊原樣展示給操作員。DB 寫入：509–514 的 ErrorMsg 含失敗 SQL，不能直接當一般聊天內容。

## 前端卡控、狀態與後端缺口

| 規則 | 前端 | 目前可見後端 |
|---|---|---|
| 設備、品號、模具、開始、狀態必填 | Save 檢查 hidden SID 與欄位，編輯：449–459 | 只嚴格驗 EQP SID／FAB；其他多為原值保存 |
| PRIORITY 必填 | Confirm 要求；Save 空白預設 3，編輯：300–312、536 | 模型 int；無業務範圍檢查 |
| 非負模穴 | 負數拒絕；parseInt 解析，編輯：467–469 | 無相同業務驗證，字串保存 |
| 非零模穴需合法工單 | 需 WO文字＋SID，編輯：485–489 | 無品號／工單／模具關聯核對 |
| 零模穴工單 | 空白可；有文字必須有SID，編輯：475–484 | 無此檢查 |
| 至少一筆完整工單 | 零模穴合法WO也算，編輯：491–508 | 空 DETAILS 也接受 |
| 無明細不可存 | 編輯：515–518 | 未擋空陣列 |
| TRY／DO／RUN | 頁面：309–314；沒有轉移順序限制 | 任意狀態字串直接保存，無已完工／已報工限制 |
| 班別有效 | 前端沒處理 | FAB、唯一班別、時間與跨日嚴格驗證 |
| 時間重疊／模具占用／工單餘量 | 未見 | 本控制器及 DB executor 未見；DB trigger／constraint 尚待核對 |
| 每次寫入確認卡 | 尚無；Confirm只是讀明細 | 尚無；需由新 AI 閘道與介面新增 |

另有確定的前端一致性缺陷：目標模次變更只重算結束時間（編輯：153–155），不重算已顯示的明細 TARGET_PCS；修改模穴才重算該列（414–416），Save 直接採畫面值（502）。AI 版應在準備及確認前重新計算，不應重現錯值。

HTML 的模具與週期雖標 readonly（頁面：254、270），但編輯：85–93 對所有非 hidden input 綁 focus 移除 readonly，不能視為可靠不可編輯限制。起始日期只檢查非空，模穴小數會截斷、非數字變 0。應明確定義輸入型別，而不是讓模型模仿這些解析缺陷。

## 舊版差異，避免混用

| 項目 | 現行 setup | 舊 OPI/schedule |
|---|---|---|
| EPS 存檔 | H5_KAOSU_PROD_SAVE_V2_KSS | H5_KAOSU_PROD_SAVE_V2，舊編輯：665 |
| 產量顯示 | WO_QTY、ACCUMULATED_QTY | QUANTITY、FQC_OK、CAN_USE |
| 工單已達量 | 無 CAN_USE 警告 | CAN_USE=N 二次確認，可同意繼續，舊編輯：560–614 |
| 零模穴工單 | 合法工單可保留 | 不驗工單並清 SID，舊編輯：546–550 |
| 至少一筆工單 | 零模穴的合法工單亦可 | 至少一筆非零模穴工單，舊編輯：551–558、589–592 |
| 工單查詢 | 完全相等，前端 | 模糊 like，`snapshot/wwwroot/MES-WIP/OPI/schedule/wip-schedule_plan.js:116–143` |

## AI 對話與簡單稽核的實作要求

1. 模組選擇後，身分必須映射到已登入可授權身分；使用者口述姓名只能選擇有權角色，不能改寫 LOGIN_USER。
2. 以查詢白名單取得真實設備、品號、模具、工單 SID；歧義時列候選，不生成 SID 或 SQL。
3. 產生確認卡時列設備、模具、工單明細、開始／結束、生產日、班別、模次、模穴、目標件數、狀態、優先序及備註。
4. 修改卡必須顯示新增、修改、將刪除的明細；換模造成刪除不可只稱「更新排程」。刪除明細屬高影響差異，需清楚單獨同意。
5. 確認後重新讀取目標資料與班別，核對版本及明細歸屬，避免確認後資料已變。執行一次後查回，不能只憑 result=true 判定改對資料。
6. 稽核使用 `ZZ_AI_AGENT_OPERATION_XX` 命名。建議至少操作表及異動明細表；每次記錄操作 ID、DB／伺服器時間、操作者、模組、動作、目標 SID、確認時間、結果，異動表記實際 TABLE、列鍵、欄位、前值與後值。不得記錄 API key、權杖或連線密碼。
7. 由於原存檔成功不回新 SID，新增後查回若僅依欄位匹配可能歧義；應由包裝服務回傳可靠新 SID，或在可控制的同交易服務中保存映射，不能猜測最新一筆。
8. 原寫入交易與 AI audit 若分開進行，會有「業務成功但稽核失敗」缺口。要在正式環境宣稱可追溯，必須定義同交易或可靠補寫機制；不能單靠聊天紀錄當資料庫異動證明。

## 驗收情境

| 情境 | 應驗證內容 |
|---|---|
| 單設備、雙品項新增 | 真實主檔解析、卡片確認、主表明細查回、稽核欄位一致 |
| 同規格不同品號／多模具 | 人員明確選候選，不默選不相容組合 |
| 不改內容直接保存 | 缺漏 WO_SID／TOL_SID 可正確還原；原時間週期保留 |
| 零模穴與工單 | 零模穴空WO、零模穴合法WO、零模穴非法WO、全部空WO；遵守現行規則 |
| 負數、小數、非數字 | 給明確輸入錯誤；不把截斷或變0當正常意圖 |
| 07:59／08:00、跨月跨年 | 生產日、班別日期位移、開始與結束一致 |
| FAB 專用／通用班別 | 專用優先；0筆、多筆、缺FAB均拒絕；完整日期與跨日位移皆測 |
| 班起迄異常 | 單邊空值、結束相同或較早、非法時間與位移；兩班皆空白現況另列測試 |
| 改目標模次 | 所有 TARGET_PCS 與結束時間同步重算 |
| 換品號／模具 | 清舊明細、正確列刪除清單，慢回應不覆蓋新選擇 |
| 改狀態、優先序、備註 | 明確新舊值；原後端無狀態機限制不得自行宣稱已有 |
| 不存在／別筆明細SID | 新閘道拒絕，不能讓原API的0列成功或刪除副作用通過 |
| 排程衝突、模具占用、已報工後修改 | 先核對DB規則，再建立真實成功／失敗基準 |
| 交易中一列錯誤 | 表頭、刪除、全部明細整批回滾；錯誤可讀且不洩漏SQL |
| 重複同意／逾時／多人修改 | 冪等、版本檢查、可靠查回；只產生一次有效業務寫入 |
| 取消確認 | 零業務寫入，保留取消結果即可 |
| 查詢無資料與工單無匹配 | 清楚回答空結果，不轉成未授權的新增動作 |

上節最初以原始碼完成盤點時，資料庫函式、Grid SID、schema／constraint／trigger、GetSid 與時間函式尚未取得；其後已補查部署資料庫，以下節直接證據為準。正式登入與角色授權、部署啟用及現場人員驗收仍須依整體整合規格確認，不宣稱已執行原正式庫寫入。

## 資料庫補證：排程明細觸發器生成與同步執行歷程

2026-10-30 以 ApplicationIntent=ReadOnly、唯讀 ODBC 連線查 `sys.sql_modules`、`sys.triggers`、`sys.foreign_keys`，查完 rollback；沒有執行業務 DML。來源資料庫 `kaosu_MES_KSS`。證據保存於 references 的 `database-readonly/ZZ_KAOSU_PROD_SCHEDULE_DETAIL_OPI_InsertUpdate.sql` 與 `schedule-trigger-metadata.json`，不含連線密碼。此為當時部署 DB 的直接證據，不屬 Git commit 內檔案。

啟用的 `dbo.ZZ_KAOSU_PROD_SCHEDULE_DETAIL_OPI_InsertUpdate` 掛在 `ZZ_KAOSU_PROD_SCHEDULE_DETAIL`，事件為 AFTER INSERT、UPDATE、DELETE（SQL：10–12）。沒有另靠上模 API 建立歷程：儲存排程明細後即觸發；原 Save 使用交易，觸發器在同一寫入交易內執行。

| 明細動作 | 執行歷程實際連動 | SQL 行號 |
|---|---|---|
| INSERT | 新增 HIST，`WIP_OPI_WDOEACICO_HIST_SID = ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID`，並非另取 GetSid | 24–33、66–67 |
| INSERT 主檔帶入 | WO 由 WOR_MASTER；DEPT_NO、OPERATION_CODE、EQP_NO、TOL_SID、六個班別欄位、SHIFT_DAY 由排程與機台主檔 | 34–59 |
| INSERT 初始值 | ENABLE_FLAG=Y、CREATE/EDIT_USER=`SQLtrigger_user`、CREATE/EDIT_TIME=GETDATE()；SCHEDULE_CUR_CAV、OPI_CAV=排程模穴；COMPLETED=N；SCHEDULE_EDIT_USER/TIME=明細編輯者時間；ZZ_TOL_DETALS_NO 由模具明細 | 43–65 |
| UPDATE | 以 HIST主鍵=傳入明細SID 更新 WO、EQP_NO、SCHEDULE_CUR_CAV、班別、SCHEDULE_EDIT_*、SHIFT_DAY、TOL_SID、ZZ_TOL_DETALS_NO、排程SID、OPI_CAV、排程明細SID | 69–100 |
| DELETE | 刪除 HIST主鍵=被刪明細SID 的執行列 | 16–22 |

重要影響：

- INSERT 包含零模穴、WO_SID=0 的明細，沒有排除；此時 WO 查不到會是 NULL。不能只對有工單的列建立模擬歷程。
- UPDATE 每次把 OPI_CAV 改回 SCHEDULE_CUR_CAV，所以人工改過報工模穴後，再保存排程會覆蓋該模穴，即使排程模穴本次沒有改。確認卡須揭露這項連動。
- UPDATE 不重設四個模具階段、CHECK_IN_TIME、CHECK_OUT_TIME、REAL_CHECK_IN_TIME、COMPLETED 與完工時間，也不更新 HIST 的 CREATE_*／EDIT_*；改的是 SCHEDULE_EDIT_*。DEPT_NO／OPERATION_CODE 也只在 INSERT 設定。
- UPDATE 只更新已有同鍵 HIST，不會補建遺失的執行歷程。正式服務不能把0列同步當完整成功。
- 主表本身沒有相關觸發器；更新主表後要有明細 UPDATE，班別、設備等才隨之同步。現行 Save 會逐筆更新明細，因此正常流程會觸發。
- DELETE 只刪 HIST，不刪人工報工 OUTPUT 或不良原因。查到相關表之間無 FK、OUTPUT／NG_DETAIL 沒有觸發器，故刪帶有報工的明細可能留下孤兒報工。新服務應在單獨核准清理政策前拒絕此類刪除，並標為新防護。
- sys.sql_modules 掃描沒有找到另一個排程服務 SP 寫入鏈，已部署六個 DLL 也未找到該排程生成邏輯。`H5_KAOSU_SCHEDULE_CREATE` 實際為班別設定。來源 tree 的 exe 僅見 Roslyn 工具，相關 SQL Agent job 搜尋為空；現有觸發器已足以解釋目前鏈。

唯讀主檔函式補證也存於 `database-readonly/`：GET_ZZ_KAOSU_PLAN_PART、GET_ZZ_KAOSU_PLAN_TOL、GET_ZZ_KAOSU_PLAN_TOL_DETAILS、V_ZZ_SCHEDULE_WO_TOL_SID_NEW、GetSid、GET_DATETIME_STRING。可選工單為 STATUS=Release 且累計量小於工單量1.1倍；模具清單要求模具ENABLE_FLAG=Y，模具明細清單要求明細ENABLE_FLAG=Y。GetSid 是時間秒＋毫秒＋rand_view 的亂數字串組成，並非 sequence；正式新增須驗衝突與可靠回傳 SID。

正式完整鏈現在可明確表達：排程表頭保存 → 明細 INSERT／UPDATE／DELETE → 同交易觸發 HIST → 模具候選查詢 → 上模改 HIST 時間 → 報工 OUTPUT／NG_DETAIL → 整排程完工／下模。新服務的稽核必須讀回包含 trigger 的 HIST 差異，不能只記錄直接發出的兩張排程表 SQL。

## 正式排程交易適配器與隔離 SQL 驗收

`app/mes_schedule.py` 提供 `prepare`／`execute`，由既有 `MesBridge` 的 `schedule.save` 分派。預覽與確認均重驗設備、FAB、啟用模具與明細、品號、可排工單及唯一班別；核對明細 trigger 啟用狀態與已盤點定義摘要。觸發器版本變動、遺失同鍵歷程或資料不唯一時拒絕自動寫入，避免以猜測填補契約。

確認使用 SERIALIZABLE、XACT_ABORT、應用鎖及主檔／目標資料鎖重新核對版本。新主鍵取自原 `dbo.GetSid()`，檢查重複並回傳實際分配的 SID；暫存預覽 SID 不寫入。只直接修改排程主表及明細，HIST 由原 trigger 產生，隨後逐欄讀回核對。實際差異連同操作記錄寫入 `ZZ_AI_AGENT_OPERATION_OPERATION`／`ZZ_AI_AGENT_OPERATION_CHANGE`，與業務異動同交易提交；稽核每批最多200列，減少逐欄網路往返。重送相同操作 ID 與內容只回原結果。

新防護另包含：有人工報工的明細禁止刪除或更換工單、品號、模具明細；備註最多255個UTF-16單位；目標件數不得超過 `decimal(18,0)`。這些是已標示的修正，不假稱原 API 已有。

測試檔 `tests/test_mes_schedule_http.py` 預設略過，必須明確設定 `MES_SQL_ACCEPTANCE=1`。每次連線都經 `scripts.sql_acceptance.target_connection` 驗證 DB_NAME 為 `ZZ_AI_AGENT_OPERATION_TEST_20261030` 且存在本次新庫 marker。連線只從本機忽略檔載入；沒有在文件或程式寫入連線密碼。新庫業務表、欄位、預設、主鍵、函式及 trigger 複製自原庫結構，業務資料全部合成。登入 HTTP 使用替身，SEC_USER 對應與交易使用真實 SQL Server；本測試不宣稱驗證正式網站登入或原庫寫入。

2026-10-30 明確執行：

```powershell
$env:MES_SQL_ACCEPTANCE='1'
.venv\Scripts\python.exe -m pytest tests/test_mes_schedule_http.py -q
```

已實跑四個案例：新增排程同交易產生同鍵 HIST 並稽核、重送去重；修改重設 OPI_CAV 並保留上下模／進站時間及刪除明細連動 HIST；過期卡拒絕與已有報工明細刪除拒絕；SQL 稽核 trigger 拋錯使整筆排程交易回復。前三項合計120.68秒；第四項單獨33.56秒。耗時含真實跨網路 SQL 連線、主檔與鎖定檢查、trigger 與讀回；不在一般測試或知識發布流程自動執行。未設定開關的整體驗證結果為29個領域 HTTP 測試通過、4個 SQL 測試略過。
