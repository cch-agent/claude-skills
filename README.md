# claude-skills

個人 Claude Code skills。hooks 類的 plugin 在 [claude-mods](https://github.com/cch-agent/claude-mods)。

- `doc-index`：會持續增長的紀錄文件（ADR、`progress.md` 歸檔）先讀索引、只開需要的那篇或那一節；附產生索引的腳本 `doc-index/scripts/doc-index.mjs`（Node ≥ 18，無相依）。

## 安裝

```
git clone git@github.com:cch-agent/claude-skills.git ~/Documents/project/claude-skills
ln -s ~/Documents/project/claude-skills/doc-index ~/.claude/skills/doc-index
```

用 symlink，`git pull` 後就是最新版。

建議在 `~/.claude/CLAUDE.md` 加上讀取規則（skill 只在被觸發時載入，這條讓「先看索引」每次都生效）：

```markdown
- ADR 與舊進度：先讀索引（`docs/adr/README.md`、`context/progress-archive.md` 開頭目錄），只開需要的那篇或那一節；新增、修改、歸檔依 `doc-index` skill。
```
