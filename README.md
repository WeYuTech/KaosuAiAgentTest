# 高塑 MES 對話操作助理

以自然語言操作 EPS 排程、報工及模具上下模。直接沿用 Emerald.AI 原版黑白 Zinc 配色、品牌圖與字體，右下角圓形入口展開聊天室，可放大為全畫面；先選模組與操作身分，對話補齊資訊，核對確認卡後才寫入。

目前預設為**隔離模擬環境**，內建設備、模具、工單、班別與人工／IoT 資料皆為合成資料。正式 MES 串接狀態與限制見 `docs/MES整合.md`，不可將模擬驗收視為正式寫入已驗證。

## 啟動

需要 Python 3.12 以上、Node.js 與 npm。

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e '.[test]'
Copy-Item .env.example .env
# 在本機 .env 填 OPENAI_API_KEY；不要提交此檔。
cd frontend
npm ci
npm run build
cd ..
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

開啟 `http://127.0.0.1:8000`，點選右下角助理。模擬身分包含排程員、報工員、換模員與主管；角色選單僅供模擬，正式模式必須由 MES 可信身分授權。

## 三個模組

| 模組 | 對話操作 |
|---|---|
| 排程 | 查詢、排序與換頁，選品號／模具／工單，新增與修改、模穴分配、班別、生產日與目標件數計算 |
| 報工 | 人工良品與不良原因新增／修改／刪除、模穴數、整排程完工，人工與 IoT 推算值分開 |
| 模具 | 廠別設備查詢、候選排程、上模開始／完成、下模開始／完成、歷史與清除 |

例如：「列出 MC36 的排程」、「MC37 的 WO-A 良品20個、缺料2個」、「排程1003上模開始」。若有多筆目標，助理會追問；沒有模型金鑰時會明確顯示未設定，可用結構化表單驗證流程。

所有寫入都需要確認卡。刪除、完工、清除及有完工連動的下模完成須獨立核對。確認卡過期或資料已改變就拒絕；重複確認不重複寫入；取消不寫入業務資料。

## 模型與知識

使用 **OpenAI Responses API + gpt-6.1-sol**，以嚴格工具參數產生受限草稿，沒有模型可呼叫的執行／同意工具。原查詢、業務規則與交易由後端控制，不讓模型生成 SQL。

第一版 RAG 採本機已審核知識檢索，使用詞與中文字組排序；沒有額外購買向量資料庫或建立雲端 Vector Store。知識有來源、版本與模組。回饋先待審，主管修正後仍不會自動上線；部署管理員必須提供具體問答案例，固定回歸及候選知識的真實模型驗證通過後才發布：

```powershell
.\.venv\Scripts\python.exe scripts/publish_knowledge.py --case .local/knowledge-case.json -- <已審核回饋ID>
```

案例格式與發布證據見 [模型選型與知識修正](docs/模型選型與知識修正.md)。候選只在隔離資料庫與既有已發布知識共同檢索，必須命中同一內容雜湊、回覆符合案例，且沒有產生操作草稿才可發布；真實模型呼叫共用下列累計預算。這是知識修正流程，**不是模型自行訓練**。新的業務規則仍須修改程式與對應測試；不能只改知識文字來繞過卡控。

模型呼叫用量寫入 `.local/model-budget.db`，跨啟動累計。本次上限 US$20，呼叫前預留費用，回傳用量後結算；逾時未知保留預留且不自動重試。不要刪除該帳本來重置預算。前端只呼叫本機後端，不持有 OpenAI 金鑰。

官方依據：[模型規格與價格](https://developers.openai.com/api/docs/models/gpt-6.1-sol)、[工具呼叫](https://developers.openai.com/api/docs/guides/function-calling)。價格以文件核對日 2026-10-30 的輸入 US$2／百萬 token、輸出 US$10／百萬 token 保守計算，不依賴快取折扣。

## 驗收與追溯

```powershell
.\.venv\Scripts\python.exe -m pytest -q
# 以下會使用真實模型，與全專案共用 US$20 帳本。
.\.venv\Scripts\python.exe scripts/evaluate_dialogue.py
.\.venv\Scripts\python.exe scripts/evaluate_lifecycle.py
```

公開 API 包含 `/api/session`、`/api/workspace`、`/api/conversations`、`/api/proposals`、`/api/audit`、`/api/feedback` 與 `/api/budget`；詳細契約可查看啟動後的 `/docs`。

模擬狀態、草稿與稽核在同一 SQLite 交易保存。AI 專用表一律 `ZZ_AI_AGENT_OPERATION_` 前綴。稽核保留操作者、模組、動作、事件／確認時間、結果、資料表、主鍵、欄位前後值；取消與成功明確分開。

## 原系統證據

- `docs/實作規格.md`：已確認範圍與六個開發切片。
- `docs/inventory/`：現行畫面、API、反編譯後端、真實卡控與缺陷的來源行號。
- `docs/模擬情境.md`：合成資料與模擬投影的界線。
- `docs/前端操作.md`：介面與嵌入方式。
- `docs/MES整合.md`：正式登入、查詢、交易及部署限制。
- `docs/SQL驗收.md`：隔離 SQL Server 真實交易、觸發器及失敗回復。
- `docs/驗收報告.md`：本次完成項目、測試證據、模型費用與交付界線。

來源版本為 `WeYuTech/test@979d2c63d90a3310b00486c755c18e7a25aaba5c`。不把舊版 OPI 排程規則誤套到現行 setup 新版，也不把原程式缺陷當成必須複製的功能。
