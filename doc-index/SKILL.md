---
name: doc-index
description: 讀寫「內容多、會持續增長」的紀錄文件時使用——ADR（docs/adr/）、context/progress.md 與其歸檔。查決策或舊進度前先讀索引、只開需要的那篇或那一節；新增或修改 ADR、歸檔進度後重新產生索引。
---

# doc-index：會增長的紀錄文件，先看索引再開原文

只用在**內容多且會不斷增長**的文件。寫完就定稿的計畫書、研究報告不建索引，需要時用 `grep -n "^##" <檔案>` 找章節，再用 Read 的 offset/limit 只讀那段。

目前納入的文件：

| 文件 | 索引 |
|---|---|
| `docs/adr/NNNN-*.md` | `docs/adr/README.md`（一篇一行） |
| `context/progress-archive.md`（已完成工作的歸檔） | 檔案開頭的 `<!-- toc:start -->` 目錄，附行號 |
| `context/progress.md` | 本身保持短（目前狀態＋下一步＋仍有效的決策），不另建索引 |

腳本：`scripts/doc-index.mjs`（相對於本 skill 目錄）。以下 `$DI` 指它的絕對路徑。

## 讀取

1. **查決策**：先讀 `docs/adr/README.md`。摘要夠回答就不開原文；不夠才開指定那篇。
2. **查舊進度**：先讀 `context/progress-archive.md` 前 40 行的目錄，依 `L<行號>` 用 Read 的 offset/limit 只讀那一節。
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
3. 被新 ADR 取代時，在舊 ADR 加 `superseded-by`，不刪舊檔。
4. 執行 `node $DI adr docs/adr`，把 `docs/adr/README.md` 跟 ADR 一起 commit。

### progress.md 歸檔

`context/progress.md` 超過約 150 行時：

1. 把**已完成**的工作段落（例如已上線的切片、已結案的實驗）原文搬到 `context/progress-archive.md`，以 `## <名稱>（日期）` 分節，新的放最上面。
2. progress.md 原處只留一行結論＋「細節見 progress-archive.md」。仍有效的決策留在 progress.md；已寫成 ADR 的決策改成一行加 ADR 連結。
3. 歸檔檔第一次建立時，在標題下放：
   ```markdown
   <!-- toc:start -->
   <!-- toc:end -->
   ```
4. 執行 `node $DI toc context/progress-archive.md` 更新目錄。

搬移前後要確認沒有遺失內容（搬出的行數＝歸檔新增的行數）。什麼算「已完成」不確定時，留在 progress.md。

## 檢查

`node $DI adr docs/adr --check`、`node $DI toc <file> --check`：索引過期時 exit 1，可接到測試或 pre-commit。
