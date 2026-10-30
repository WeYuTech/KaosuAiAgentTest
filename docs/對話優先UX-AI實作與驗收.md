# 對話優先 UX：AI 實作與驗收

日期：2026-10-30（Asia/Taipei）  
審查基準：`main @ 71506e727a0844b878637c03d3b4988a163f785c`  
狀態：以下為後續正式產品實作要求，不是本次文件 PR 的已完成測試清單。

先讀 [UX 改版規格](對話優先UX改版規格.md) 與 [原型使用說明](prototypes/README.md)，再執行本文件的工作順序。工作追蹤使用本 PR 關聯的 GitHub Issue；文件或原型驗證通過，不能代替正式應用的驗收。

## 給 AI 的任務摘要

在 WeYuTech/KaosuAiAgentTest 的既有應用中，實作「01 對話式助理預設入口＋02 按需展開作業摘要」。讓新人不用理解後端動作分類，也能明確選工單、填本次數量、修改、核對、確認及查看結果。程式必須沿用現有三模組、三語、可信身分、受限模型、版本化草稿、確認與查核契約。

執行前重新讀取最新 main、AGENTS.md、CONTEXT.md、docs/agents/、相關 ADR 與功能盤點，確認本基準之後是否已有變更。不要機械套用文件中的行號，也不要把已合併的功能重新實作。若本規格的 UI 提案與業務卡控有衝突，先指出具體來源及影響；業務資料安全與既有契約優先。

## 一、範圍與交付原則

推薦版以「對話式助理」為主流程，按需要逐步展開「本次作業摘要」。第一個垂直切片完成新增人工報工：選擇作業對象 → 補齊良品與不良明細 → 修改 → 核對 → 人工確認 → 結果。對話中的互動卡與文字輸入共用同一份後端草稿；摘要僅顯示目前已確認的資料，不建立另一套平行表單。

本次變更預設版型，不改 MES 業務規則。沿用目前 React／TypeScript 前端及既有 Python API；不為迎合其他技術棧改寫後端。不新增套件、資料表、欄位、索引或 migration，不變更既有交易執行器，不新增或改名後端業務 action。`schedule.new`、`query` 目前是前端選項，不能被當成可送至執行器的新 action。

報工 MVP 不表示刪減其餘功能：既有排程、模具、報工修改／刪除／模穴／完工仍須可操作。可以先讓尚未改版的動作保留既有表單，在明確入口中開啟；不能把原型沒有展示的功能一併移除。九頁 MES 既有啟動入口、宿主提供的工單情境、可信身分、三語、`light/dark/system`、1366×768 與 1920×1080 桌面驗收均保留。[來源：桌面規格][S-DESKTOP]、[三語規格][S-LOCALE]

## 二、現有合約：實作必須沿用

以下為基準原始碼可查證的合約；沒有將歷史驗收數字當成本輪完成證據。

### 2.1 HTTP 與資料所有權

| 現有入口 | 必須保留的語意 | 主要來源 |
|---|---|---|
| `GET /api/health`、`GET /api/session` | 讀取模式、AI 設定、MES 時區／日期與可信登入。正式模式不得自行選模擬角色；角色、身分不由聊天文字決定。 | `app/main.py`：`health()`、`session()`、`actor_for()`、`allowed()` |
| `GET /api/workspace?module=...` | 經模組授權的查詢；工單／設備等 URL 情境只是查詢線索，候選主鍵與狀態仍需來源資料核對。 | `app/main.py` workspace 路由；`frontend/src/main.tsx`：`contextFromUrl()` |
| `POST /api/conversations`、`GET /api/conversations/{cid}` | 對話綁定登入者、模組、來源情境與 locale。讀取會回填訊息所關聯確認卡的最新狀態；不得跨身分沿用。 | `new_conversation()`、`get_conversation()` |
| `GET /api/conversations/{cid}/guide` | 取得權威草稿：`version/action/intent/args/step/missing/ready`，有卡片時包含 `proposal`。 | `read_guide()`、`guide_view()`；`app/guide.py` |
| `POST /api/conversations/{cid}/guide` | 帶目前整數 `version` 與允許的 `action/intent/args/step`；檢查版本、處理中訊息、unknown。成功儲存會遞增版本並讓同對話 pending 卡失效。 | `update_guide()`、`save_guide()`、`check_conversation_edit()`、`merge()` |
| `POST /api/conversations/{cid}/messages` | 送 `{text}`；同一對話用 processing token 與 revision 防止舊輪次覆蓋。自然語言只能經既有受限工具查詢、補草稿與產卡。 | `message()`、`tool_actor()`；`app/model.py` |
| `POST /api/conversations/{cid}/proposals` | 前端送目前草稿的 `version/action/args`；版本存在時須 ready 且 action／args 精確相符。新增／修改排程的 intent 契約保留。產卡後草稿版本也會更新，須再讀取最新 guide。 | `chat_proposal()`、`make_proposal()` |
| `POST /api/proposals/{pid}/confirm` | 送 `{digest, approved}`。核對擁有者、模組、digest、pending、需求 revision、期限、環境與來源資料版本。`approved:false` 是取消要求，不代表前端可先宣稱取消成功。 | `confirm()` |
| `GET /api/proposals/{pid}` | 查回該身分的原確認卡，不另建業務操作。 | `read_proposal()` |
| `POST /api/proposals/{pid}/reconcile` | 只查原操作的提交證據。查不到不能等同失敗，不得改用新的 pid 重送。 | `reconcile()`；`MesBridge.operation_result()` |
| `POST /api/conversations/{cid}/locale` | 只改未來回覆與介面語言；不改歷史原文、業務識別、args、digest 或執行結果。 | `update_locale()`；`i18n.ts` |
| `GET /api/audit` | 查目前身分可見的操作紀錄；不能把草稿預覽 `changes` 當作已提交實際異動。 | audit 路由；`applyConfirmation()` |

