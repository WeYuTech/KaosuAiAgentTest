# WeYu-MesAiAgent UI 對齊與 Codex 指令

日期：2026-10-31。目標審查基準：Kaosu main `3e1c7c002177f4bb16255cf3d26b840b82d7b4c7`；執行時重新取得目標最新 main。

**本輪 PR 只更新任務規格，正式 app 未改。以下是交給 Codex 的下一個實作 PR 指令。**

請直接在 `WeYuTech/KaosuAiAgentTest` 最新 `main` 上完成正式 React UI 實作、驗證與可審查 PR。交付必須修改現有應用並能以原命令啟動；不要再交另一份 HTML demo、設計稿或只換色的外部展示頁。

交接入口：[PR #16](https://github.com/WeYuTech/KaosuAiAgentTest/pull/16)／[Issue #13](https://github.com/WeYuTech/KaosuAiAgentTest/issues/13)；流程來源：[PR #14](https://github.com/WeYuTech/KaosuAiAgentTest/pull/14)。

正式畫面完成條件見 [修訂的視覺改版與畫面驗收](視覺改版與畫面驗收-20261031.md)，已知缺陷與優先順序見 [MAIN UX 複驗與改進清單](MAIN-UX複驗與改進清單-20261031.md)。規格若尚未合併，從 PR #16 最新 head 讀取，不假定 main 已有這些檔案。

## 1. 基準與優先順序

- 先讀目標 `AGENTS.md`，取得最新 main、記錄 commit，再建立實作分支；不假定舊驗收版本仍最新，不覆蓋未提交工作。閱讀目標專案的 `CONTEXT.md` 與相關既有契約；參考 repo 僅提供外觀依據。
- 外觀來源是使用者指定 root URL 對應的 **`WeYuTech/WeYu-MesAiAgent` 預設 main**，固定參考 commit：`4503d1211be0d648ae50a34556d4848e58456c2c`。
- `Emerald@c0394652` 是另一套 React／assistant-ui 實作，來源沒有宣告 main 廢止。本輪不得自行改採 Emerald，也不搬入 assistant-ui。
- **外觀以來源 main 為最高基準；業務、安全與流程維持 Kaosu 的契約。** 保留 PR #14 UX、PR #16 R01–R06 的要求。先前 R07 的 graphite 色票、頂部112px、880–960px內容軸、固定三卡等只是前案，不能拿來蓋過這次來源。必要的功能／三語適配差異請明列原因。

來源資料夾（以下簡稱 `REF/`）：

`outputs/wwwroot-mes-ai-copilot-folder-v2/wwwroot/mes-ai-copilot/`

先讀 `README.md`、`chat.js`、`chat.css`、`src/tailwind.input.css`、`package.json`，並核對同 commit 的 `tailwind.config.cjs`、`loader.js`、`tailwind.css`。README／loader證明先掛 `chat.css` 再掛編譯樣式；**以最終覆寫結果對齊，不能只看底層CSS**。

## 2. 要移植的呈現

已核實來源最終色值：navy700 `#171d63`、yellow `#ffce00`、mes-soft `#f7f8fa`（覆寫底層的 `#f6f7f8`），白色卡片；panel陰影為 `0 28px 80px rgba(15,23,42,.24)`。請對齊外框、標題、訊息、輸入與附屬面板，不另設計dashboard。

1. **外框與頂部：**浮動卡最終寬 `min(520px,100vw−48px)`、高 `min(760px,100dvh−48px)`、圓角24px、桌面header最小82px，不採底層488／720px。對齊正式Logo、標題／身分、徽章及工具群比例；保留Kaosu展開與MES嵌入，展開後延續來源樣式，不裁切業務內容。
2. **起始與對話：**白色歡迎卡、單欄圓角建議按鈕、淺灰訊息區；助理有 navy 小標記與白色內容卡，使用者為靠右的淡色氣泡。對齊間距、字重、邊線與hover／選中；文案保留排程／報工／上下模，不照搬「每題獨立、不帶上一題」規則。
3. **輸入：**白底composer、圓角文字框、48px黃色送出與快捷鍵提示；警告樣式可移植，業務確認文案保持Kaosu語意。
4. **資料與附屬內容：**表格容器、細分隔、摺疊依據、次級標題、歷史列表及狀態 badge 對齊來源。摘要／資料／操作紀錄保留自身語意；來源問答歷史不可冒充操作稽核，不為外觀新增統計API。
5. **窄畫面：**遵照來源640／600／420px附近的收合規則、safe-area、工具文字收合及表格內部捲動；兼容 Kaosu 長工單、確認卡與三語。手機頁面不得整體橫溢；不能照抄來源小字而使必要內容無法閱讀。

實作時維持主要作業／核對內容的可讀尺度；來源較小的輔助字級若與既有可讀性要求衝突，列為適配差異，不縮小必要資訊來追求像素一致。

來源這套樣式只有淺色設計，**沒有可直接沿用的dark主題**。先對齊繁中淺色，再沿用Kaosu的 `theme.ts`、tokens、三語及宿主偏好延伸深色／system。保留英文、泰文與light／dark／system，不另建locale／theme state。

## 3. 來源檔與目標檔對應

目標路徑以 `frontend/src/` 為根；若最新 main 已搬檔，先查實際 import 後更新對照。

| 來源 | 目標 | 實作範圍 |
|---|---|---|
| `REF/chat.js` 的外框、header、welcome、messages、composer markup | `main.tsx`、現有 Brand／呈現元件 | 重排JSX，保留handler、refs、唯一標題ID；不移植IIFE／innerHTML runtime。 |
| `REF/chat.css`＋`REF/src/tailwind.input.css` | `emerald-design-tokens.css`、`styles.css`、`desktop.css`、`conversation.css` | 轉為現有作用域CSS／tokens，核對載入順序與specificity，移除過時覆寫。 |
| 來源 launcher／浮窗／safe-area 樣式 | `frontend/public/widget-loader.js`（此列為 repo 根路徑）、standalone 外框樣式 | 同步宿主 Shadow DOM／iframe 外框與 React 內部的尺寸及品牌；保留原同源／source 驗證、open／close／expand／restore，不移植來源 loader。 |
| 來源歡迎／建議／卡片／選中樣式 | `GuidedFlow.tsx`、`guided.css`、相關表單 | 接到既有步驟與候選，外觀一致；同一 conversation 仍只有一份 Guide，不因重排或開面板重新掛載。 |
| 來源訊息、Markdown、表格與摺疊依據 | `MessageContent.tsx`、現有資料呈現 | 保留現有安全 Markdown／文字處理，只調排版；不換成來源手寫 parser。 |
| 來源卡片、badge、細節／動作區 | `ProposalBusinessSummary.tsx`、`main.tsx` 確認卡 | 業務內容保持完整，技術明細可收合；只有一個有效確認入口。 |
| 來源 secondary view／history 外觀 | 現有摘要、資料、操作紀錄、回饋元件 | 只移植呈現，不改成來源問答資料或新增不存在的統計功能。 |
| `REF/README.md`、`REF/package.json` | 目標 README／驗收說明；既有建置方式 | 理解來源Tailwind3.4.19即可；用既有CSS實作，不移植建置鏈、不新增依賴或改lockfile。 |

## 4. 不可移植與不可退化的行為

**只移植呈現與 style，不複製來源服務契約。** 不搬來源私有 API 位址、`/api/chat*`、SSE fallback、`ADMINV2`限定、localStorage Token 身分判定、每題獨立的查詢限定、資料庫、loader 或部署 runtime；不修改目標後端、DB schema、模型路由或權限，只為讓畫面像來源。來源「關閉即 abort」也不能被解讀成 Kaosu 業務已取消。

- 三模組及現有九頁 MES 入口保留。操作仍依可信 session、角色、目標及後端卡控；模具四階段／`NEXT_ACTION`、報工修改刪除／改模穴／完工、排程明細不得被刪成唯讀聊天。
- 保留單一 Guide／單一草稿、保存順序、最新回應隔離、既有 version／revision／state_digest／proposal.digest 的不同用途；只改排版不能改 API payload 或重設流程。改目標後以後端 args 為準，不能帶回舊數量。
- 確認卡的對象、影響、期限、writes gate、獨立同意及實際 changes 必須可讀。返回修改使舊卡失效；取消走既有契約；不要複製一顆缺少 disabled／提交鎖的確認鍵。關閉、翻語言或展開摘要不等於確認／取消。
- unknown 保留原 pid，只查核，不自動重送、不換 pid 重試。明確4xx與送達未知分開；跨分頁阻擋後能回到原操作。摘要不得另有表單、存檔或確認來源。
- 核對 R01–R06：無模型且已有文字仍能人工起步；登入失效清掉前人資料並隔離晚到回覆；4xx後驗證GET失敗可恢復；跨分頁可查原操作；摘要有缺項／階段／定位；首次需求正確接續一次。最新 main 已修的要回歸，尚未修的明列，不用隱藏面板掩蓋。
- 三語、IME、Enter／Shift+Enter、鍵盤焦點、Esc收合、宿主 origin/source 檢查、system偏好保持。模具時間由 MES／伺服器記錄，不加人工補登。安全訊息呈現不因視覺移植降級。

## 5. 必須提供的畫面與功能證據

before／after須同資料、視窗、100%縮放、主題與語言，記錄來源及目標前後commit、狀態。禁止跨主題比較或裁切縮放掩蓋比例。

| 比較組 | 必留畫面 |
|---|---|
| 1366×768、繁中、淺色 | 來源＋Kaosu before／after：浮動入口、起始、對話／表格／摺疊。比顏色、圓角、陰影、字級、間距、header及composer。 |
| 同尺寸／主題的業務主線 | Kaosu before／after：報工100／缺料2、改120後核對、摘要開啟。來源沒有業務確認卡，說明卡片適配，不偽造來源畫面。 |
| 1920×1080、繁中、淺色 | Kaosu展開作業與操作紀錄 before／after；來源對應歷史列表供呈現參考，明列資料語意不同。 |
| 390×844、繁中、淺色 | 來源及Kaosu起始；Kaosu確認卡、面板開關before／after。內容可捲到、焦點可返回、全頁不橫溢。 |
| Kaosu擴充能力 | 1366×768深色的核對卡、390×844泰文深色的面板 before／after；另記英文長文、system跟隨及200%縮放結果。來源無dark，不製造「來源深色」比較圖。 |

來源無可用部署時，可用固定樣式及合成資料的隔離fixture取圖，明標替身，不連正式服務或繞過權限；fixture不代替正式實作。截圖勿含真實個資、Token或連線資訊。

跑原有測試／建置並記錄結果；隔離資料驗證三模組主線及：選對象／改目標、保存中／失敗／409衝突、欄位錯誤、返回修改、取消、獨立確認、成功但清單刷新失敗、明確4xx、unknown讀回pending、查核成功、雙擊、刷新、多分頁、登入失效、晚到回覆、無模型人工路徑。交易／恢復須記請求數、pid與結果；未執行須說明，截圖／mock不當正式MES或真實模型證據。

## 6. 完成定義與 PR

- 更動進正式React應用，原命令能啟動；同條件截圖可辨認來源main設計，不以獨立demo代替。
- PR列來源→目標元件、最終CSS值、適配差異及舊覆寫清理；深色／三語標明為Kaosu擴充。
- PR #14與R01–R06不降級，單Guide／單確認／unknown不重送成立；附比較圖、命令結果、回歸清單及剩餘問題。結果分通過／失敗／未執行，不宣稱未做的WCAG或正式交易驗收。
- 使用繁中commit／PR，引用Issue #13及相關PR，不因外觀合併關閉未完成的整體需求；不自動合併或部署。UI 與 R01–R06 可拆成可審查的相關 PR，未修的項目保持追蹤，不用本輪 UI 結果宣稱全部功能已修。

來源：[固定main](https://github.com/WeYuTech/WeYu-MesAiAgent/tree/4503d1211be0d648ae50a34556d4848e58456c2c/outputs/wwwroot-mes-ai-copilot-folder-v2/wwwroot/mes-ai-copilot)。實作前重新確認目標最新main，但不要擅自切換本指令的視覺基準分支。


## 固定來源檔案

以下均為同一來源 main commit，避免只讀 README 或只讀 base CSS 而採用錯誤尺寸：

- [前端 README](https://github.com/WeYuTech/WeYu-MesAiAgent/blob/4503d1211be0d648ae50a34556d4848e58456c2c/outputs/wwwroot-mes-ai-copilot-folder-v2/wwwroot/mes-ai-copilot/README.md)
- [chat.js：實際標頭、訊息與輸入結構](https://github.com/WeYuTech/WeYu-MesAiAgent/blob/4503d1211be0d648ae50a34556d4848e58456c2c/outputs/wwwroot-mes-ai-copilot-folder-v2/wwwroot/mes-ai-copilot/chat.js)
- [chat.css：基礎配置及互動狀態](https://github.com/WeYuTech/WeYu-MesAiAgent/blob/4503d1211be0d648ae50a34556d4848e58456c2c/outputs/wwwroot-mes-ai-copilot-folder-v2/wwwroot/mes-ai-copilot/chat.css)
- [Tailwind 視覺原始檔](https://github.com/WeYuTech/WeYu-MesAiAgent/blob/4503d1211be0d648ae50a34556d4848e58456c2c/outputs/wwwroot-mes-ai-copilot-folder-v2/wwwroot/mes-ai-copilot/src/tailwind.input.css)
- [色票、字體與陰影定義](https://github.com/WeYuTech/WeYu-MesAiAgent/blob/4503d1211be0d648ae50a34556d4848e58456c2c/outputs/wwwroot-mes-ai-copilot-folder-v2/wwwroot/mes-ai-copilot/tailwind.config.cjs)
- [實際編譯 CSS](https://github.com/WeYuTech/WeYu-MesAiAgent/blob/4503d1211be0d648ae50a34556d4848e58456c2c/outputs/wwwroot-mes-ai-copilot-folder-v2/wwwroot/mes-ai-copilot/tailwind.css)
- [loader：樣式載入順序](https://github.com/WeYuTech/WeYu-MesAiAgent/blob/4503d1211be0d648ae50a34556d4848e58456c2c/outputs/wwwroot-mes-ai-copilot-folder-v2/wwwroot/mes-ai-copilot/loader.js)
