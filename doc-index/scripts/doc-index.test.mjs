// node --test doc-index/scripts/doc-index.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'doc-index.mjs');
const START = '<!-- work:start -->';
const END = '<!-- work:end -->';
const L2 = '<!-- doc-index:layout=2 -->';

/** 建立暫存專案：files 為 { 相對路徑: 內容 }。 */
function project(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'doc-index-'));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  return root;
}
const run = (root, ...args) => {
  const r = spawnSync('node', [SCRIPT, ...args], { cwd: root, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const progress = (middle = '') => `# P\n\n${L2}\n\n${START}\n${middle}${END}\n\n尾巴\n`;
const wf = (fields) => `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n內文\n`;
const WORK = ['work', 'context/work', 'context/progress.md'];
const between = (root) => {
  const t = readFileSync(join(root, 'context/progress.md'), 'utf8').split('\n');
  return t.slice(t.indexOf(START) + 1, t.indexOf(END));
};

test('work：單一 work 檔寫出一行，含連結、status、branch、summary（R1 R1a R2 R3 R3a R3b）', () => {
  const root = project({
    'context/progress.md': progress(),
    'context/work/a.md': wf({ status: 'doing', branch: 'feat/a', summary: '做A' })
  });
  const r = run(root, ...WORK);
  assert.equal(r.code, 0);
  const lines = between(root);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /\(work\/a\.md\)/);
  for (const s of ['doing', 'feat/a', '做A']) assert.ok(lines[0].includes(s), s);
});

test('work：兩份依檔名排序（R4 R4a）', () => {
  const root = project({
    'context/progress.md': progress(),
    'context/work/b.md': wf({ summary: 'B' }),
    'context/work/a.md': wf({ summary: 'A' })
  });
  assert.equal(run(root, ...WORK).code, 0);
  const lines = between(root);
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes('work/a.md') && lines[1].includes('work/b.md'));
});

test('work：空目錄 exit 0 且標記間無行（R5 R5a）', () => {
  const root = project({ 'context/progress.md': progress('- 舊行\n') });
  mkdirSync(join(root, 'context/work'));
  assert.equal(run(root, ...WORK).code, 0);
  assert.deepEqual(between(root), []);
});

test('work：標記區塊外一字不動（R6）', () => {
  const root = project({
    'context/progress.md': progress(),
    'context/work/a.md': wf({ summary: 'A' })
  });
  const before = readFileSync(join(root, 'context/progress.md'), 'utf8');
  run(root, ...WORK);
  const after = readFileSync(join(root, 'context/progress.md'), 'utf8');
  const cut = (t) => [t.slice(0, t.indexOf(START) + START.length), t.slice(t.indexOf(END))];
  assert.deepEqual(cut(after), cut(before));
});

test('work --check：過期 exit 1 且不寫檔；一致 exit 0（R7 R8 R9）', () => {
  const root = project({
    'context/progress.md': progress(),
    'context/work/a.md': wf({ summary: 'A' })
  });
  const p = join(root, 'context/progress.md');
  const before = readFileSync(p, 'utf8');
  assert.equal(run(root, ...WORK, '--check').code, 1);
  assert.equal(readFileSync(p, 'utf8'), before);
  run(root, ...WORK);
  assert.equal(run(root, ...WORK, '--check').code, 0);
  writeFileSync(join(root, 'context/work/c.md'), wf({ summary: 'C' }));
  assert.equal(run(root, ...WORK, '--check').code, 1);
});

test('work：標記缺漏或順序相反 exit 2（R10 R11）', () => {
  const w = { 'context/work/a.md': wf({ summary: 'A' }) };
  let root = project({ ...w, 'context/progress.md': `# P\n${START}\n` });
  assert.equal(run(root, ...WORK).code, 2);
  root = project({ ...w, 'context/progress.md': `# P\n${END}\n${START}\n` });
  assert.equal(run(root, ...WORK).code, 2);
});

test('work：summary 缺或超過 60 字警告但 exit 0；60 字無警告（R12 R12a-d）', () => {
  const mk = (fields) => project({ 'context/progress.md': progress(), 'context/work/a.md': wf(fields) });
  let r = run(mk({ status: 'todo' }), ...WORK);
  assert.equal(r.code, 0);
  assert.ok(r.err.includes('a.md'));
  r = run(mk({ summary: '字'.repeat(61) }), ...WORK);
  assert.equal(r.code, 0);
  assert.ok(r.err.includes('a.md'));
  r = run(mk({ summary: '字'.repeat(60) }), ...WORK);
  assert.equal(r.err, '');
});

test('work：branch 留空仍寫一行（R13）', () => {
  const root = project({
    'context/progress.md': progress(),
    'context/work/a.md': '---\nstatus: todo\nbranch:\nsummary: A\n---\n'
  });
  assert.equal(run(root, ...WORK).code, 0);
  assert.equal(between(root).length, 1);
});

test('work：summary 跨多行 exit 2（R14）', () => {
  const root = project({
    'context/progress.md': progress(),
    'context/work/a.md': '---\nstatus: todo\nsummary: >\n  很長\n---\n'
  });
  assert.equal(run(root, ...WORK).code, 2);
});

test('status：無版型標記回報版型 1 並列出缺項（R15 R15a R16 R17）', () => {
  const root = project({ 'context/progress.md': '# P\n' });
  const r = run(root, 'status');
  assert.equal(r.code, 1);
  assert.match(r.out, /版型 1/);
  assert.ok(r.out.includes('doc-index:layout=2'));
  assert.ok(r.out.includes('work:start'));
  assert.ok(r.out.includes('context/work/'));
});

test('status：版型 2 齊備 exit 0，300 行也一樣（R18 R19 R19a）', () => {
  const root = project({ 'context/progress.md': progress('x\n') + '行\n'.repeat(300) });
  mkdirSync(join(root, 'context/work'));
  const r = run(root, 'status');
  assert.equal(r.code, 0);
  assert.match(r.out, /版型 2/);
});

test('status：版型 2 缺 work:start exit 1；沒有 progress.md exit 2（R19b R19c）', () => {
  const root = project({ 'context/progress.md': `# P\n${L2}\n${END}\n` });
  mkdirSync(join(root, 'context/work'));
  const r = run(root, 'status');
  assert.equal(r.code, 1);
  assert.ok(r.out.includes('work:start'));
  assert.equal(run(project(), 'status').code, 2);
});

test('usage 含 work 與 status（R20 R21）', () => {
  const r = run(project(), 'nope');
  assert.equal(r.code, 2);
  assert.ok(r.err.includes('work <dir> <progress檔>'));
  assert.ok(r.err.includes('status'));
});