來源：[app/main.py][S-MAIN]、[app/guide.py][S-GUIDE]、[api.ts][S-API]、[main.tsx][S-UI]。

### 2.2 版本、狀態與交易

1. `guide.version` 是草稿版本；`proposal.digest` 是確認內容雜湊；後端儲存的 `state_digest` 是被確認的來源資料狀態摘要；對話另有 revision／intent_revision。`state_digest` 並不是目前前端 `Proposal` 型別已宣告的欄位，UI 不需要自行生成或為此新增 API 欄位；來源狀態檢查仍由伺服器執行。不可混用，也不可自行用前端時間戳代替。收到 409 時保留使用者本機輸入，但先讀取權威 guide／proposal，再由人員決定如何重套，不可無條件重送同一 patch。[來源][S-MAIN]
2. `app/guide.py:merge()` 在更換 `execution_id/report_id/schedule_id` 時清除舊 args；**如果前端同時送「新目標＋全部舊 args」，清除後仍會重新灌入舊數量**。因此換目標必須送 target-only patch，接著完整採用伺服器回傳 guide，再重新詢問／填入該目標需要的資料，不能把舊數量合併回去。[來源][S-GUIDE]
3. `save_guide()` 會使同對話的 pending 卡變成 superseded。開關摘要、展開說明、捲動、切主題屬純呈現，不得為此呼叫 guide mutation。退回編輯必須使舊卡失效；「退回」和「取消整筆」是不同操作。[來源][S-MAIN]
4. `confirmationView()` 可呈現 pending、succeeded、cancelled、superseded、expired、failed、rejected；其他值視為待查核。這是前端呈現能力，**不代表後端每種錯誤都會持久化相同 status**。例如期限或資料版本不符可回 409，前端不能捏造一筆已被後端記錄的 failed／expired。[來源][S-CONFIRM]
5. `confirmWithRecovery()` 對明確 4xx 拋出錯誤；其他傳輸／伺服器錯誤先查回原卡。復原時即使查回 pending，仍映射為 unknown，因為 pending 不能證明先前請求從未送達。`reconcileProposal()` 查核失敗時仍保持 unknown。[來源][S-CONFIRM]
6. 隔離模擬模式由 `Store.transaction()` 的 SQLite `BEGIN IMMEDIATE` 包住模擬業務狀態、proposal 與 log。正式報工／模具由 `MesBridge.execute()` 使用既有 SQL Server 交易、鎖定重驗、原 operation ID／request hash 去重、交易內讀回及操作／欄位稽核；正式排程由 `mes_schedule.execute()` 處理既有 trigger、應用鎖與讀回核對。**SQLite 對話狀態與 SQL Server 不是同一個跨資料庫原子交易；UI 不得宣稱它們同時提交必然成功**。跨邊界未知結果必須保留原操作並走既有查核。[來源：Store][S-STORE]、[MesBridge][S-MES]、[排程執行器][S-SCHEDULE]
7. 正式寫入是否可執行依 `writes_enabled` 與後端權限；原型／UI 不可解除鎖定、變更預算帳本、把 SQL 測試的隔離限制拿掉。新 UI 不直接呼叫盤點文件中的舊 MES 別名 API。[來源：AGENTS][S-AGENTS]、[報工盤點][S-REPORT-INVENTORY]

### 2.3 不得因 MVP 刪除的動作

| 模組 | 現有後端 action | 不退化要求 |
|---|---|---|
| 報工 | `report.add`、`report.update`、`report.delete`、`report.cavities`、`report.complete` | 新增／修改的良品與多原因不良、備註；修改／刪除要選正確單筆人工報工；模穴針對 execution；完工針對整張 schedule。人工／IoT 數量分開。 |
| 排程 | `schedule.save`，草稿 `intent=create/update` | 新增／修改、設備、品號、模具、多工單／多模具明細、既有 detail ID、模穴、週期、目標模次、MES 時間、狀態／優先序／備註保留；同品號多明細不可默選第一筆。 |
| 模具 | `mold.mount_start`、`mold.mount_finish`、`mold.unmount_start`、`mold.unmount_finish`、`mold.clear` | 四階段及清除可到達；依已核對狀態選候選；上模開始連動進站、下模完成連動出站／完工、清除時間與取消完工的影響需顯示。 |

