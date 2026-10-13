#!/usr/bin/env node
// 會持續增長的紀錄文件的索引工具（無相依套件，Node ≥ 18）。
//
//   doc-index.mjs adr [dir] [--check]
//     由 dir（預設 docs/adr）底下每篇 NNNN-*.md 的 frontmatter 與標題產生 dir/README.md。
//   doc-index.mjs toc <file> [--check]
//     把 file 內 <!-- toc:start --> 與 <!-- toc:end --> 之間換成 `##` 標題清單（附行號），
//     讓 AI 先讀前幾十行，再用 offset 只讀需要的那一節。
//
// --check：只比對，不寫檔；內容過期時 exit 1。
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const [cmd, ...rest] = process.argv.slice(2);
const check = rest.includes('--check');
const args = rest.filter((a) => a !== '--check');

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: text.slice(m[0].length) };
}

const cell = (s) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** 沒寫 summary 時退而取第一段的第一句，最多 60 字。 */
function fallbackSummary(body) {
  const para = body.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !p.startsWith('#')) ?? '';
  // 英文標點後要接空白才算句尾，避免切到網址與版本號（players.pokemon-card.com、8.0.0）
  const first = para.split(/(?<=[。！？])|(?<=[.!?])(?=\s)/)[0] ?? '';
  return first.length > 60 ? first.slice(0, 59) + '…' : first;
}

function adrIndex(dir) {
  const files = readdirSync(dir).filter((f) => /^\d{4}-.*\.md$/.test(f)).sort();
  const rows = files.map((f) => {
    const { meta, body } = frontmatter(readFileSync(join(dir, f), 'utf8'));
    const title = body.match(/^#\s+(.+)$/m)?.[1] ?? f;
    const status = meta['superseded-by'] ? `superseded → ${meta['superseded-by']}` : (meta.status ?? '');
    const summary = meta.summary || fallbackSummary(body.replace(/^#.*$/m, ''));
    return `| ${f.slice(0, 4)} | [${cell(title)}](${f}) | ${cell(status)} | ${cell(summary)} |`;
  });
  return [
    '# ADR 索引',
    '',
    '<!-- 由 doc-index.mjs adr 產生，請勿手改；改 ADR 的 frontmatter（summary、status、superseded-by）後重跑。 -->',
    '',
    '| # | 標題 | 狀態 | 摘要 |',
    '|---|------|------|------|',
    ...rows,
    ''
  ].join('\n');
}

const START = '<!-- toc:start -->';
const END = '<!-- toc:end -->';

function renderToc(lines, s, e, headings) {
  const toc = headings.map((h) => `- L${h.line} ${h.text}`);
  return [...lines.slice(0, s + 1), ...toc, ...lines.slice(e)];
}

function withToc(text) {
  const lines = text.split('\n');
  const s = lines.indexOf(START);
  const e = lines.indexOf(END);
  if (s < 0 || e < s) throw new Error(`找不到 ${START} … ${END} 標記`);
  const scan = (ls) => {
    const out = [];
    let fence = false;
    ls.forEach((l, i) => {
      if (/^```/.test(l)) fence = !fence;
      const m = !fence && l.match(/^##\s+(.+)$/);
      if (m) out.push({ line: i + 1, text: m[1].trim() });
    });
    return out;
  };
  // 目錄本身的行數會推移後面標題的行號：先放佔位，再以最終位置重算一次（標題數不變，行數不變）。
  const draft = renderToc(lines, s, e, scan(lines).map((h) => ({ ...h, line: 0 })));
  const ds = draft.indexOf(START), de = draft.indexOf(END);
  return renderToc(draft, ds, de, scan(draft)).join('\n');
}

function emit(path, next) {
  const prev = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (prev === next) return console.log(`${path}：已是最新`);
  if (check) {
    console.error(`${path}：索引過期，請執行 doc-index.mjs 更新`);
    process.exit(1);
  }
  writeFileSync(path, next);
  console.log(`${path}：已更新`);
}

if (cmd === 'adr') {
  const dir = args[0] ?? 'docs/adr';
  emit(join(dir, 'README.md'), adrIndex(dir));
} else if (cmd === 'toc' && args[0]) {
  emit(args[0], withToc(readFileSync(args[0], 'utf8')));
} else {
  console.error(`用法：${basename(process.argv[1])} adr [dir] [--check] | toc <file> [--check]`);
  process.exit(2);
}
