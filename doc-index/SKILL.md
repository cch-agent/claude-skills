---
name: doc-index
description: 查專案決策或 ADR（docs/adr/）、查舊進度（context/progress-archive.md）、新增或修改 ADR、或 context/progress.md 過長（約 150 行以上）要歸檔時使用。
---

# doc-index：會增長的紀錄文件，先看索引再開原文

只用在**內容多且會不斷增長**的文件。寫完就定稿的計畫書、研究報告不建索引，需要時用 `grep -n "^##" <檔案>` 找章節，再用 Read 的 offset/limit 只讀那段。

| 文件 | 索引 |
|---|---|
| `docs/adr/NNNN-*.md` | `docs/adr/README.md`（一篇一行） |
| `context/progress-archive.md`（已完成工作的歸檔） | 檔案開頭 `<!-- toc:start -->` 與 `<!-- toc:end -->` 之間的目錄（只收 `##` 標題，附行號） |
| `context/progress.md` | 本身保持短，不另建索引。保留：專案目標、合作流程、仍有效的決策（一行一條，已成 ADR 的附連結）、目前狀態與下一步 |

腳本是 `~/.claude/skills/doc-index/scripts/doc-index.mjs`。以下指令皆為完整可執行形式，每次 Bash 呼叫都照抄完整路徑（shell 狀態不保留）。

### 導入步驟（專案第一次使用）

- ADR：`docs/adr/` 目錄須已存在（否則 exit 2），再跑 `node ~/.claude/skills/doc-index/scripts/doc-index.mjs adr docs/adr`；`README.md` 不存在會自動建立。
- 歸檔檔：先在檔案標題下放兩行 `<!-- toc:start -->`、`<!-- toc:end -->`（缺標記或順序相反會 exit 2），再跑 `node ~/.claude/skills/doc-index/scripts/doc-index.mjs toc context/progress-archive.md`。

## 讀取

1. **查決策**：先讀 `docs/adr/README.md`。摘要夠回答就不開原文；不夠才開指定那篇。
2. **查舊進度**：先 `grep -n 'toc:end' context/progress-archive.md` 取得行號，再用 Read 的 limit 讀到那一行（目錄），依 `L<行號>` 用 offset/limit 只讀那一節。
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
3. 被新 ADR 取代時，在舊 ADR 加 `superseded-by`，不刪舊檔；索引會顯示 `已被 0012 取代`（優先於 `status`）。
4. frontmatter 欄位一律單行，否則腳本 exit 2；缺 summary 會警告。
5. 執行 `node ~/.claude/skills/doc-index/scripts/doc-index.mjs adr docs/adr`，把 `docs/adr/README.md` 跟 ADR 一起 commit。

### progress.md 歸檔

`context/progress.md` 超過約 150 行時：

1. 把**已完成**的工作段落（例如已上線的切片、已結案的實驗）原文搬到 `context/progress-archive.md`，以 `## <名稱>（日期）` 分節，新的放最上面。
2. progress.md 原處只留一行結論＋「細節見 progress-archive.md」。仍有效的決策留在 progress.md；已寫成 ADR 的決策改成一行加 ADR 連結。
3. 歸檔檔第一次建立時，依「導入步驟」放 toc 標記。
4. 執行 `node ~/.claude/skills/doc-index/scripts/doc-index.mjs toc context/progress-archive.md` 更新目錄。

驗證不遺失內容：歸檔前後用 `wc -l` 比對 progress.md 與歸檔檔的總行數（總和應相同，扣掉新增的分節標題與原處新增的結論行），或用 `git diff` 確認只有搬移、沒有刪改。什麼算「已完成」不確定時，留在 progress.md。

## 檢查

- `node ~/.claude/skills/doc-index/scripts/doc-index.mjs adr docs/adr --check`
- `node ~/.claude/skills/doc-index/scripts/doc-index.mjs toc context/progress-archive.md --check`

exit code：0 正常、1 索引過期（僅 `--check`）、2 錯誤。可接到測試或 pre-commit。