動作清單以 `app/domain.py:actions()` 為準；模具候選選擇沿用 `guided-records.ts:mountCandidates()/canChooseRecord()`，修改報工沿用 `reportDraft()` 的欄位映射；確認摘要沿用 `ProposalBusinessSummary` 對受影響工單與人工／IoT 的區分。[來源：領域動作][S-DOMAIN]、[候選與回填][S-RECORDS]、[確認摘要][S-SUMMARY]、[排程盤點][S-SCHEDULE-INVENTORY]、[模具盤點][S-MOLD-INVENTORY]

## 三、AI 實作任務分解

以下均為待實作。每項交付要附實際變更檔案、驗收結果與未通過項目，不沿用舊版本通過數字。建議依 E01 → E02 → E03／E04 → E05 → E06 → E07／E08 → E09 順序完成；不需建立通用表單引擎或新的 agent orchestration framework。

### E01 — 建立本輪基準與功能對照

- 閱讀 AGENTS、領域詞彙與三模組盤點；記錄目前 main SHA、啟動方式、API mode、測試是否需模型／SQL 存取。
- 對現有報工、排程、模具入口列出新位置；每個舊功能對應到具體入口或保留的既有畫面。標記本輪改版的 report.add 與保留路徑，不用「之後補」掩蓋缺頁。
- 驗收：上述動作表與九頁入口均有可查證對應；沒有 production write、schema 或新增套件變更；基準問題與新變更分開記錄。

### E02 — 建立單一操作主線，摘要漸進呈現

- 在 `main.tsx` 的工作區分流先接入報工 MVP；移除此路徑中 chat／作業單同時詢問「要做什麼」的重複起點。
- 報工啟動、候選選擇、缺資料提示、編輯、確認與結果留在同一主流程；右側或可收合摘要只讀取同一任務資料。
- 「更多操作」可保留修改／刪除／模穴／完工等入口。高影響動作沿用現有獨立確認，不改授權與規則。
- 驗收：初次進入只有一個明確主要下一步；有有效 MES session 不再要求使用者自行選擇另一個正式身分；查詢回覆不會把正在編輯的任務無預警切走；摘要開關不新增 guide／proposal／confirm request。

### E03 — 明確區分伺服器草稿與本機輸入狀態

- 由目前 `GuidedFlow` 的 `queueRef/versionRef/save()/flush()/adopt()` 抽出必要的草稿協調邏輯或重用小型 hook；避免再維護兩份互相競爭的 args。
- 型別先沿用 `frontend/src/api.ts` 的既有型別及 `GuidedFlow.tsx` 的 `Guide`；目前並沒有 `types.ts`，不可把假定檔名當成已存在來源。只有明確重用需求才移動型別，不建立通用抽象層。
- 權威資料為伺服器 guide／proposal；尚未儲存的欄位與聊天文字是本機輸入。至少區分未儲存、儲存中、儲存成功、儲存失敗，不能把 dirty 永遠顯示為 saving。
- 同一對話的 mutation 串行；較舊的查詢／目錄／guide 回覆需用目前 conversation／目標／request generation 檢查後才套用。取消 HTTP 讀取不是業務取消，兩者不得混淆。
- 驗收：快速連續改值最後呈現最新值；舊回應不回填到新工單；儲存失敗保留輸入、有明確重試／重新讀取選項；準備確認前 flush 成功，否則不送 proposals。

### E04 — 實作報工互動卡與資料核對

- 以現有 workspace 資料顯示設備、工單、品號／製程與可區分作業的時間／狀態。底層仍使用 execution_id，不能只靠 MC37 名稱決定對象。
- 顯示良品、不良原因／數量、備註；對「沒有不良品」送明確空陣列；對未回答有無不良持續追問，不能默認為零。
- 數量依現有整數契約與實際領域檢查：良品與各原因數量落在 `0..2147483647`，多原因合計也不能溢位；不能套用原型僅檢查 `Number.isSafeInteger()` 的較寬範圍。既有畫面若對不良數採更嚴格輸入限制，先記錄差異，不以UX工作擅改業務規則。
- 對後端 `missing` 與可定位的 `ApiError.code/params` 做欄位提示；缺欄位、型別、範圍與業務狀態錯誤分開呈現。後端仍是最終驗證者。
- 文字與卡片可以交替操作，已提供值不用重填。卡片直接使用現有受限 guide API，不以硬編碼自然語言字串假裝模型理解。
- 換目標送 target-only patch 並採用回傳 guide；禁止 `{...oldArgs, execution_id:newId}`。模擬數量只用於 Demo／測試，不把 100／120／缺料 2 寫死於正式操作。
- 驗收：完整體驗「MC37 選正確工單 → 良品100／缺料2 → 改120」；確認卡顯示120／2，舊100卡不能執行；新增明細使用來源原因代碼，不用中文標籤代替 code。

### E05 — 統一確認、取消與結果呈現

