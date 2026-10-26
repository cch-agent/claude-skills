#!/usr/bin/env node
// 會持續增長的紀錄文件的索引工具（無相依套件，Node ≥ 18）。
//
//   doc-index.mjs adr [dir] [--check]
//     由 dir（預設 docs/adr）底下每篇 NNNN-*.md 的 frontmatter 與標題產生 dir/README.md。
//   doc-index.mjs toc <file> [--check]
//     把 file 內 <!-- toc:start --> 與 <!-- toc:end --> 之間換成 `##` 標題清單（附行號），
//     讓 AI 讀到 <!-- toc:end --> 為止，再用 offset 只讀需要的那一節。
//
//   doc-index.mjs work <dir> <progress檔> [--check]
//     由 dir（context/work）底下每份 *.md 的 frontmatter（status、branch、summary）產生進行中清單，
//     寫進 progress檔 內 <!-- work:start --> 與 <!-- work:end --> 之間，每份一行，依檔名排序。
//   doc-index.mjs status
//     回報 context/progress.md 的版型（有 <!-- doc-index:layout=2 --> 為 2，否則 1）與升級到 2 尚缺的項目。
//
// --check：只比對，不寫檔；內容過期時 exit 1。
// exit code：0 正常；1 --check 發現索引過期；2 錯誤（參數、檔案、標記、frontmatter 格式）。
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename, dirname, relative } from 'node:path';

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
    const status = meta['superseded-by'] ? `已被 ${meta['superseded-by']} 取代` : (meta.status ?? '');
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

/** 整行（忽略行尾空白）等於 mark 的第一行索引，找不到為 -1。 */
function markerIndex(lines, mark) {
  return lines.findIndex((l) => l.trimEnd() === mark);
}

/** raw 為原檔內容；回傳換成新目錄後的內容，換行風格（LF／CRLF）與原檔相同。 */
function withToc(raw) {
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = norm(raw).split('\n');
  const s = markerIndex(lines, START);
  const e = markerIndex(lines, END);
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

const WSTART = '<!-- work:start -->';
const WEND = '<!-- work:end -->';
const LAYOUT2 = '<!-- doc-index:layout=2 -->';

/** 找出 start／end 標記所在行（以整行比對）；回傳 { s, e }，缺漏為 -1。 */
function markerLines(lines, start, end) {
  return { s: markerIndex(lines, start), e: markerIndex(lines, end) };
}

/** raw 為 progress 檔內容；把 work 標記之間換成 rows，換行風格不變。 */
function withWork(raw, rows) {
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = norm(raw).split('\n');
  const { s, e } = markerLines(lines, WSTART, WEND);
  if (s < 0) fail(`找不到 ${WSTART} 標記`);
  if (e < 0) fail(`找不到 ${WEND} 標記`);
  if (e < s) fail(`標記順序錯誤：${WEND} 在 ${WSTART} 之前`);
  return [...lines.slice(0, s + 1), ...rows, ...lines.slice(e)].join('\n').replace(/\n/g, eol);
}

function workRows(dir, progressPath) {
  let names;
  try {
    names = readdirSync(dir);
  } catch (e) {
    if (e.code === 'ENOENT') fail(`找不到目錄：${dir}`);
    fail(`無法讀取目錄 ${dir}：${e.message}`);
  }
  const rel = relative(dirname(progressPath), dir).split('\\').join('/');
  return names
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const { meta } = frontmatter(norm(readText(join(dir, f))), f);
      if (!meta.summary) console.error(`警告：${f} 缺少 summary`);
      else if ([...meta.summary].length > 60) console.error(`警告：${f} 的 summary 超過 60 字`);
      const link = rel && rel !== '.' ? `${rel}/${f}` : f;
      const field = (v) => cell(v ?? '') || '-';
      return `- [${f.slice(0, -3)}](${link}) · ${field(meta.status)} · ${field(meta.branch)} · ${field(meta.summary)}`;
    });
}

/** 回報版型與升級到 2 尚缺的項目；exit 0 無缺項、1 有缺項、2 找不到 progress.md。 */
function status() {
  const lines = norm(readText('context/progress.md')).split('\n');
  const has = (mark) => markerIndex(lines, mark) >= 0;
  const layout = has(LAYOUT2) ? 2 : 1;
  const missing = [];
  if (layout === 1) missing.push(`context/progress.md 缺 ${LAYOUT2} 標記`);
  const { s, e } = markerLines(lines, WSTART, WEND);
  if (s < 0) missing.push(`context/progress.md 缺 ${WSTART} 標記`);
  if (e < 0) missing.push(`context/progress.md 缺 ${WEND} 標記`);
  if (s >= 0 && e >= 0 && e < s) missing.push(`${WEND} 在 ${WSTART} 之前，順序相反`);
  if (!existsSync('context/work')) missing.push('缺 context/work/ 目錄');
  console.log(`版型 ${layout}`);
  if (!missing.length) return console.log('無缺項');
  console.log('尚缺：');
  missing.forEach((m) => console.log(`- ${m}`));
  process.exit(1);
}

function main() {
  const argv = process.argv.slice(2);
  const [cmd, ...rest] = argv;
  const usage = `用法：${basename(process.argv[1])} adr [dir] [--check] | toc <file> [--check] | work <dir> <progress檔> [--check] | status`;
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
  } else if (cmd === 'work') {
    if (args.length < 2) fail(`缺少參數：work <dir> <progress檔>\n${usage}`);
    if (args.length > 2) fail(`多餘的參數：${args.slice(2).join(' ')}\n${usage}`);
    const raw = readText(args[1]);
    emit(args[1], withWork(raw, workRows(args[0], args[1])), raw);
  } else if (cmd === 'status') {
    if (rest.length) fail(`status 不接受參數\n${usage}`);
    status();
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
