# Issue #19 前端依賴與授權盤點

來源固定為 `294bc02d3bfb153175513ea7276b44727cb710bb`，目標改前為 `e5d30f981fd8223ae3d20bf81804d631b554d530`。套件版本來自各自 manifest／lock；無套件以「—」表示。

| 套件 | 改前直接版 | 來源直接版 | 採用直接版 | 實際用途／取捨 |
|---|---|---|---|---|
| `@assistant-ui/react` | — | 0.15.25 | 0.15.25 | `chat/assistant-runtime.tsx`、Thread／Message／Composer／清單／Modal primitives；採用。 |
| `@assistant-ui/react-markdown` | — | 0.14.19 | 0.14.19 | `components/assistant-ui/elements/markdown-text.tsx`；採用同一訊息 renderer。 |
| `@fontsource-variable/inter` | — | 5.3.0 | 5.3.0 | `source-styles.css` 本機字型；移除重複 public 二進位。 |
| `@fontsource/ibm-plex-mono` | — | 5.3.0 | 5.3.0 | `source-styles.css` 本機等寬字型；移除重複 public 二進位。 |
| `@fontsource/noto-sans-thai` | 5.3.0 | — | 5.3.0 | 保留 public/fonts 泰文 400／600 及離線 fallback，來源無此語系。 |
| `@tailwindcss/postcss` | — | 4.3.3 | 4.3.3 | `postcss.config.cjs` 真正編譯 Tailwind 4。 |
| `@types/node` | — | 24.19.1 | 24.19.1 | Vite／Node 建置型別。 |
| `@types/react` | 19.3.0 | 19.3.0 | 19.3.0 | React 元件型別。 |
| `@types/react-dom` | 19.3.0 | 19.3.0 | 19.3.0 | ReactDOM 型別。 |
| `@vitejs/plugin-react` | — | 6.1.2 | 6.1.2 | `vite.config.ts` React 轉換。 |
| `class-variance-authority` | — | 0.7.1 | 0.7.1 | `components/ui/button.tsx`、variants。 |
| `clsx` | — | 2.1.1 | 2.1.1 | 來源 `cn` 的 class 組合依賴。 |
| `cn` | — | 0.4.0 | 0.4.0 | `lib/utils.ts`、共用 UI 的 class helper。 |
| `happy-dom` | — | — | 21.0.4 | `assistant-runtime.test.mjs`、`radix-menu.test.mjs` 實際 DOM／鍵盤事件；新增測試依賴。 |
| `lucide-react` | 1.52.0 | 1.52.0 | 1.52.0 | 標頭、選單、訊息、MES 卡片圖示；維持原版本。 |
| `postcss` | — | 8.5.29 | 8.5.29 | 來源 PostCSS 管線；由舊版間接 8.5.32 改為直接鎖定來源 8.5.29。 |
| `postcss-prefix-selector` | — | 2.2.1 | 2.2.1 | `postcss.config.cjs` 將 Preflight／utilities 限制於助理 root。 |
| `postcss-value-parser` | — | 4.2.0 | — | 不直接採用；來源另有值轉換工具，本次採來源原 tokens，不需要其額外轉換。 |
| `radix-ui` | — | 1.7.0 | 1.7.0 | `components/ui/` Dialog／Dropdown／Tooltip／Select／Slot。 |
| `react` | 19.3.0 | 19.3.0 | 19.3.0 | `main.tsx` 與所有元件；單一 React，無另一個業務 runtime。 |
| `react-dom` | 19.3.0 | 19.3.0 | 19.3.0 | `main.tsx` 掛載、元件 DOM 測試；與 React 同版。 |
| `react-markdown` | 10.1.0 | 10.1.0 | 10.1.0 | assistant-ui Markdown 的轉接依賴；安全規則集中於 MarkdownText。 |
| `recharts` | — | 3.8.0 | — | 不適用且有證據：Kaosu 沒有來源結構化圖表資料契約，不從 Markdown 或用量捏造圖表。 |
| `remark-breaks` | 4.0.0 | — | 4.0.0 | MarkdownText 保留既有單換行；來源沒有，Kaosu 必要適配。 |
| `remark-gfm` | 4.0.1 | 4.0.1 | 4.0.1 | MarkdownText 的表格、清單、GFM。 |
| `tailwind-merge` | — | 3.7.0 | 3.7.0 | 來源 `cn` 的 Tailwind 4 class 合併依賴。 |
| `tailwindcss` | — | 4.3.3 | 4.3.3 | `source-styles.css` 真正 Tailwind 4 樣式產物。 |
| `tsx` | — | 4.23.15 | — | 不採用；保留原 Node test＋Vite SSR 載入方式，沒有新增來源的 TS 腳本命令。 |
| `tw-animate-css` | — | 1.4.0 | 1.4.0 | `source-styles.css` 的 Radix 開關動畫。 |
| `tw-shimmer` | — | 0.4.13 | — | 不適用且有證據：來源 tool-activity 的中間活動效果；Kaosu 只有實際 busy，未提供逐工具串流，不捏造工具活動。 |
| `typescript` | 7.0.2 | 7.0.2 | 7.0.2 | 既有 typecheck。 |
| `vite` | 8.3.3 | 8.3.3 | 8.3.3 | 既有 dev／build；維持原版本。 |
| `zustand` | — | 5.0.15 | — | 不另列直接依賴：來源直接用於附件圖像 helper，Kaosu 沒有附件 API；assistant-ui 間接帶入同版，不建立 Guide store。 |

## 授權與重現

完整新增、移除、版本變動與授權見 [機器可讀清單](evidence/issue19/套件與授權變動.json)。本輪共有 167 個安裝路徑版本變動（包含直接與間接，不代表 167 個新增套件），沒有缺漏授權欄位。字型為 OFL；其餘套件依清單保留 MIT／Apache 等原授權。移植的上游 assistant-ui TSX 保留 `frontend/src/components/assistant-ui/LICENSE.md` 與來源原始擷取清單；後者是上游歷史資訊，不能冒充本輪 Kaosu 移植清單。

未執行 shadcn CLI、沒有以 latest 覆寫元件。目標 lock 由目標 manifest 安裝生成，沒有整份取代為來源 lock，也未使用 `--force` 或 `--legacy-peer-deps`。React／ReactDOM 都是 19.3.0，npm tree 的其他使用者皆 deduped。

Node 24.18.0、npm 11.16.0。`npm ci` 成功，但本機 npm 額外顯示 esbuild postinstall 的 allow-scripts 提示；本輪未擅自改全域允許清單。後續 typecheck、DOM 測試與 build 均實際成功。npm audit 回報 0 個漏洞；這不是對未來版本的保證。

## 宿主與字型

PostCSS 將 selector 限制在 `#mes-ai-chat-root`／`#mes-ai-preview-root`。所有 Radix Portal 留在助理容器，保留 iframe 與 postMessage 契約。獨立頁的 body margin 由其自己的 HTML inline 設定，不用會污染 MES 宿主的全域 reset。

Inter 與 IBM Plex Mono 從同版本 Fontsource 本地打包；移除原 public 的重複 400 字型，保留授權。泰文字型保留 public/fonts，未下載 CDN。

原 API／Agent、OpenAI、MES 交易、權限與 DB schema 均未更動。
