# 第三段：作業單、分步精靈與三模組

對應 [#57](https://github.com/WeYuTech/KaosuAiAgentTest/issues/57)，遵循 [#54](https://github.com/WeYuTech/KaosuAiAgentTest/issues/54)。從 main `2dafe9e` 開發於 `codex/uiux-v2-s3`，交付 [Draft PR #64](https://github.com/WeYuTech/KaosuAiAgentTest/pull/64)。未合併、未部署，未呼叫付費模型或寫入正式 MES。

## 驗收證據

最終共 6,582 項計算樣式比對，0 項不一致。15 個情境在兩種尺寸的幾何差均 ≤4px；B09 有 2 個缺少對應元件與 4 個幾何超標量測，仍為未通過。逐情境通過與失敗見下列總覽。

- [32 組比對與逐情境差異比例](比對總覽.md)：左範例、中正式 React／HTTP fixture、右差異疊圖。
- [計算樣式比對](計算樣式比對.md)、[原始幾何與樣式值](量測.json)。不遮罩差異，不改範例內部 CSS；只移除展示選單並固定相同 viewport。
- [正常速度 H.264 MP4](正常速度-fixture.mp4)：報工修改／重新核對、精靈返回、排程分配、模具卡控。字幕明示 fixture／模擬分類，核對回應延遲 2.1 秒，未按提交寫入。
- [影片實際解碼結果](影片播放驗證.json)：無頭 Chromium 播放，確認時間前進、尺寸與錯誤狀態。
- [第三段 28 項實際操作驗收](環境驗收.json)。
- [第二段 30 項回歸](回歸第二段-環境驗收.json)，包含 #44 展開真實步驟、#47 分段輪詢及停止，不以固定文字冒充模型測試。

## 已實作

作業單使用一處目標摘要與更換入口；人工良品帶「件」；不良原因僅顯示名稱，保留原因／數量欄頭、移除、新增、沒有不良品與選填備註。保存狀態及主要按鈕固定在底部，保存失敗或未同步時不顯示已保存。

精靈保留三步驟與 650px 內容上限；核對頁共用同一份 proposal，主要欄位使用刪除線與箭頭。完整執行時間、模具明細名稱、被移除原因、原始欄位異動保留於「查看異動明細」。未知下一排程不冒充「無下一張」。聊天停止圖示改為空心方塊，固定提示不再假設作業單位於右側。

切換主題／語言、返回修改與 iframe 都沿用同一 Guide；沒有新增套件、後端 API 或資料表。仍驗證版本、期限、獨立確認，未知結果不得重送。核對時的側欄限制仍存在，原因保留為讀屏狀態、按鈕描述及提示；不讓額外提示擠高用量列。

## 尚未通過：B09 與既有確認契約衝突

這不是可自行放行的視覺例外，**第三段尚未宣告全數通過**。

- 範例 `reference.html` 的 `review()` 只對 `delete／clear／complete` 顯示獨立確認，B09 `down` 沒有勾選框。
- 既有 `frontend/src/main.tsx` 的 `independent` 判斷包含 `unmount_finish`，下模完成必須勾選後才可提交。這項判斷與送出停用條件保持原樣。
- 因此 B09 產品多一個獨立確認框，明細及期限的位置向下移。量測工具仍計入缺少對應元件與幾何超標，沒有排除 B09，也沒有修改參考圖讓它過關。
- 本任務禁止改業務規則，故未移除確認。需審查者先決定是否補正 B09 範例；在決定之前，PR 保持 Draft，#57 不標完成。

模具階段按鈕仍依後端 `NEXT_ACTION` 停用，原因保留；範例可自由點選四階段的腳本不搬入產品。人工報工、排程與模具資料都來自既有 Guide、主檔與 proposal，fixture 僅置於 `tests/manual/`。

## 程式與操作驗證

| 項目 | 結果 |
|---|---|
| 前端測試 | 179 項通過 |
| 正式建置與 TypeScript | 通過；保留既有大 bundle 警告 |
| 後端 pytest | 277 通過、11 略過：10 項未啟用真實 SQL 驗收、1 項主機未提供符號連結權限；未改後端 |
| 三語 × 五外觀、草稿與輸入保留 | 通過 |
| 390px、鍵盤 Tab、IME、iframe | 通過 |
| 200% | 等效 CSS viewport 683×384／device scale 2 通過；未操作桌面瀏覽器縮放選單 |
| reduced-motion | 通過；第二段回歸實測轉圈停止且狀態文字保留 |
| 版本、返回修改、獨立確認、unknown 保護 | 前端既有回歸與新增摘要投影測試通過；瀏覽器只做 fixture 預覽 |
| 真實模型、正式登入及正式寫入 | 未執行，本輪未授權亦不需要 |

原完整摘要測試改為測試仍保留在明細中的 `DetailedProposalBusinessSummary`，並另加精簡摘要測試，核對原因名稱、前後值、未知下一排程與錯誤工單識別隔離；沒有刪除原語意斷言。

環境複驗曾在與重建交錯期間發生一次 iframe 載入逾時；固定同一份最終建置後重跑 28 項全部通過。沒有把該次逾時視為通過，也未宣稱已定位為正式應用錯誤。

曾出現的失敗也保留說明：舊模具提示文案斷言導致測試未清理、影響後續兩項；隔離重現後改驗真正的按鈕卡控與停用原因。測試腳本曾把工單 combobox 與模穴輸入一起選到，已改為明確欄位識別。翻譯寫檔曾受 PowerShell 管線編碼影響，已改用 UTF-8 檔案修復，完整三語測試通過。

## 重現

```powershell
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run build
.venv/Scripts/python.exe -m pytest -q
node tests/manual/issue57-capture.cjs
node tests/manual/issue57-report.cjs
node tests/manual/issue57-environment.cjs
node tests/manual/issue57-regression.cjs
node tests/manual/issue57-record.cjs
node tests/manual/issue57-video-check.cjs
```

`issue57-report.cjs` 在 B09 尚未解決前會以非零退出，表示整段視覺門檻未通過。瀏覽器工具均使用 `try/finally` 關閉專屬無頭 Chromium 與隨機本機 HTTP 伺服器，不啟動正式服務。
