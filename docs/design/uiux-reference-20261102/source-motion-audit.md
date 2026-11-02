# PR #30 載入與動效稽核

稽核版本：`43fab233567813ccae6931b76a05687d27048fc0`。範圍為目前原碼、既有部署紀錄及本機隔離 CSS 瀏覽器重現；**未登入正式 MES、未執行實際產品瀏覽器流程、未驗證部署後完整 PostCSS 產物**。

## 結論

不是完全沒有 spinner CSS。`styles.css` L434–436 有 `.spin { animation: spin 1s linear infinite }`，L888–893 有 keyframes。在隔離 Chrome 中載入該版本原始 CSS 後，正常動態偏好下確實持續旋轉。多個真正的查詢入口卻未接上這個狀態；精靈轉場也留下未被使用的 keyframes。需要統一載入／轉場契約並對正式建置做動態驗收，不應只加另一條 CSS 或用靜態截圖宣稱修好。

## 可確認問題

1. **首頁送出沒接 spinner**：`main.tsx` L680 的 `ConversationComposer` 只收到 `disabled={busy||entry.busy||entry.blocked}`，沒有 `busy`。其內部 `ConversationComposer.tsx` L20–22 只在 `busy` 時改成 `<LoaderCircle className="spin size-4"/>`。首頁 `entry.busy` 只產生一行「正在理解你的需求…」。這個路徑的按鈕會保留箭頭，不會切成 spinner。
2. **作業資料查詢的圈形圖示本來就沒綁動畫**：`GuidedFlow.tsx` L405–412 查詢表單的按鈕是 `<RefreshCw size={18}/>`；沒有 `spin`、沒有依查詢 busy 變更 icon。L436 在整個作業區末尾才補泛用「正在核對資料…」。這與一眼就知道「這次查詢正在進行」不同，文字也不對應正在搜尋、儲存、預覽的實際工作。
3. **精靈轉場有定義但沒使用**：`dual-flow.css` L134 定義 `dual-enter`，整份目前檔案沒有任何 `animation: dual-enter` 指派。L135 的 reduced-motion 規則只移除一個原本已無動畫的 `.guide-phase,.guide-body`。隔離瀏覽器 `.guide-body` 的 `animationName` 為 `none`。
4. **新首頁另做簡陋訊息呈現**：`main.tsx` L680 使用 `<article className="entry-message ${role}"><p>…</p></article>`，`dual-flow.css` L131–133 只規定最大高度、間距及使用者字重。沒有使用現有 `ThreadMessage` 的使用者泡泡、訊息進場、複製和狀態結構。這能解釋附圖中「測試」和系統回覆像普通段落堆在首頁上。它是不同的 UI 呈現路徑，不是圖片壓縮造成。
5. **多數非聊天查詢只有文字**：候選資料、搜尋聊天、報告列表、管理設定等各自實作 busy，沒有一致的 local loading indicator / skeleton / failure recovery 呈現。

## 需要保留的不確定性

- 不能由靜態附圖證明使用者看到的某一個 LoaderCircle 在實際網站為何不動。若使用者指的是既有 chat composer 的 LoaderCircle，而非 Guide 的 RefreshCw，仍須對同一畫面、部署資產雜湊與瀏覽器偏好重現。
- `motion.css` L17–19 和 `styles.css` L895–902 在 `prefers-reduced-motion: reduce` 下明確設 `animation:none!important`。隔離測試也確認此時 spinner 停止。這是尊重使用者降低動態偏好的機制，**不能刪除此設定或將所有停止動畫都判為 bug**；需保有明確文字狀態／aria-busy／結果回饋。
- 本次未發現原始 CSS 的 spin 名稱拼錯、duration=0、normal-mode 全域關閉動畫等證據；未跑完整 Tailwind/PostCSS 建置，因此不能排除部署資產或編譯後 cascade 的其他問題。

## 載入路徑盤點

| 路徑 | 現況 | 建議契約 |
|---|---|---|
| 首頁 AI 理解需求 | `entry.busy` 文字；Composer 沒 busy prop | 沿用同一訊息清單；一個回答位置的進度提示＋按鈕 busy；不得強迫先選模組 |
| 聊天 AI 處理 | `messagePending` 文字，Composer 以 `busy` 顯示 spin | 說明正在查詢／準備作業，避免同時出現兩個等價全域 spinner；保留未知送達結果處理 |
| 建立／讀取作業 | main L687 / L707 使用 LoaderCircle.spin | 共用元件；圖示動作、accessible label 與真實請求生命週期一致 |
| Guide 查詢與換頁 | RefreshCw 靜態，底部泛用文字 | 發起處與資料區可感知；保留現有結果，標明更新中；完成後回到對應結果 |
| Guide 儲存與預覽 | 同上泛用 busy | 分別呈現「儲存中」「核對中」，成功才轉階段；錯誤保留欄位 |
| 選機台／品號／模具／工單 | CandidateSelect L25 僅「查詢中…」 | 載入狀態與空結果分開，固定結果容器避免跳動；本頁換頁／搜尋不清除已承諾草稿 |
| 附屬資料頁 | main L719 `queryBusy` 文字、RefreshCw 靜態 | 刷新與結果區同一狀態；禁止僅依另一個 busy 變數造成按鈕與結果不一致 |
| 歷史聊天清單 | ThreadListSkeleton → Skeleton `animate-pulse` | 正常時可保留 skeleton；reduced-motion 改靜態 skeleton＋狀態，不當空清單 |
| 搜尋聊天 | HistorySearchDialog L54 文字 | 簡短 loading＋實際結果，失敗提供明確重試 |
| 定時報告／管理設定 | ManagementPanel L45 狀態文字；L57 報告 loading 文字 | 解析／保存／取得報告分開，按鈕在原處呈現 busy；不做閃爍整窗 |
| 回饋重新整理 | FeedbackReview L29 靜態 RefreshCw | 正確忙碌提示，不把正在載入誤顯示成空清單 |
| 寫入及結果未知 | 提交依既有確認與查核契約 | 提交中顯示進度；unknown 停止無限 spinner，顯示「結果待核對」與唯讀查核，不盲目重試寫入 |