- 重用 `ProposalBusinessSummary`、`confirmationView()`、`confirmWithRecovery()`、`reconcileProposal()`；核對區僅有一組真正呼叫 confirm 的按鈕。
- 主操作在桌面可見，長明細可捲動但不能遮住已選對象、影響範圍與確認狀態。可將卡片內動作列固定於卡片底部；不能在尚未看懂影響時自動確認。
- 點確認／取消後立即鎖定該 pid 的重複送出。操作結果採實際回傳 status，不採點擊意圖；取消後若查回 succeeded，顯示已完成而非已取消。
- 成功時顯示本次實際數量／對象與操作識別、可查紀錄；不把 workspace refresh 失敗改寫成業務操作失敗。
- 驗收：雙擊單一介面只發一個正在進行的 confirm；跨分頁同 pid 重送不產生第二筆異動；明確4xx、成功、取消、unknown 都有不同下一步；unknown 的按鈕只走原 pid 查核。

### E06 — 重新整理、切換與未決操作恢復

- 沿用 `memoryKey()/rememberConversation()/resumeConversation()` 的登入者、模組與來源情境隔離；恢復後讀 conversation、guide 與原 proposal 權威狀態。
- 切模組／換工單前處理本機未儲存值；已儲存草稿可還原。對話文字不可被 `start()` 無預警清空，也不可被 `chooseRecord()` 隱性移植到另一張工單。
- pending 卡切目標前沿用既有取消／修改處理；unknown 期間保留既有鎖定邊界，不用另開對話繞過。
- 新增前端的最小送出恢復記錄，僅保存 conversation ID、原 proposal ID 與送出／待查核狀態，依現有 actor／module／來源 key 隔離；不能保存 Cookie、Token、完整 args、業務明細或把本機記錄當作成功證據。
- 在確認或取消請求送出前先寫入恢復標記，之後才呼叫既有 confirm；重新載入先讀取標記並向後端核對。標記只會讓 UI 更保守，不構成權限或執行成功證據。記錄寫入失敗時，該次請求尚未送出，應保留卡片、說明未送出及恢復資訊無法保存，停止此筆提交；不得靜默放行、先送出後補記錄或藉清除標記解鎖 unknown。
- 真正送達不明或已有較早未知嘗試的標記，只在讀回可證明終態後清除；原請求可能送達但讀回 pending 時繼續鎖定。**本次 confirm 已收到現有契約可明確判定未執行的 4xx 拒絕，且該 pid 沒有更早未知或其他進行中嘗試時**，核對權威狀態後可清除此嘗試標記或記為本機「已拒絕」；不能因伺服器仍是 pending 就把明確拒絕永久鎖成 unknown。這是本機嘗試結果，不捏造後端 failed／rejected 狀態；權限、過期、digest 或資料衝突的限制仍須處理。另一個請求的 4xx 不能用來清除先前 unknown；同 pid 的本機嘗試標記不得互相覆寫，無法排除其他分頁仍在途時保持保守鎖定。
- 瀏覽器儲存被清除、換裝置或完全禁用持久化的能力限制須明列，不能聲稱這份本機記錄提供跨裝置的送達證明。
- 驗收：reload 不自動呼叫 confirm 或另建相同操作；如原請求可能已送達，即使暫時查回 pending 也維持待查核；不同登入者不看到上一人的恢復內容。完全禁止瀏覽器持久化時的限制見「未決事項」，不得宣稱全面已覆蓋。

### E07 — 驗證三模組功能不退化

- 改動共用 shell、草稿與確認元件時同步走完三模組主要保留路徑；以既有 `actions()`、盤點文件與 HTTP 回歸作基準。
- 排程保留 create/update intent、同品號多模具明細、details 與既有 detail_id、合法零穴／空工單語意、時區／班日、修改主檔時清理相依欄位。
- 報工修改／刪除選單筆 report_id；模穴用 execution_id；整張排程完工使用 schedule_id，顯示所有影響工單及下一排程連動。
- 模具保留明確候選排程與 NEXT_ACTION，不能依前端顯示猜測後端允許；清除、下模完成等既有獨立確認仍在。
- 驗收：每個現有 action 都可從介面到達原 API；未改版路徑可使用，沒有少傳欄位、改用舊 MES 別名端點、翻譯識別碼或擅改業務卡控。

### E08 — 三語、主題、鍵盤與版面

- 所有新文案接入既有 `i18n.ts/translations.ts`，提供繁中／英文／泰文；識別與備註保留原值，歷史訊息不翻寫。
- 保留 `theme.ts` 的 light/dark/system 與宿主偏好訊息 origin/source 核對；不只做原型的二態 theme toggle。
- 保留輸入法 composition 防誤送、Enter 送聊天／Shift+Enter 換行；一般 Enter 不得觸發業務確認。對話卡用 button/input/label，鍵盤可到達、焦點可見；更新結果使用適度 aria-live，不每次字元都搶焦點。
- 1366×768、1920×1080 是必要桌面驗收。窄視窗採主流程單欄、摘要抽屜／展開，避免固定雙欄水平溢出；新增窄版支援不能破壞原桌面契約。
- 驗收：三語下完整資料與確認動作可見，泰文不截斷；深淺與 system 切換不改 guide／digest／proposal；縮放或收合後可繼續原任務。

### E09 — 公開邊界驗收、證據與交付

