# PR #30 UI／UX 覆蓋盤點

盤點 SHA：`43fab233567813ccae6931b76a05687d27048fc0`。來源為目前程式、PR 文字及 repo 內驗收紀錄；本檔不宣稱在正式 MES 逐畫面實測。表格是 reference gallery 與後續產品驗收的完整範圍，不代表每個現有畫面都有缺陷。固定來源前綴：`https://github.com/WeYuTech/KaosuAiAgentTest/blob/43fab233567813ccae6931b76a05687d27048fc0/`。

## 確認的入口問題與交付狀態

1. **目前已能直接送訊息。** `frontend/src/main.tsx#L519-L524` 呼叫 `entry.send`，不是早期只移動焦點。不能再把舊缺陷當目前事實。
2. **中立回合沒有轉為真正聊天畫面。** `main.tsx#L677-L681` 在首頁組合 welcome heading、原始 `entry-transcript` `<article><p>`、composer 及三個固定捷徑；只有有 module + conversation_id 的回執才在 L524 進工作聊天。能力說明、模糊意圖、unsupported 回合持續停在空首頁版型。這直接說明最新截圖為何看起來像在首頁插入兩行文字。
3. **「測試」被硬導去三模組文案有原碼對應。** `app/entry.py#L124-L132` 對 unsupported 固定回「目前支援排程、報工與模具上下模。請選擇其中一項作業。」對無模組固定回「請選擇你要處理的作業」。`app/intents.py#L16-L27` 分類器與 `main.tsx#L681` 手選交接是既有規則。新規格可要求中立聊天呈現與較自然短文案，但不可用畫面截圖推論模型每次一定錯判，也不可在前端用關鍵字假扮真 AI。
4. **明確剩餘 UX 驗收缺口。** [PR #30](https://github.com/WeYuTech/KaosuAiAgentTest/pull/30) 及 `docs/evidence/issue29/G3-部分驗收.md` 明列 200% 瀏覽器縮放、iframe 完整互動、reduced-motion 實操、完整轉場錄影未完成；另行部署 `62d6c07` 不等於完成 G3。
5. **其他需要驗證的源碼風險。** `GuidedFlow.tsx#L414-L418` 空集合訊息／分頁沒有 ready-only 條件，`#L436` busy 另列於下方；應實際慢速網路驗證 loading 是否同時顯示「沒有符合資料」或空 1 頁，不要僅看程式即宣稱正式重現。`main.tsx#L703-L707`、`#L719`、`GuidedFlow#L436` 各有狀態提示，需實測同一請求是否重複宣布。

## 全面 reference gallery 範圍

狀態共用元件可以共用，但每個具體頁面都須有映射、可開啟的代表範例及產品證據。必須區分：初次載入、保留舊結果重新整理、空資料、查詢失敗、無權限、操作中、確認中、訊息未知、業務結果未知。

| ID | 現行 surface | 必要畫面／操作狀態 | 原碼定位 |
|---|---|---|---|
| S01 | 空首頁與 composer | 空白、輸入、IME、送出、回覆；首頁捷徑只是可選入口，輸入即能送出 | `main.tsx#L519-L524`, `#L677-L681` |
| S02 | 中立聊天 | 能力問答、招呼／測試、模糊追問、範圍外說明、可直接續問；第一次送出後採同一聊天結構，移除空首頁大標與固定三列捷徑堆疊 | `app/entry.py#L124-L132`, `main.tsx#L680-L681` |
| S03 | 聊天訊息與回饋 | 使用者／AI、等待、送達未知／被拒、長 Markdown／表格／網址、向上閱讀、新內容提示、重試或查核原訊息、未送文字保留 | `main.tsx#L697-L709`, `chat/message-presentation.ts`, `chat/use-chat-scroll.ts` |
| S04 | 三模組導入與選作業 | 辨識後同對話接續、只補缺欄；每模組查詢與合法 actions；無權限、不明確對象、AI 未設定手動入口 | `main.tsx#L691-L709`, `GuidedFlow.tsx#L128-L141`, `#L403` |
| S05 | 聊天＋作業單 | 未選對象／有部分已知欄、選取、編輯、核對、結果；一份真可編輯作業單，唯一提交入口 | `main.tsx#L697-L718`, `GuidedFlow.tsx#L386-L436` |
| S06 | 分步作業精靈 | 完整步驟列、目前位置、已完成可返、缺項禁止跳過、無欄位略過填寫；同一資料／pending／焦點延續 | `GuidedFlow.tsx#L386-L391`, `operation-mode.ts`, `operation-focus.ts` |
| S07 | 共用大量資料選取 | 搜尋、設備／日期／工單、更多條件、表格或緊湊列、明細、暫選、明確套用、取消、跨頁、查詢中／空／錯／截斷／不合資格 | `GuidedFlow.tsx#L403-L424`, `CandidateSelect.tsx`, `RecordChoices.tsx`, `WorkspaceChoices.tsx` |
| S08 | 選取時詢問 AI | 同一 composer 補問、改查詢條件、文字不丟、取消／返回選取位置；查詢不暗改已套用目標／pending | `main.tsx#L404-L408`, `#L709`, `GuidedFlow.tsx#L403` |
| S09 | 單筆人工報工次層 | execution → report；「返回工單」回父候選、「取消選取」回本次作業；無 report 的空態 | `GuidedFlow.tsx#L419-L422` |
| S10 | 報工編輯及各操作 | 新增／修改良品、無不良與未回答區別、多原因列與總量、備註；刪單筆、改模穴、整張排程完工各自核對 | `GuidedFlow.tsx#L365-L381`, `ProposalBusinessSummary.tsx#L53-L65`, `#L77-L81` |
| S11 | 排程編輯 | 新增／修改；設備→品號→模具相依、模具明細／多工單／0穴、時程週期模次、進階狀態優先序備註、合法驗證 | `GuidedFlow.tsx#L333-L364` |
| S12 | 模具操作 | 開始／完成上模、開始／完成下模、清除；廠別與範圍條件、當前狀態與下一階段、server preview 時間／工單影響 | `GuidedFlow.tsx#L137-L141`, `#L410-L411`, `ProposalBusinessSummary.tsx#L66-L81` |
| S13 | 草稿狀態與驗證 | 保存中、已保存、未同步、保存失敗、衝突比對、採伺服器或核對後重套、欄位錯誤及缺項焦點 | `GuidedFlow.tsx#L67-L83`, `#L393-L401` |
| S14 | MES 核對與結果 | 一個標題／目標／真實原新值／影響、期限、獨立確認、取消；成功／拒絕／過期／superseded／unknown 查核、正式寫入未啟用 | `main.tsx#L709-L718`, `ProposalBusinessSummary.tsx` |
| S15 | 跨頁與原作業恢復 | 原 pending／unknown 阻擋新寫入，恢復原作業與僅讀原結果兩條路、保留本頁、原句不自動重送 | `main.tsx#L693-L695`, `use-entry.ts` |
| S16 | 平面側欄 | 已釘選／近期固定文字、單行長標題、行選單、loading／empty／error、分頁真的需要才顯示、底部真實用量 | `ConversationHistory.tsx#L77-L109` |
| S17 | 側欄收合與拖曳 | 正常／收合／還原、拖曳 min/default/max、鍵盤調整、窄版抽屜、同頁焦點與偏好；內分隔與外浮窗 resize 分開 | `main.tsx#L672-L675`, `SidebarSplitter.tsx`, `FloatingResize.tsx` |
| S18 | 搜尋聊天 | 空 query 近期、搜尋中、結果／無結果／錯誤、分頁、選取中、locked 提示、IME、關閉清 query 與返回焦點 | `HistorySearchDialog.tsx#L40-L60` |
| S19 | 封存／已刪除管理 | 全域更多入口、返回聊天、空／列表、封存唯讀、取消封存、還原刪除；不要再用側欄下拉範圍 | `HeaderMenu.tsx#L23`, `ConversationHistory.tsx#L79-L96`, `main.tsx#L691` |
| S20 | 聊天名稱與刪除彈窗 | 短標題、對象、必要影響一句、取消與動詞主鈕；長名稱、IME／空白阻擋、saving、409 conflict | `ConversationHistory.tsx#L111-L117` |
| S21 | 全域更多／外觀／語言 | 低頻分組、短高度可捲、五外觀選項、三語、選單在容器邊緣與對話框內、切換忙碌延後 | `HeaderMenu.tsx#L18-L30` |
| S22 | 介面設定 | 聊天＋作業單／分步作業精靈二選一、說明一句、選擇後可見套用、busy／IME 延後提示、返回同一欄位或階段 | `InterfaceSettings.tsx#L6-L13`, `main.tsx#L648-L652`, `#L721` |
| S23 | API／Agent／額度設定 | 表單／只讀權限、設定載入／失敗、只列實改值核對、保存中／成功／版本衝突；後端控制可選模型與範圍 | `ManagementPanel.tsx#L44-L52`, `app/management.py#L44-L80` |
| S24 | 定時報告建立與清單 | 快填選用、手填、解析中／錯誤、核對／建立中、空清單／載入錯誤、已有排程查看、暫停／恢復／刪除確認 | `ManagementPanel.tsx#L53-L57`, `app/reports.py#L126-L166` |
| S25 | 定時報告執行結果 | 執行清單→詳情→返回；running/completed/failed/missed/interrupted、尚無結果、完成但無資料、超限失敗都清楚 | `ManagementPanel.tsx#L53`, `app/reports.py#L75-L96` |
| S26 | 作業資料與操作稽核 | 查詢條件、只讀結果／詳情、帶入目前作業、人工與 IoT 分離、IoT unknown、稽核差異可讀；錯誤不當空 | `main.tsx#L719`, `DataView.tsx#L7-L40` |
| S27 | 使用統計與額度 | 本人可見聊天／操作統計與整體累計模型費用分區；loading／失敗、near_limit／reached／unknown reserved | `main.tsx#L727`, `BudgetSummary.tsx#L3-L4` |
| S28 | 連線／身分／權限／AI 不可用 | 檢查連線、可信登入逾時、重新核對、模擬身分僅測試、無模組權限、模型未設定仍可人工操作；資訊不洩漏 | `main.tsx#L671`, `#L682-L687`, `#L709` |
| S29 | 全域共用彈窗／異常 | Dialog、Select、Dropdown、Tooltip 焦點和邊界；lazy chunk 載入失敗能關閉保留原作業；所有狀態短 copy | `OperationDialog.tsx`, `PanelLoadBoundary.tsx#L7-L14`, `components/ui/` |
| S30 | MES 外殼／浮窗／嵌入 | launcher、開關、放大還原、iframe、9宿主context、內外resize、窄版／軟鍵盤、copyright與主操作不擁擠 | `main.tsx#L657-L674`, `#L724`, `FloatingResize.tsx` |

## 休眠／非當前路徑

- 問題回報與主管審核：`main.tsx#L722`／`FeedbackReview.tsx#L28-L47` 有元件，唯一入口 `main.tsx#L723` footer 為 `hidden`。舊 #23 U23 也明列休眠。本輪可作備用共用樣例，但不得寫成「既有使用者可見頁已全面實測」或默默恢復新功能。
- `DraftForm.tsx`、`MessageContent.tsx` 不屬目前 main 掛載路徑。不要花時間美化未使用舊 renderer。
- 管理 audit API 不代表目前有獨立設定稽核 UI。既有工作區「紀錄」應保留，不應憑 API 加新頁。

## 參考優先順序建議

1. 新 Issue 應明示：新凍結 gallery + 場景映射 + 逐項實際視覺／動畫驗收，是當前呈現基準；#29 中仍指向舊兩張單案例 Demo 的規則改為本套完整樣例。不能同時強迫複製兩個互斥版面。
2. 使用者已定案的兩模式、預設聊天＋作業單、所有登入者可從設定切換、平面側欄、拖曳保留；#27 的業務／狀態／版本／權限／費用保護不變。
3. #29 G1/G2/G3 不應自動清空重做，也不能沿用其「通過」直接宣稱新外觀已過。保留功能證據；新 UI／新動畫按新 gallery 重驗代表狀態；原 G3 未完成要補完。
4. #23 的舊 U 編號和新 Issue 場景 ID 分開命名，避免 U01 混淆。#25 平面側欄仍有效；不恢復範圍下拉或今天/昨天分組。
5. 新 Issue 應固定引用 PR30 SHA，要求實作時核對新 head；不能從 main 回退未合併修正。
6. 「已部署」「單元測試通過」「reference prototype QA 通過」「產品視覺實操通過」分開列；若無可操作產品頁，必須列 blocked/未測，不能用 demo 的動態效果當產品已修證據。

## 驗收需保留的產品證據

- 每個 S ID 對到 gallery scene ID、產品路徑、fixture、SHA、viewport+DPR、工作區、locale+theme、畫面、動態片段與判定。
- 至少從空首頁直接送出「你能幫我做什麼」「測試」「MC37 今天產量」「幫 MC37 報工」，確認各自是能力答覆／中立答覆／唯讀查詢／建立作業；捷徑非強制步驟。
- 所有網路等待狀態分別觸發真慢速回應，檢查 spinner computed animation + 兩時點 transform；reduced-motion 用清楚靜態狀態，不拿意圖停動畫視為 bug。轉場需錄正常速度影片，不能拿截圖串接替代。
- 業務 unknown 僅查核原操作，訊息 unknown 查核原訊息；不展示「重試提交」暗造重複寫入。
- 1366×768／1920×1080／768×1024／390／320，至少三語風險配對、5外觀、200% 真瀏覽器縮放、窄容器／iframe、觸控與鍵盤；有長字／多列／錯誤時依自身容器重排。
- 截圖逐張實際查看：文字層級、間距、對齊、密度、主要動作、焦點、遮擋、返回、空態。以「build過、overflow false、測試數量」都不足以完成。