## 瀏覽器隔離實驗

使用檔案：`check-motion.cjs`、`source-css-fixture.html`、`motion-results.json`。

- 原樣載入 `styles.css`、`dual-flow.css`、`motion.css`（將 motion token import 改成同內容內嵌）；使用官方 Lucide icon 節點。
- 正常模式，兩個樣本相隔 240 ms：`.spin` animation=`spin`, duration=`1s`, iteration=`infinite`, transform 由 `matrix(0.743194,0.669076,-0.669076,0.743194,0,0)` 變成 `matrix(-0.669048,0.743219,-0.743219,-0.669048,0,0)`。
- 同樣時間間隔的 Guide RefreshCw：animation=`none`, duration=`0s`, transform=`none`，前後完全不變。
- `.guide-body`：animation=`none`。
- reduced-motion：上述所有動畫皆 `none`，符合目前 CSS。

## 實作及驗收必要條件

1. 以既有 Lucide＋CSS／React 共用狀態元件處理（不需要為 spinner 額外加入動畫套件）；不能只針對某個頁面的圖示補 class。
2. 以真實 request state 驅動開始／完成／取消／失敗／unknown。不得以固定 timeout 假裝完成；不得讓 spinner 在無請求時一直轉；不能用重建 Guide controller、變換 conversation key 來觸發轉場。
3. 正常模式的 spinner 設線性單圈 800–1000 ms；新訊息／階段短暫 160–220 ms；對話恢復不逐條重播；數字輸入、每個 token 與背景 autosave 不重播整個頁面。側欄拖曳時不加 width transition 延遲。
4. 真實產品建置的 Playwright／人工驗收必須覆蓋首頁首次問句、AI 查詢、Guide 查詢／翻頁／篩選、候選選取器、報告／歷史管理、預覽、送出、查核，每一路徑截取 `getComputedStyle` 與至少兩個不同時間點 transform / `getAnimations().currentTime`，並附正常速度錄影。
5. 分別驗證 no-preference 與 reduce；後者保留相同狀態資訊、不要求旋轉。記錄 `matchMedia('(prefers-reduced-motion: reduce)').matches`，不可偷偷把所有測試強制 reduce 然後跳過動態驗收。
6. 注入慢回應及錯誤，觀察無空白跳動、無錯誤「沒有資料」、無整頁閃爍、無多次送出；慢查詢顯示可理解的狀態，不虛構百分比。
7. 同一提交的產品 build、資產雜湊、viewport、theme、locale、motion setting 全部記錄。截圖不算動畫證據；後端 HTTP 通過不算 UI 驗收。

## 固定來源

- [main.tsx 首頁與 busy](https://github.com/WeYuTech/KaosuAiAgentTest/blob/43fab233567813ccae6931b76a05687d27048fc0/frontend/src/main.tsx#L680)
- [Composer busy icon](https://github.com/WeYuTech/KaosuAiAgentTest/blob/43fab233567813ccae6931b76a05687d27048fc0/frontend/src/ConversationComposer.tsx#L8-L24)
- [Guide query icon](https://github.com/WeYuTech/KaosuAiAgentTest/blob/43fab233567813ccae6931b76a05687d27048fc0/frontend/src/GuidedFlow.tsx#L405-L436)
- [Spin CSS](https://github.com/WeYuTech/KaosuAiAgentTest/blob/43fab233567813ccae6931b76a05687d27048fc0/frontend/src/styles.css#L434-L436)
- [Spin keyframes 與 reduce](https://github.com/WeYuTech/KaosuAiAgentTest/blob/43fab233567813ccae6931b76a05687d27048fc0/frontend/src/styles.css#L888-L902)
- [未使用的 dual-enter／首頁訊息樣式](https://github.com/WeYuTech/KaosuAiAgentTest/blob/43fab233567813ccae6931b76a05687d27048fc0/frontend/src/dual-flow.css#L131-L135)
- [Reduced motion 全域政策](https://github.com/WeYuTech/KaosuAiAgentTest/blob/43fab233567813ccae6931b76a05687d27048fc0/frontend/src/motion.css#L17-L19)
- [部署紀錄：正式瀏覽器未執行、G3 未完成](https://github.com/WeYuTech/KaosuAiAgentTest/blob/43fab233567813ccae6931b76a05687d27048fc0/docs/evidence/issue29-deploy/README.md)
