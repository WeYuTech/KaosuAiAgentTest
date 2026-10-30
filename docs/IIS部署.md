# IIS 部署與維護

部署日期：2026-10-30。目標為使用者指定的 `192.168.2.123`，以已授權 SSH 管理連線部署。原 MES 位於 `C:\inetpub\wwwroot\KSS_MES`，助理入口為 `http://192.168.2.123/KSS_MES/ai-agent/`。來源庫仍預設模擬模式；伺服器環境設定採正式模式。

## 實際配置

| 項目 | 設定 |
|---|---|
| 後端程式 | `C:\Services\KaosuAiAgent\current`，位於網站目錄之外 |
| Python | 同根目錄 `Python`，3.12.10，與開發驗收版本一致；後續更新需重跑驗收 |
| 虛擬環境 | `C:\Services\KaosuAiAgent\venv`；依 `requirements.lock.txt` 離線安裝固定版本 |
| 服務啟動 | Windows 工作排程器 `KaosuAiAgent`，開機啟動，失敗一分鐘後重啟；執行身分 `LOCAL SERVICE` |
| 監聽 | Uvicorn 單 worker、`127.0.0.1:8765`，不對網路直接開放此埠 |
| IIS | Default Web Site 下 `/KSS_MES/ai-agent` 子應用，獨立 `KaosuAiAgentProxy` pool |
| 代理目錄 | `C:\Services\KaosuAiAgent\proxy`；只放代理設定，不放程式、資料庫或金鑰 |
| 私密設定 | 後端 `.env`；僅系統、管理員及服務執行身分可讀，不進 Git 或發行 ZIP |
| 助理狀態 | 後端 `.local\operations.db`：對話、確認卡、回饋、已發布知識與應用稽核 |
| 模型預算 | 後端 `.local\model-budget.db`：沿用開發累計帳本；本機開發站額度設 0，避免跨機各自計費超額 |
| 服務日誌 | `.local\logs\service.log`，五份輪替；不記錄存取 URL、Cookie 或模型請求內容 |

IIS 原本缺少 URL Rewrite 與 ARR，已從 Microsoft 官方來源安裝並驗證簽章；Python 安裝檔也已驗證 Python Software Foundation 簽章。安裝未要求重新啟動主機。主機層 ARR 已啟用代理、保留 Host、逾時五分鐘；這三項是主機層設定，不能描述成所有異動都限於子應用。

