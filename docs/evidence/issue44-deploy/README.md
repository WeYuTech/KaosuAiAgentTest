# Issue #44 正式部署嘗試：失敗，已回復

日期：2026-11-03。依使用者明確授權部署 main `5fd733f`（PR #45 合併提交）。**新版未上線，正式 MES 助理目前已恢復部署前版本並正常運作。** 遇到失敗後沒有重新部署，也沒有送出正式模型訊息。

## 發行與備份

- 發行包：`kaosu-issue44-5fd733f-20261103.zip`，154 檔。
- ZIP SHA256：`91155cb7b49b55c7dd6f2355c4e094db5825c379b3f4714b847eacbe749fe1e5`。
- 發行暫存：`C:\Services\KaosuAiAgent\staging\kaosu-issue44-5fd733f-20261103`。ZIP 及全部 154 檔來源校驗通過。
- 部署前完整備份：`C:\Services\KaosuAiAgent\backups\code-before-kaosu-issue44-5fd733f-20261103`，`full-current` 共 195 檔，包含當時 `.env`、`.local`、對話、稽核與費用資料；另有 `private` 備份。目錄限制 SYSTEM／Administrators 存取。
- 備份建立 UTC：`2026-11-03T01:38:19.5242464Z`；`deployment.json` 保存來源版本、154 檔雜湊與 existed 狀態、舊 ARR 值及回復說明。
- IIS 完整備份名稱：`KaosuAiAgent-issue44-20261103`；代理原檔另存 `proxy-web.config`。

前置驗證：前端 168 通過，後端 275 通過／11 略過，型別與建置完成。Vite 保留既有大 chunk 提示；PowerShell 將其 stderr 包裝為 NativeCommandError，但建置日誌明確顯示完成且產物已生成。未把這個警告當作原子替換失敗的原因。

## IIS 唯讀盤點

[完整盤點](IIS代理盤點.json)：Default Web Site 共 16 個應用，掃描 16 份 web.config 與全域／應用有效 Rewrite 規則。只有 `/KSS_MES/ai-agent` 使用 ARR，目標 `http://127.0.0.1:8765/{R:1}`；清單中第二條為同一規則的實體檔，並非另一應用。

| 設定 | 部署前／回復後 |
|---|---|
| responseBufferLimit | 4096 |
| minResponseBuffer | 256 |
| bufferChunkedResponses | True |
| preserveHostHeader | True |
| timeout | 00:05:00 |

依授權原可將 responseBufferLimit 設為 0、僅在助理代理 web.config 停用動態壓縮；但程式更新在執行這些變更之前失敗，最終沒有留下 IIS 設定異動。回復時仍核對舊值與代理檔雜湊一致。沒有重啟 MES、IIS 網站或整台 IIS。

## 失敗及回復

僅停止 `KaosuAiAgent` 專屬排程工作後，完成停機備份，再複製非入口檔案與新雜湊資產。HTML 最後使用 `.NET File.Replace($tmp,$target,$null)` 原子替換時，正式主機 Windows PowerShell 回報 `The path is not of a legal form`。空備份參數在此呼叫環境不相容；自動回復使用同一寫法，也在 HTML 處失敗，當時助理尚未啟動。

立即停止部署流程，將**回復指令**改用明確的完整備份檔路徑，原子還原 HTML 成功；還原原 SHA256SUMS、代理設定及 ARR 舊值，啟動原助理。沒有修改產品程式，也沒有嘗試再次部署新版。後續部署腳本應先修正並在相同 Windows PowerShell 環境驗證三參數原子替換，再另外安排部署。

[回復核對](回復核對.json) 顯示：

- 124 個原有發行檔逐檔與備份一致，原發行清單一致。
- `.env`、`operations.db`、`model-budget.db` 更新前與回復後 SHA256 均相同；未使用備份庫覆蓋現行資料。
- 原代理 web.config 雜湊相同，responseBufferLimit 恢復／保持 4096。
- LOCAL SERVICE 的專屬工作 Running，監聽 127.0.0.1:8765，健康 `ok/live`。
- [後續清理](回復清理.json)：移除本次新增的 27 個非資產檔；清除失敗替換留下的暫存 HTML。保留原資產與本次新增的 3 個雜湊資產，不會被原版 HTML 引用。

部署前與回復後：聊天 20、取消卡 7、稽核 7；進行中訊息 0。正式帳本維持 246 次、已結算 US$2.102904、未結算／unknown 0。本次模型呼叫 0，沒有合併或重設本機與正式帳本。

## 回復後公開驗證

[公開入口核對](公開入口核對.json) 是**原版本回復證據，不是新版驗收**：

| 項目 | 結果 |
|---|---|
| 原發行 17 個公開資產 | 全部 HTTP 200，SHA256 與部署前清單吻合 |
| 九頁入口 | 全部 HTTP 200，loader 各 1 份；沒有重裝入口，歷史備份保留 |
| 未登入 session | 401 |
| `.env`、兩個 SQLite 路徑、`app/main.py` | 全部 404 |
| 健康檢查 | ok/live；最新核對時間 `2026-11-03T08:41:13.889176+07:00` |

未執行可信登入後的正式模型查詢、SSE delta／時間／步驟量測或正式瀏覽器截圖：部署失敗後依指示停止，不以隔離畫面冒充。新版 ARR 串流是否逐步抵達仍未驗證。

## 回復方式與後續界線

此次已成功執行 `C:\Services\KaosuAiAgent\rollback-issue44.ps1`。腳本根據上述 `deployment.json` 還原 existed=true 的檔案及原發行清單，使用明確 `displaced-index.html` 備份路徑原子替換入口；只回復該 ARR 屬性及助理代理檔，不還原整台 IIS 備份。

目前已是原版本，不需再次執行回復。未來如再使用此備份，先核對當時正式服務與檔案異動，停止助理專屬工作；不得用舊 `.env` 或 `.local` 覆蓋後續設定、聊天與費用。備份內既有 displaced 檔案也需選擇新的唯一名稱，避免覆蓋回復證據。

本文件 PR 僅記錄部署失敗、回復及證據，不重試、不直接推 main，也不宣稱 PR #45 已正式部署。
