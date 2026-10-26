---
name: doc-index
description: 查 ADR（docs/adr/）、查舊進度（context/progress-archive.md）、新增或修改 ADR、歸檔過長的 context/progress.md（約 150 行以上）、維護 context/work/ 進行中項目、升級 progress.md 版型時使用；先讀索引，寫入後重建索引。
---

# doc-index

腳本：`~/.claude/skills/doc-index/scripts/doc-index.mjs`。指令在專案根目錄執行。exit code：0 正常、1 索引過期（僅 `--check`）、2 錯誤。

只有會增長的紀錄文件才建索引。寫完就定稿的文件直接讀原文。

| 文件 | 索引 |
|---|---|
| `docs/adr/NNNN-*.md` | `docs/adr/README.md`（一篇一行） |
| `context/progress-archive.md`（已完成工作的歸檔） | 檔案開頭的目錄（標記格式見「導入」） |
| `context/progress.md` | 版型 1（無 `<!-- doc-index:layout=2 -->`）：本身保持短，不另建索引。保留：專案目標、合作流程、仍有效的決策（一行一條，已成 ADR 的附連結）、目前狀態與下一步。版型 2：本身就是索引，只留目標、流程、決策、進行中清單；每條只留一句短敘述加連結，細節放在被連結的檔案 |
| `context/work/<slug>.md`（版型 2 進行中項目的過程紀錄） | `context/progress.md` 內 `<!-- work:start -->`～`<!-- work:end -->` 之間的進行中清單（一份一行，由腳本產生） |

無 `<!-- doc-index:layout=2 -->` 的專案照版型 1 規則運作，下列版型 2 規則不適用。

## 讀取

1. 查決策：先讀 `docs/adr/README.md`。摘要夠回答就停；不夠才開指定那篇。
2. 查舊進度：先 `grep -n 'toc:end' context/progress-archive.md` 取得行號，用 Read 的 limit 讀到那一行（目錄），再依 `L<行號>` 用 offset/limit 只讀那一節。
3. 版型 2：先讀 `context/progress.md`，只開自己那項的 `context/work/<slug>.md`。
4. 索引不存在（專案還沒導入）時，照常讀原文，並在回覆中提一句可導入本 skill。

## 新增或修改 ADR

1. 檔名 `NNNN-kebab-title.md`，編號接續最大值。
2. 格式：
   ```markdown
   ---
   status: accepted            # proposed | accepted | deprecated
   summary: 一句話寫決策結論（≤ 60 字）
   superseded-by: 0012         # 只有被取代時才加
   ---
   # 標題（決策的結論）

   第一段：背景與決策。
   ```
   標題與 summary 寫決策結論。frontmatter 欄位一律單行（否則 exit 2）；缺 summary 會警告。
3. 被新 ADR 取代時，在舊 ADR 加 `superseded-by`，舊檔保留；索引會顯示「已被 0012 取代」（優先於 `status`）。
4. 更新索引：`node ~/.claude/skills/doc-index/scripts/doc-index.mjs adr docs/adr`。
5. ADR 與有變動的 `docs/adr/README.md` 在同一個 commit 提交。

完成條件（第 5 步 commit 後）：`node ~/.claude/skills/doc-index/scripts/doc-index.mjs adr docs/adr --check` exit 0，且 `git status --short docs/adr` 無輸出。

## work 檔

版型 2 的每個進行中項目一份 `context/work/<slug>.md`，開頭 frontmatter 欄位一律單行：

```markdown
---
status: doing               # todo | doing | blocked
summary: 一句話寫這項在做什麼（不超過 60 字）
branch: feat/a              # 認領分支；未認領留空
---
# 標題
```

- 內容只放：目前狀態與下一步、實作中的決定、部署與驗證紀錄、待確認事項。
- 需求簡報、規格、工作單只放連結。
- 診斷、retro 等無規格的工作也開 work 檔。
- `branch` 欄位即認領，取代 draft PR 認領；別的 session 已認領（`branch` 有值）的 work 檔不碰。
- 改動 work 檔後執行 `node ~/.claude/skills/doc-index/scripts/doc-index.mjs work context/work context/progress.md` 重建清單；summary 缺漏或超過 60 字會警告。
- 結案時把 work 檔原文搬到 `context/progress-archive.md` 最上面（沿用「歸檔 progress.md」的分節與目錄規則），搬完刪除 work 檔，再重建清單。

完成條件：`node ~/.claude/skills/doc-index/scripts/doc-index.mjs work context/work context/progress.md --check` exit 0。

## 歸檔 progress.md

`context/progress.md` 約 150 行以上時：

1. 把已完成的工作段落（例如已上線的切片、已結案的實驗）原文搬到 `context/progress-archive.md`，以 `## <名稱>（日期）` 分節，新的放最上面。完成與否有疑義時，段落留在原處。
2. progress.md 原處改成一行結論加「細節見 progress-archive.md」。仍有效的決策留在 progress.md；已寫成 ADR 的決策改成一行加 ADR 連結。
3. 歸檔檔第一次建立時，先放索引標記（格式見「導入」）。
4. 更新索引：`node ~/.claude/skills/doc-index/scripts/doc-index.mjs toc context/progress-archive.md`。

完成條件：
- 歸檔檔是新建的話先 `git add -N context/progress-archive.md`，再看 `git diff` 中 progress.md 只有刪除與結論行；歸檔檔在 `<!-- toc:start -->`～`<!-- toc:end -->` 之外只有新增（目錄行號會因重建而改變）。
- `node ~/.claude/skills/doc-index/scripts/doc-index.mjs toc context/progress-archive.md --check` exit 0。
- progress.md 低於約 150 行；若仍超過，在回覆中列出留下的每一段及其未完成的原因。

## 導入（專案第一次使用）

- ADR：`docs/adr/` 須已存在（否則 exit 2），執行 `node ~/.claude/skills/doc-index/scripts/doc-index.mjs adr docs/adr`；`README.md` 不存在會自動建立。
- 歸檔檔：在檔案標題下放兩行 `<!-- toc:start -->`、`<!-- toc:end -->`，順序相反或缺一會 exit 2。目錄由腳本寫在兩行之間，只收 `##` 標題並附行號。接著執行 `node ~/.claude/skills/doc-index/scripts/doc-index.mjs toc context/progress-archive.md`。

## 升級（版型 1 到版型 2）

1. 執行 `node ~/.claude/skills/doc-index/scripts/doc-index.mjs status`，看尚缺的項目。
2. 在 `context/progress.md` 放入 `<!-- doc-index:layout=2 -->`，以及空的 `<!-- work:start -->`、`<!-- work:end -->` 兩行（放在「進行中」標題下）。
3. 建立 `context/work/`；每個進行中項目拆成一份 work 檔（格式見「work 檔」），內容原文搬入。
4. 已完成的段落原文搬到 `context/progress-archive.md`（見「歸檔 progress.md」）。
5. progress.md 只留目標、流程、決策（一行一條）、進行中清單；每條一句短敘述加連結。
6. 執行 `node ~/.claude/skills/doc-index/scripts/doc-index.mjs work context/work context/progress.md`。

完成條件：`node ~/.claude/skills/doc-index/scripts/doc-index.mjs status` 回報版型 2 且無缺項（exit 0），`node ~/.claude/skills/doc-index/scripts/doc-index.mjs work context/work context/progress.md --check` exit 0。