- 在現有測試工具中補能重現具體風險的測試；優先使用已有 Node test／前端元件回歸與 pytest HTTP 邊界，不新增測試框架。
- 狀態／競態測試用可控延遲與明確 deferred 回覆，不靠不穩定的固定 sleep。交易與去重不只測按鈕 disabled，需核對後端結果、操作ID與資料異動次數。
- 瀏覽器驗收記錄目標 commit、視窗、語言／主題、走過的路徑、成功或失敗及限制。合成資料與測試替身須明示；不得把固定腳本回答記為真實 LLM 通過。
- 正式站僅做已授權的唯讀／預覽／取消檢查；SQL 寫入測試維持既有隔離庫 gate，付費模型測試沿用有效累計預算，不重設帳本。
- 交付含更動摘要、可重現問題的修復證據、未通過清單與繁體中文 Commit Message；不能將文件 PR 的合併等同功能上線。

## 四、Given／When／Then 驗收矩陣

以下全是待執行條件。`HTTP` 指隔離資料上的公開 API；`UI` 指實際瀏覽器；`競態` 指控制回應順序與雙分頁；`SQL` 僅可在原有明確隔離 gate 下執行。除明列確認成功的案例外，查詢／補草稿／產卡／切語言均須核對業務快照不變。

### 4.1 報工與草稿

| 編號／邊界 | Given | When | Then |
|---|---|---|---|
| A01 UI＋HTTP | 可信 session、宿主給設備／工單線索 | 開啟報工 | 沿用該身分並查詢核對；不再讓使用者選另一正式身分；不只憑 URL 直接產生可寫卡。 |
| A02 UI＋HTTP | MC37 有兩筆可辨識 execution | 使用者只說「幫 MC37 報工」 | 顯示足以區分的候選資料；要求明確選取，不默選第一筆或只以設備號當主鍵。 |
| A03 UI＋HTTP | 已選合法 execution | 輸入良品100、不良缺料2，再改良品120 | 草稿及最新卡均為120／2；舊卡不可執行；確認前業務快照未變。 |
| A04 UI＋HTTP | 已提供設備、工單、良品與不良完整內容 | 發送自然語言或交替選卡 | 只詢問缺少／有歧義的資料；不要求從第一步重填；模型與卡片使用同一 guide。 |
| A05 UI＋HTTP | 良品已填但未回答不良 | 請求核對 | 明確詢問有無不良；選沒有後才送 `defects:[]`，不能把缺資料自行當作零。 |
| A06 UI＋HTTP | 可編輯良品／不良欄位 | 輸入負數、小數、空字串、超過Int32上限、重複原因 | 顯示對應錯誤，不截斷、不自動變0、不靜默合併原因；0等合法值仍依既有 schema／領域規則判斷。 |
| A07 UI＋HTTP | 目標A已有良品100／不良2的草稿 | 改選目標B | 只送目標必要欄位；使用後端回傳的清空／重建 args；不得把A數量帶到B；需重新核對B。 |
| A08 UI＋HTTP | 後端 guide 的 `missing` 含 `defects[0].code` 等欄位 | 開啟補資料卡或準備確認 | 顯示具體缺欄位並可定位，不只出現「資料未填齊」；不向模型／UI暴露任意SQL。 |
| A09 UI＋HTTP | 目前處理一個有本機未儲存值的任務 | 發出查詢、展開摘要或看說明 | 不遺失欄位、不自動換掉任務、不因純呈現操作使 pending 卡失效。 |
| A10 UI | AI 未設定，但 workspace／guide 可用 | 使用者開啟報工 | 明示文字理解目前不可用；仍可沿現有人工互動卡路徑填資料／核對，不假裝產生模型回答。 |
| A11 HTTP＋UI | 多個不同不良原因，各項數量均在合法整數範圍 | 填入合計超過2147483647的明細 | 依既有領域合計檢查拒絕；保留可修改的明細並指出合計超界；不截斷、分批寫入或用JavaScript安全整數範圍放行。 |

### 4.2 儲存、併發與晚到回應

| 編號／邊界 | Given | When | Then |
|---|---|---|---|
| B01 UI＋HTTP | 第一次guide儲存尚未回應 | 快速把良品100改110再改120 | mutation依序處理或合併尚未送出輸入；最後權威guide與UI為120；不被100／110的晚回覆覆蓋。 |
| B02 競態＋UI | 查詢設備A的回應被延遲 | 改查設備B，B先返回、A後返回 | 候選與目前選項仍屬B；A回覆不得改target／catalogs／摘要，且不新增業務操作。 |
| B03 競態＋UI | 舊conversation的非寫入讀取回覆仍在途 | 合法切至另一任務後舊回覆抵達 | 依conversation與request generation忽略舊呈現，不覆蓋新任務；無法合法切換的處理中／pending／unknown狀態仍維持鎖定。 |
| B04 HTTP＋UI | A、B兩分頁都讀取guide version N | B先儲存取得N+1，A再以N儲存 | A收到409後保留本機輸入、顯示衝突並讀回N+1；不自動覆寫B、不盲目重送。 |
| B05 UI＋HTTP | 使用者已輸入但自動儲存傳輸失敗 | 等待／按核對 | 顯示「儲存失敗」與可處理動作，輸入保留；不一直顯示儲存中；flush未成功時不送proposals。 |
| B06 競態＋UI | guide更新已於伺服器成功但回應遺失 | 使用者按重試 | 先讀回權威version與args，核對是否已套用；不以舊version無限重送，不生成重複確認卡。 |
| B07 UI＋HTTP | pending卡已出現，欄位有待儲存修改 | 同時按確認或立即發聊天 | 不確認舊卡；欄位先flush，失敗則停住；成功後舊卡失效，需核對新卡。 |
| B08 HTTP＋UI | 確認卡建立後來源資料被另一人修改 | 確認舊卡 | 接受後端stale／409拒絕；顯示資料已變更、重新查詢與核對；不以UI快照強制覆寫。 |
| B09 HTTP＋UI | 同conversation模型訊息仍處理中 | 再送訊息／更新guide | 遵守conversation_busy或processing保護；保留未送出內容並提示等待，不平行建立第二輪相衝需求。 |

