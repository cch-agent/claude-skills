---
name: doc-index
description: 當要查專案決策或 ADR（docs/adr/）、查舊進度（context/progress-archive.md）、新增或修改 ADR，或 context/progress.md 太長（超過約 150 行）要歸檔時使用。查之前先讀索引、只開需要的那篇或那一節；新增或修改 ADR、歸檔後重新產生索引。
---

# doc-index：會增長的紀錄文件，先看索引再開原文

只用在**內容多且會不斷增長**的文件。寫完就定稿的計畫書、研究報告不建索引，需要時用 `grep -n "^##" <檔案>` 找章節，再用 Read 的 offset/limit 只讀那段。

目前納入的文件：

| 文件 | 索引 |
|---|---|
| `docs/adr/NNNN-*.md` | `docs/adr/README.md`（一篇一行） |
| `context/progress-archive.md`（已完成工作的歸檔） | 檔案開頭的 `<!-- toc:start -->` 目錄，附行號 |
| `context/progress.md` | 本身保持短（目前狀態＋下一步＋仍有效的決策），不另建索引 |

腳本：`~/.claude/skills/doc-index/scripts/doc-index.mjs`（symlink 到 claude-skills repo）。以下 `$DI` 指這個路徑。

### 導入步驟（專案第一次使用）

- ADR：建立 `docs/adr/README.md` 要先跑 `node $DI adr docs/adr`（不存在會自動建立）。
- 歸檔檔：先在檔案標題下放 `<!-- toc:start -->` 與 `<!-- toc:end -->` 兩行，再跑 `node $DI toc context/progress-archive.md`；缺標記或順序相反會報錯。

## 讀取

1. **查決策**：先讀 `docs/adr/README.md`。摘要夠回答就不開原文；不夠才開指定那篇。
2. **查舊進度**：先讀 `context/progress-archive.md`，讀到 `<!-- toc:end -->` 為止的目錄，依 `L<行號>` 用 Read 的 offset/limit 只讀那一節。
3. 索引不存在（專案還沒導入）時，照常讀原文，並在回覆中提一句可導入本 skill。

## 寫入

### 新增或修改 ADR

1. 檔名 `NNNN-kebab-title.md`，編號接續最大值。
2. 格式：
   ```markdown
   ---
   status: accepted            # proposed | accepted | deprecated
   summary: 一句話寫決策本身（≤ 60 字），不是背景
   superseded-by: 0012         # 只有被取代時才加
   ---
   # 標題（決策的結論）

   第一段：背景與決策。
   ```
3. 被新 ADR 取代時，在舊 ADR 加 `superseded-by`，不刪舊檔。`superseded-by` 優先於 `status`：有值（非空）時索引一律顯示 `superseded → 編號`。
4. 規範：`summary` 等 frontmatter 欄位只能單行（不可用 `>`、`|` 或縮排續行，否則腳本報錯 exit 2）；值可加成對引號，空字串視為未設定；缺 summary 時腳本會警告並退而取第一段的第一句。標題只認圍欄外的第一個 `# `。
5. 執行 `node $DI adr docs/adr`，把 `docs/adr/README.md` 跟 ADR 一起 commit。

### progress.md 歸檔

`context/progress.md` 超過約 150 行時：

1. 把**已完成**的工作段落（例如已上線的切片、已結案的實驗）原文搬到 `context/progress-archive.md`，以 `## <名稱>（日期）` 分節，新的放最上面。
2. progress.md 原處只留一行結論＋「細節見 progress-archive.md」。仍有效的決策留在 progress.md；已寫成 ADR 的決策改成一行加 ADR 連結。
3. 歸檔檔第一次建立時，在標題下放（目錄只收 `##` 標題，圍欄內的不算）：
   ```markdown
   <!-- toc:start -->
   <!-- toc:end -->
   ```
4. 執行 `node $DI toc context/progress-archive.md` 更新目錄。

驗證不遺失內容：歸檔前後用 `wc -l` 比對 progress.md 與歸檔檔的總行數（總和應相同，扣掉新增的分節標題與原處新增的結論行），或用 `git diff` 確認只有搬移、沒有刪改。什麼算「已完成」不確定時，留在 progress.md。

## 檢查

`node $DI adr docs/adr --check`、`node $DI toc <file> --check`：

exit code：0 正常、1 索引過期（僅 `--check`）、2 錯誤（參數錯誤、找不到檔案或目錄、缺 toc 標記或順序錯、frontmatter 多行值）。可接到測試或 pre-commit。