依據：[Microsoft 反向代理配置](https://learn.microsoft.com/en-us/iis/extensions/url-rewrite-module/reverse-proxy-with-url-rewrite-v2-and-application-request-routing)、[URL Rewrite](https://www.iis.net/downloads/microsoft/url-rewrite)、[ARR](https://www.iis.net/downloads/microsoft/application-request-routing)、[Uvicorn 設定](https://uvicorn.dev/settings/)。

## 登入、權限與寫入

沿用原 `ASP.NET_SessionId` Cookie，設定 `MES_IDENTITY_CONTRACT=session-registry-v1`。後端向本機 `/KSS_MES/AiAgentSession.ashx` 取得原應用伺服器 Session 的 SessionId 與有效期限，再以參數化查詢對應 `SEC_APP_SESSION_REGISTRY` 與啟用中的 `SEC_USER`。端點只接受 loopback GET，不接受前端傳入的帳號／SessionId，也不回傳 Token。此檔必須放在原 KSS_MES 應用根目錄，不能放在助理子應用。

目前部署 allowlist 只有使用者指定的 `ADMINV2`，授權三個模組與知識審核。新增其他人員須由管理員將實際 MES 帳號列入 `.env`，不接受使用者在對話裡聲稱的身分。

正式資料庫 `kaosu_MES_KSS` 已建立六個 `ZZ_AI_AGENT_OPERATION_` 前綴空表。正式業務交易使用 OPERATION／CHANGE，其餘 SQL 表保留作後續接入；目前確認卡、回饋與知識仍由伺服器 SQLite 保存。部署過程沒有對正式 MES 業務資料執行測試寫入。

現場已設定 `MES_ENABLE_WRITES=1` 與 `MES_WRITE_CONTRACT=transaction-v1`，開放已授權人員確認交易。每筆操作仍須有可信身分、合法資料版本與人員確認。刪除、完工及會連動完工的操作仍各自確認；結果不明時僅能查核既有操作紀錄，不自動重送。

## 封裝與更新

先完成後端測試、前端測試及建置，再執行：

```powershell
python scripts/package_release.py
```

腳本只收白名單程式與前端產物，拒絕環境檔、憑證、資料庫與連結，產出 ZIP、ZIP SHA256 與逐檔 SHA256。以 SSH/SCP 傳至伺服器，核對 SHA256 後停止 `KaosuAiAgent` 工作、更新 `current` 並啟動。`.env` 與 `.local` 不在封裝中，更新時必須保留，尤其不得清空預算或確認紀錄。

首次設定代理及開機啟動使用 `scripts/configure_iis.ps1`；執行前先備份 IIS。此腳本使用 UTF-8 BOM，以相容伺服器的 Windows PowerShell 5.1。`scripts/run_service.py` 固定 loopback、單 worker 及子路徑，不需要另外開放 8765 防火牆規則。

## 原 MES 頁面與回復

已在 WIP 選單、現行新版排程清單／編輯、報工清單／歷史／明細、模具看板／歷史共八頁加入同來源 loader。原始頁面、編碼及修改前後 SHA256 均保留在：

`C:\Services\KaosuAiAgent\backups\widget-20261030\manifest.json`

安裝腳本會先核對全部八頁，再寫入；同一標記不重複安裝。頁面已由其他人修改時，還原腳本會整批拒絕覆蓋：

```powershell
C:\Services\KaosuAiAgent\venv\Scripts\python.exe C:\Services\KaosuAiAgent\current\scripts\install_widget.py --restore C:\Services\KaosuAiAgent\backups\widget-20261030\manifest.json
```

IIS 主機原設定備份名稱為 `KaosuAiAgent-before-20261030`；原 MES web.config 另備份在 `backups\MES-web.config`。原 MES web.config 沒有被本次入口安裝腳本修改。整台 IIS 設定還原會影響其他站台，應先比對備份後的其他管理變更；一般停用助理只需還原八頁入口、停止專屬工作與移除專屬子應用。

## 驗收紀錄

已確認 IIS 健康檢查為 live、後端只監聽 loopback、工作身分為 LOCAL SERVICE；正常 MES 登入可沿用 ADMINV2，未登入請求回 401、模擬登入在 live 模式被拒絕。指定正式作業的真實 Responses 查詢成功，人工良品／不良與 IoT 推算分開，未知 IoT 保持未知，沒有產生操作草稿。

正式公開 HTTP 三模組查詢皆回 200：指定報工 1 筆、指定排程 1 筆、MC37 模具 all 查詢當次 73 筆。產生「報工模穴 5 改 6」預覽後明確取消，取消前後實際模穴皆為 5、正式 OPERATION 紀錄皆為 0；沒有送出同意確認。八頁入口 HTTP 皆 200 且 loader 各一份，助理 URL 下的 `.env`、`.local/model-budget.db`、`app/main.py` 均 404。原頁內已實際操作入口、沿用身分、放大、載入當前工單與真實模型唯讀對話。

每次模型工具查詢或準備草稿前，重新核對同一個 MES 工作階段、帳號、USER_SID 及模組授權，避免長對話超過 60 秒內部證明期限；中途失效、換人或撤權會立即拒絕。

瀏覽器初次對話曾遇到登入驗證失敗。已由原後端證明：一般查詢會生成新 Token 並更新 Session，`SEC_USER.REFRESH_TOKEN` 僅在登入時更新，所以兩者相等不是可靠的持續身分契約。現已切換上述 Session registry 契約，沒有以放寬 Token 比對或接受前端帳號處理。原始失敗與修正證據保留在審查及驗收文件。