### 4.3 退回、取消、確認與 unknown

| 編號／邊界 | Given | When | Then |
|---|---|---|---|
| C01 UI＋HTTP | pending卡內容正確 | 點「返回修改」 | 保留同一目標與已填資料；依guide更新使舊卡失效；不執行confirm，不把返回當取消整筆。 |
| C02 UI＋HTTP | pending卡尚未送出 | 點取消且伺服器回cancelled | 顯示已取消且零業務異動；保留取消紀錄，不顯示成功報工。 |
| C03 競態＋HTTP | 同pid在兩個分頁可見 | confirm(true)先成功，另一頁confirm(false)稍後到達 | 後到請求採既有succeeded結果；UI不能說已取消；只有一次業務異動。 |
| C04 競態＋HTTP | 同pid在兩分頁可見 | confirm(false)先完成，confirm(true)後到達 | 後到結果仍cancelled，零業務異動；不得為了完成而自動生成新pid。 |
| C05 UI＋HTTP | pending卡可確認 | 同一介面快速雙擊／按鍵重複觸發 | 前端在第一次提交開始即鎖定；只有一個進行中的confirm。即使測試故意重送同pid，後端不重複異動。 |
| C06 HTTP＋UI | 卡片已過期、digest不符或權限被收回 | 嘗試確認 | 依後端4xx與目前狀態呈現；不假造成功，不把明確拒絕當unknown自動重送；過期可重新讀取／重建確認。 |
| C07 競態＋UI | 確認可能已送達但回應逾時／遺失 | 自動查原卡暫時回pending或查回也失敗 | 顯示unknown；保留原pid；禁止再次confirm及換pid重送；允許既有reconcile。 |
| C08 UI＋HTTP | 原卡為unknown | 按查核，後端找到一致提交紀錄 | 顯示原操作succeeded與實際changes；網路只呼叫reconcile／read，不再呼叫confirm或proposals。 |
| C09 UI＋HTTP | 原卡為unknown | 查核無完整證據、回應格式異常或查核失敗 | 保持待查核、保留識別並提示處理方式；不能說已失敗／已取消，不能自動重送。 |
| C10 UI＋HTTP | confirm已回succeeded | 隨後workspace refresh失敗 | 保持業務成功，另提示清單更新失敗與重新讀取；不出現要求重送報工的主要按鈕。 |
| C11 HTTP＋UI | 正式模式writes_enabled=false | 核對可寫類型的卡片 | 顯示可預覽但尚未開放寫入，禁用同意；取消／修正依現有合約可用；不修改環境開關。 |
| C12 UI＋HTTP | pending high-impact action | 未勾獨立確認便嘗試執行 | 不提交；勾選後仍須本人點確認；翻語言、換目標、重建卡時不能沿用先前同意。 |
| C13 UI＋HTTP | 本次確認收到可證明未執行的明確4xx拒絕，該pid沒有較早未知或其他進行中嘗試 | 核對權威狀態後重新整理 | 不因遺留本機標記誤鎖為unknown；依過期／權限／衝突顯示正確修正路徑，不能繼續送出已失效卡。若原本已有unknown，這次4xx不得清除其鎖定。 |

### 4.4 刷新、登入與模組保留

