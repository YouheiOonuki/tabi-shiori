// 範囲の数を、HTML の属性・使い方の文・README で、芯（calc.js の LIMITS・DAY_MIN・BAND_MIN_SPAN）と突き合わせる（Q-423。Q-366 の型）
// index.html の属性と文は直書きのまま持ち、ここで芯と結ぶ。芯は変えない側。文を書き換えたら、ここの拾い方も合わせる
// main.js が描く欄の maxlength・max と、入力の切り詰めは芯から取るので、直書きが戻っていないかも見る
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../calc.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const INDEX = read('index.html');
const GUIDE = read('guide.html');
const README = read('README.md');
const MAIN = read('main.js');
const L = C.LIMITS;

function attr(html, id, name) {
  const tag = html.match(new RegExp(`<(?:input|textarea)[^>]*\\bid="${id}"[^>]*>`));
  assert.ok(tag, `#${id} が無い`);
  const m = tag[0].match(new RegExp(`\\b${name}="(\\d+)"`));
  assert.ok(m, `#${id} に ${name} が無い`);
  return Number(m[1]);
}
function numsIn(text, re, where, count) {
  const found = [...text.matchAll(re)].map((m) => Number(m[1]));
  assert.equal(found.length, count, `${where}: ${re} の数`);
  return found;
}

test('index.html の maxlength: 題・副題・持ち物・メモは芯の字数', () => {
  assert.equal(attr(INDEX, 'f-title', 'maxlength'), L.title);
  assert.equal(attr(INDEX, 'f-sub', 'maxlength'), L.sub);
  assert.equal(attr(INDEX, 'pack-new', 'maxlength'), L.name);
  assert.equal(attr(INDEX, 'f-notes', 'maxlength'), L.notes);
});

test('文の中の数: しおりの件数は LIMITS.trips（使い方・画面・README）', () => {
  const all = [
    ...numsIn(GUIDE, /複数（(\d+) 件まで）/g, 'guide.html', 1),
    ...numsIn(INDEX, /しおりは (\d+) 件まで/g, 'index.html', 2),
    ...numsIn(README, /複数（(\d+) 件まで）/g, 'README.md', 1),
  ];
  for (const n of all) assert.equal(n, L.trips);
});

test('文の中の数: バックアップの上限 1MB は BACKUP_MAX_BYTES（画面の字・README）', () => {
  const all = [
    ...numsIn(MAIN, /(\d+)MB/g, 'main.js', 2),
    ...numsIn(README, /(\d+)MB まで/g, 'README.md', 1),
  ];
  for (const n of all) assert.equal(n * 1024 * 1024, C.BACKUP_MAX_BYTES);
});

test('main.js は欄の maxlength・max と切り詰めを芯から取る（直書きの数が無い）', () => {
  assert.doesNotMatch(MAIN, /maxlength="\d/);
  assert.doesNotMatch(MAIN, /\bmax="\d/);
  assert.doesNotMatch(MAIN, /Math\.min\(\d{2,},/);   // Math.min(1, …) は縮尺で、範囲の数ではない
  assert.doesNotMatch(MAIN, /\.slice\(0, \d+\)/);
  assert.match(MAIN, /max="' \+ C\.LIMITS\.moveMin \+ '"/);
});

test('移動の分の上限は 1 日（DAY_MIN）で、芯の正規化もそこで切る', () => {
  assert.equal(L.moveMin, C.DAY_MIN);
  const t = C.normalizeTrip({ days: [{ items: [{ min: C.DAY_MIN + 5 }] }], budget: [{ name: 'a', amount: L.amount + 5 }] });
  assert.equal(t.days[0].items[0].min, C.DAY_MIN);
  assert.equal(t.budget[0].amount, L.amount);
});

test('時刻の帯: 右端は DAY_MIN（24 時）で切り、幅の下限は BAND_MIN_SPAN', () => {
  assert.equal(C.DAY_MIN, 24 * 60);
  assert.equal(C.BAND_MIN_SPAN, 60);
  const narrow = C.dayBand([{ time: '10:00' }, { time: '10:10' }]);
  assert.equal(narrow.to - narrow.from, C.BAND_MIN_SPAN);
  const late = C.dayBand([{ time: '23:30', min: 120 }, { time: '23:50' }]);
  assert.equal(late.to, C.DAY_MIN);
  assert.equal(late.clipped, true);
});
