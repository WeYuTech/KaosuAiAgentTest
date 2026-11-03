# 第四段：儲存送出與系統狀態

依 #54、#58，從 main `5552f4d` 開發於 `codex/uiux-v2-s4`。目前為實作與驗收中，尚未宣告完成。不合併、不部署、不寫入正式 MES。

## 既有流程盤點

| 情境 | 現有來源與限制 | 呈現工作 |
|---|---|---|
| W01–W04 | GuidedFlow 保存佇列、422 欄位驗證、409 衝突、版本核對與重新套用 | 提示置於目標摘要後，保留未儲存內容與核對動作 |
| W05 | proposal.expires_at 與定時 now | 過期提示與重新核對入口 |
| W06 | submitting ref、busy、submitRecoverably | 送出中提示與所有重複入口停用 |
| W07 | ConfirmationResult.changes | 僅呈現可證明異動，不能以 proposal 預期值充當回執 |
| W08 | 明確 4xx 拒絕與 rejected-unverified 恢復標記 | 與未知結果分開，依權威讀回恢復 |
| W09 | unknown、reconcileProposal、原 proposal 識別 | 只能查核，不重送、不改數量開新提交 |
| W10 | writes_enabled 與可信環境 | 只預覽，禁止確認寫入 |
| X01–X03 | session／health、request context 及身分隔離 | 登入、權限、連線狀態畫面 |
| X04 | PanelLoadBoundary／延遲載入管理面板 | 失敗彈窗，保留目前作業 |
| X05 | recoveryTarget、recoverOriginal、跨分頁標記 | 恢復原操作彈窗，保留原識別與查核限制 |

## 驗收規劃

15 情境各拍 1366×768、390×810；幾何 ≤4px、計算樣式、可見文字三項分列。涵蓋提示、按鈕、原因與文字入口，下方元件捲動後再量測。安全流程使用公開 HTTP fixture，記錄 confirm、reconcile 與 Guide 寫入請求次數。範例若與真實卡控衝突，列為未通過等待裁定，不自行修改範例或產品規則。