| 編號／邊界 | Given | When | Then |
|---|---|---|---|
| D01 UI＋HTTP | 後端已有已儲存guide及pending卡 | 重新整理 | 還原同actor／module／來源conversation、最新guide與卡片；不自動產卡／confirm；卡片期限仍正確。 |
| D02 競態＋UI | confirm在途或本機已標待查核 | 重新整理後原卡暫回pending | 使用最小恢復記錄保持待查核，不重新開放寫入；讀回終態才清除記錄。持久化不可用的限制要明列。 |
| D03 UI | 聊天框有未送出的文字或欄位儲存失敗 | 切模組／工單／收合後重開 | 不無預警捨棄、不把文字移到錯誤工單；明示保留／捨棄的本機狀態，已儲存資料仍可恢復。 |
| D04 UI＋HTTP | 使用者有pending／unknown操作 | 嘗試從入口另開相同任務繞過 | 維持既有未決操作鎖定與原pid恢復，不透過新conversation當成「重試」。 |
| D05 UI＋HTTP | session過期、登入者變更或模組權限移除 | 讀取／修改／確認 | 依401／403／404停止操作；不能以localStorage身分代替；不把前一人的草稿或恢復記錄顯示給新人。 |
| D06 UI＋HTTP | 排程已有多工單、同品號不同模具明細 | 修改、返回、刷新後再核對 | create/update intent與既有detail_id／mold_detail_id關聯保留；不能依陣列順序或第一筆重配。 |
| D07 UI＋HTTP | 報工歷史含多筆及多原因 | 修改／刪除特定一筆、改模穴、整張完工 | 各自使用正確report_id／execution_id／schedule_id；完工揭露全部受影響工單；人工量與IoT量分開。 |
| D08 UI＋HTTP | 模具資料涵蓋待上模、上模中、已上模、下模中、可清除 | 依序走各合法入口與不合法階段 | 所有現有action可到達；不合法階段由既有後端拒絕；下模完成／清除連動範圍與獨立確認保留。 |
| D09 UI | 既有九頁loader／宿主情境 | 從各頁啟動、放大、收合與重開 | 入口與來源線索保持，沒有重覆安裝loader；同源偏好／開關訊息檢查保留。 |

### 4.5 三語、鍵盤與窄畫面

| 編號／邊界 | Given | When | Then |
|---|---|---|---|
| V01 UI＋HTTP | 有pending卡與來源工單／備註 | 依序切繁中、英文、泰文 | 新文案完整、後續回覆依locale；歷史原文、識別、args及digest不變；不建立新operation。 |
| V02 UI | light/dark/system及宿主偏好可用 | 切主題、改系統主題、刷新 | 偏好恢復且符合system；焦點、錯誤、disabled、確認內容皆可辨識；不改業務狀態。 |
| V03 UI | 中文輸入法正在組字 | 按Enter完成選字，再用Enter／Shift+Enter | composition期間不送出；一般Enter只送聊天、Shift+Enter換行；不因此執行業務confirm。 |
| V04 UI | 僅使用鍵盤 | 依Tab／Shift+Tab走候選、欄位、核對、返回、取消、確認 | 順序可預期、焦點可見、無不可退出的焦點陷阱；卡片更新後焦點落在合理位置；Esc保留收合語意，不被當成取消／確認業務操作。 |
| V05 UI | 1366×768及1920×1080，三語各一輪 | 走到完整核對卡與結果 | 主要對象、狀態與確認動作不被固定元件遮住；可讀取全部影響範圍；不再要求在另一個大空白聊天欄尋找下一步。 |
| V06 UI | 768px與390px窄視窗或200%縮放 | 選工單、填數字、展開摘要、核對 | 主流程不因固定雙欄水平溢出；長工單／英文／泰文可換行；按鈕可到達，摘要可收合，不遮確認。 |
| V07 UI | 發生欄位錯誤、儲存失敗、成功或unknown | 輔助科技讀取／鍵盤操作 | 有語意標籤與可識別狀態訊息；錯誤與欄位關聯；不只靠顏色或不可見toast表達結果。 |

### 4.6 交易與安全回歸的證據邊界

| 編號／邊界 | Given | When | Then |
|---|---|---|---|
| T01 HTTP | 相同pid與確認內容 | 重複確認或返回後重送 | 相同終態，最多一次有效業務異動；核對快照、實際changes與log，不只檢查HTTP 200。 |
| T02 SQL（有gate才執行） | 指定隔離庫、合成資料，既有稽核或讀回檢查注入失敗 | 執行正式adapter路徑 | 交易失敗不得呈現成功；核對業務與稽核沒有部分提交。未執行時標示未驗證，不以模擬結果代替。 |
| T03 HTTP＋UI | 不合法action／欄位、跨身分或跨模組識別 | 從互動卡或聊天嘗試提交 | 既有白名單與授權拒絕；UI不能新增任意端點／SQL／表名能力，不洩漏連線字串或stack trace。 |
| T04 UI | 使用者文字含HTML、script樣式或惡意連結 | 顯示聊天／錯誤／備註 | 沿既有安全文字／Markdown呈現；不使用未清理innerHTML，不把回覆文字當程式或確認指令。 |

## 五、需在實作開始時處理的未決事項

