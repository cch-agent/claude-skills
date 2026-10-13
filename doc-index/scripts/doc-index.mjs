#!/usr/bin/env node
// 會持續增長的紀錄文件的索引工具（無相依套件，Node ≥ 18）。
//
//   doc-index.mjs adr [dir] [--check]
//     由 dir（預設 docs/adr）底下每篇 NNNN-*.md 的 frontmatter 與標題產生 dir/README.md。
//   doc-index.mjs toc <file> [--check]
//     把 file 內 <!-- toc:start --> 與 <!-- toc:end --> 之間換成 `##` 標題清單（附行號），
//     讓 AI 讀到 <!-- toc:end --> 為止，再用 offset 只讀需要的那一節。
//
// --check：只比對，不寫檔；內容過期時 exit 1。
// exit code：0 正常；1 --check 發現索引過期；2 錯誤（參數、檔案、標記、frontmatter 格式）。
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

class UserError extends Error {}
const fail = (msg) => {
  throw new UserError(msg);
};

const norm = (s) => s.replace(/\r\n/g, '\n');

function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') fail(`找不到檔案：${path}`);
    fail(`無法讀取 ${path}：${e.message}`);
  }
}

/** 逐行標記是否位於程式碼圍欄內（含圍欄開閉行本身）。同符號且長度不小於開頭者才關閉。 */
function fenceMask(lines) {
  let open = null; // { ch, len }
  return lines.map((l) => {
    if (open) {
      const m = l.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
      if (m && m[1][0] === open.ch && m[1].length >= open.len) open = null;
      return true;
    }
    const m = l.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (m) {
      open = { ch: m[1][0], len: m[1].length };
      return true;
    }
    return false;
  });
}

const unquote = (v) => {
  const m = v.match(/^(["'])(.*)\1$/);
  return (m ? m[2] : v).trim();
};

function frontmatter(text, name) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  const fm = m[1].split('\n');
  fm.forEach((line, i) => {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) {
      const raw = kv[2].trim();
      if (/^[>|][+-]?\d*$/.test(raw) || /^\s+\S/.test(fm[i + 1] ?? '')) {
        fail(`${name}：frontmatter 的 ${kv[1]} 不可跨多行（請寫成單行，不要用 >、| 或縮排續行）`);
      }
      const v = unquote(raw);
      if (v) meta[kv[1]] = v;
    }
  });
  return { meta, body: text.slice(m[0].length) };
}

const cell = (s) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** 沒寫 summary 時退而取第一段的第一句，最多 60 字。圍欄內容與引用、清單、表格等段落不取。 */
function fallbackSummary(lines) {
  const mask = fenceMask(lines);
  const text = lines.map((l, i) => (mask[i] ? '' : l)).join('\n');
  const skip = /^(>|```|~~~|-|\*|\||<!--)/;
  const para =
    text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .find((p) => p && !p.startsWith('#') && !skip.test(p)) ?? '';
  // 英文標點後要接空白才算句尾，避免切到網址與版本號（players.pokemon-card.com、8.0.0）
  const first = para.split(/(?<=[。！？])|(?<=[.!?])(?=\s)/)[0] ?? '';
  return first.length > 60 ? first.slice(0, 59) + '…' : first;
}

function adrIndex(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch (e) {
    if (e.code === 'ENOENT') fail(`找不到目錄：${dir}`);
    fail(`無法讀取目錄 ${dir}：${e.message}`);
  }
  const files = names.filter((f) => /^\d{4}-.*\.md$/.test(f)).sort();
  const rows = files.map((f) => {
    const { meta, body } = frontmatter(norm(readText(join(dir, f))), f);
    const bl = body.split('\n');
    const mask = fenceMask(bl);
    const ti = bl.findIndex((l, i) => !mask[i] && /^#\s+(.+)$/.test(l));
    const title = ti >= 0 ? bl[ti].replace(/^#\s+/, '').trim() : f;
    const rest = ti >= 0 ? bl.filter((_, i) => i !== ti) : bl;
    const status = meta['superseded-by'] ? `superseded → ${meta['superseded-by']}` : (meta.status ?? '');
    if (!meta.summary) console.error(`警告：${f} 缺少 summary，改用第一段的第一句`);
    const summary = meta.summary || fallbackSummary(rest);
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

/** raw 為原檔內容；回傳換成新目錄後的內容，換行風格（LF／CRLF）與原檔相同。 */
function withToc(raw) {
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = norm(raw).split('\n');
  const find = (mark) => lines.findIndex((l) => l.trimEnd() === mark);
  const s = find(START);
  const e = find(END);
  if (s < 0) fail(`找不到 ${START} 標記`);
  if (e < 0) fail(`找不到 ${END} 標記`);
  if (e < s) fail(`標記順序錯誤：${END} 在 ${START} 之前`);
  const scan = (ls) => {
    const mask = fenceMask(ls);
    const out = [];
    ls.forEach((l, i) => {
      const m = !mask[i] && l.match(/^##\s+(.+)$/);
      if (m) out.push({ line: i + 1, text: m[1].trim() });
    });
    return out;
  };
  // 目錄本身的行數會推移後面標題的行號：先放佔位，再以最終位置重算一次（標題數不變，行數不變）。
  const draft = renderToc(lines, s, e, scan(lines).map((h) => ({ ...h, line: 0 })));
  const ds = draft.findIndex((l) => l.trimEnd() === START);
  const de = draft.findIndex((l) => l.trimEnd() === END);
  return renderToc(draft, ds, de, scan(draft)).join('\n').replace(/\n/g, eol);
}

function main() {
  const argv = process.argv.slice(2);
  const [cmd, ...rest] = argv;
  const usage = `用法：${basename(process.argv[1])} adr [dir] [--check] | toc <file> [--check]`;
  const check = rest.includes('--check');
  const flags = rest.filter((a) => a.startsWith('-') && a !== '--check');
  if (flags.length) fail(`未知的參數：${flags.join(' ')}\n${usage}`);
  const args = rest.filter((a) => !a.startsWith('-'));
  if (rest.filter((a) => a === '--check').length > 1) fail(`--check 重複\n${usage}`);

  const emit = (path, next, prev) => {
    if (prev === next) return console.log(`${path}：已是最新`);
    if (check) {
      console.error(`${path}：索引過期，請執行 doc-index.mjs 更新`);
      process.exit(1);
    }
    writeFileSync(path, next);
    console.log(`${path}：已更新`);
  };

  if (cmd === 'adr') {
    if (args.length > 1) fail(`多餘的參數：${args.slice(1).join(' ')}\n${usage}`);
    const dir = args[0] ?? 'docs/adr';
    const out = join(dir, 'README.md');
    const next = adrIndex(dir);
    emit(out, next, existsSync(out) ? readText(out) : null);
  } else if (cmd === 'toc') {
    if (args.length < 1) fail(`缺少檔案參數\n${usage}`);
    if (args.length > 1) fail(`多餘的參數：${args.slice(1).join(' ')}\n${usage}`);
    const raw = readText(args[0]);
    emit(args[0], withToc(raw), raw);
  } else {
    fail(usage);
  }
}

try {
  main();
} catch (e) {
  console.error(e instanceof UserError ? e.message : `錯誤：${e.message}`);
  process.exit(2);
}