1. **重載後的「曾送出但伺服器暫為pending」**：現有 `confirmWithRecovery()` 能在當次畫面維持unknown，但 `memoryKey()` 目前只儲存conversation ID，不能證明刷新後仍記得送出不確定性。E06提案以最小恢復記錄補足一般瀏覽器情境；若環境完全禁止持久化，現有API僅回pending不足以證明從未送達。本提案對可偵測的記錄寫入失敗採送出前停止；對儲存遭清除或跨裝置仍須列明限制或提出另行審核的契約方案，不能為通過驗收擅增後端欄位／狀態，也不能宣稱已支援。
2. **原規格字級／操作尺寸與後續桌面覆寫不同**：三語規格曾要求主要文字16px／按鈕48px，桌面改版在 `desktop.css` 覆寫多處為14px／36px。本輪提案明訂主要對話、欄位與核對內容16px，次要資訊14px；桌面主要操作與輸入區至少40px高，窄畫面至少44px高，長文案可自然增高。這是以桌面為主、兼顧窄畫面的設計取捨，須實際驗證三語、200%縮放與鍵盤；實作時同步更新尺寸規格，不能默認舊文件皆已滿足。
3. **原MES規則與新閘道規則不可混為一談**：inventory中有歷史舊API缺口及後續補證。本輪以現有domain／adapter與核准規格為操作契約；發現疑似業務Bug先列出與最小重現，不因UX重構擅自改變零穴、完工、補登時間或已報工資料可否修改等規則。
4. **驗收能力與權限分開**：沒有有效模型預算／隔離SQL環境時，仍可做靜態、元件、HTTP替身與瀏覽器驗收，但報告須列出未跑項目；不能模擬結果後稱正式功能完成。
5. **MES時區預設值待核對**：`app/main.py:business_clock()` 在環境未設定時預設 `7`，`app/mes.py:MesConfig/from_env()` 則預設 `8`。這是原始碼可見的不同預設，不能推定部署一定有錯；須先核對實際環境設定。UX顯示採既有API提供的business timezone／date，不能逕改成瀏覽器時區或在本輪悄悄統一後端預設。

## 六、完成定義

- E01–E09各自有可審查更動與對應矩陣結果；報工MVP的正常、修改、取消、未知與恢復路徑均實際操作過。
- 三模組既有動作與九頁入口不退化；語言、主題、鍵盤與指定桌面尺寸保留。
- 無新套件、DB schema、後端執行器重寫或magic action；API payload及交易邊界維持。
- 每項驗收標示通過／失敗／未執行及理由，分開模擬、HTTP替身、真實模型、隔離SQL、正式唯讀證據。
- PR說明能清楚回答問題、變更後使用者行為、測試及剩餘風險。只有後續實作經驗收，才考慮關閉實作Issue；本文件不宣稱功能已交付。

## 固定版本來源

[S-AGENTS]: https://github.com/WeYuTech/KaosuAiAgentTest/blob/71506e727a0844b878637c03d3b4988a163f785c/AGENTS.md
[S-MAIN]: https://github.com/WeYuTech/KaosuAiAgentTest/blob/71506e727a0844b878637c03d3b4988a163f785c/app/main.py
[S-GUIDE]: https://github.com/WeYuTech/KaosuAiAgentTest/blob/71506e727a0844b878637c03d3b4988a163f785c/app/guide.py
[S-API]: https://github.com/WeYuTech/KaosuAiAgentTest/blob/71506e727a0844b878637c03d3b4988a163f785c/frontend/src/api.ts
[S-UI]: https://github.com/WeYuTech/KaosuAiAgentTest/blob/71506e727a0844b878637c03d3b4988a163f785c/frontend/src/main.tsx
[S-CONFIRM]: https://github.com/WeYuTech/KaosuAiAgentTest/blob/71506e727a0844b878637c03d3b4988a163f785c/frontend/src/confirmation.ts
[S-STORE]: https://github.com/WeYuTech/KaosuAiAgentTest/blob/71506e727a0844b878637c03d3b4988a163f785c/app/store.py
[S-MES]: https://github.com/WeYuTech/KaosuAiAgentTest/blob/71506e727a0844b878637c03d3b4988a163f785c/app/mes.py
[S-SCHEDULE]: https://github.com/WeYuTech/KaosuAiAgentTest/blob/71506e727a0844b878637c03d3b4988a163f785c/app/mes_schedule.py
[S-DOMAIN]: https://github.com/WeYuTech/KaosuAiAgentTest/blob/71506e727a0844b878637c03d3b4988a163f785c/app/domain.py
[S-RECORDS]: https://github.com/WeYuTech/KaosuAiAgentTest/blob/71506e727a0844b878637c03d3b4988a163f785c/frontend/src/guided-records.ts
[S-SUMMARY]: https://github.com/WeYuTech/KaosuAiAgentTest/blob/71506e727a0844b878637c03d3b4988a163f785c/frontend/src/ProposalBusinessSummary.tsx
[S-DESKTOP]: https://github.com/WeYuTech/KaosuAiAgentTest/blob/71506e727a0844b878637c03d3b4988a163f785c/docs/桌面對話作業單規格.md
[S-LOCALE]: https://github.com/WeYuTech/KaosuAiAgentTest/blob/71506e727a0844b878637c03d3b4988a163f785c/docs/三語步驟引導規格.md
[S-REPORT-INVENTORY]: https://github.com/WeYuTech/KaosuAiAgentTest/blob/71506e727a0844b878637c03d3b4988a163f785c/docs/inventory/report.md
[S-SCHEDULE-INVENTORY]: https://github.com/WeYuTech/KaosuAiAgentTest/blob/71506e727a0844b878637c03d3b4988a163f785c/docs/inventory/schedule.md
[S-MOLD-INVENTORY]: https://github.com/WeYuTech/KaosuAiAgentTest/blob/71506e727a0844b878637c03d3b4988a163f785c/docs/inventory/mold.md
