// しおりの上限の知らせ（D578、yorozu-plans QUEUE Q-717）: alert( で出さず、押したボタンの行のすぐ後の p.field-error に同じ字で出す
// main.js の limitMsg をそのまま切り出し、偽の要素で、出す・消すを見る（テストに DOM は無い）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../calc.js');

const ROOT = path.join(__dirname, '..');
const MAIN = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// 3 つの文は今のまま（1 字も変えない）。main.js の式を C.LIMITS.trips = 30 で読んだ字
const NEW = 'しおりは 30 件までです。使わないしおりを削除してください。';
const DUP = 'しおりは 30 件までです。';
const SAVE = 'しおりは 30 件までです。使わないしおりを削除してから保存してください。';

function loadLimitMsg() {
  const m = MAIN.match(/\n  function limitMsg\(id, text\) \{[\s\S]*?\n  \}\n/);
  assert.ok(m, 'main.js に limitMsg が無い');
  const els = { 'trip-limit': { textContent: '', hidden: true }, 'shared-limit': { textContent: '', hidden: true } };
  const fn = new Function('$', m[0] + '\nreturn limitMsg;')((id) => els[id]);
  return { fn, els };
}
// ボタンの中の 1 行（limitMsg の呼び出し）を切り出し、data.trips の数を変えて動かす
function runGuard(btn, id, n) {
  const re = new RegExp(`\\$\\('${btn}'\\)\\.addEventListener\\('click', function \\(\\) \\{\\n(?:    if \\(!shared\\) return;\\n)?    (if \\(limitMsg\\('${id}', [^\\n]*\\)\\) return;)\\n`);
  const m = MAIN.match(re);
  assert.ok(m, `${btn} の中に limitMsg('${id}', …) の 1 行が無い`);
  const { fn, els } = loadLimitMsg();
  const stopped = new Function('limitMsg', 'C', 'data', m[1].replace(/ return;$/, ' return true; return false;'))(fn, C, { trips: Array(n).fill({}) });
  return { stopped, el: els[id] };
}

test('上限の判定: 29 件までは足せる、30 件で止める', () => {
  assert.equal(C.LIMITS.trips, 30);
  assert.equal(C.tripsFull(29), false);
  assert.equal(C.tripsFull(30), true);
  assert.equal(C.tripsFull(31), true);
});

test('main.js は alert( を呼ばない', () => {
  assert.equal((MAIN.match(/\balert\(/g) || []).length, 0);
});

test('置き場: 押したボタンの行のすぐ後に p.field-error（role="alert"、空の間は hidden）', () => {
  assert.match(INDEX, /id="trip-del" class="btn">削除する<\/button>\s*<\/div>\s*<p id="trip-limit" class="field-error" role="alert" hidden><\/p>\s*<\/section>/);
  assert.match(INDEX, /id="shared-new" class="btn">自分のしおりを作る<\/a>\s*<\/div>\s*<p id="shared-limit" class="field-error" role="alert" hidden><\/p>\s*<\/div>/);
});

for (const [btn, id, text] of [['trip-new', 'trip-limit', NEW], ['trip-dup', 'trip-limit', DUP], ['shared-save', 'shared-limit', SAVE]]) {
  test(`${btn}: 30 件なら止めて同じ字を出し、29 件なら止めずに消す`, () => {
    const full = runGuard(btn, id, 30);
    assert.equal(full.stopped, true);
    assert.equal(full.el.textContent, text);
    assert.equal(full.el.hidden, false);
    const ok = runGuard(btn, id, 29);
    assert.equal(ok.stopped, false);
    assert.equal(ok.el.textContent, '');
    assert.equal(ok.el.hidden, true);
  });
}

test('limitMsg: 出したあと空の字で消える', () => {
  const { fn, els } = loadLimitMsg();
  assert.equal(fn('trip-limit', DUP), true);
  assert.equal(els['trip-limit'].hidden, false);
  assert.equal(fn('trip-limit', ''), false);
  assert.equal(els['trip-limit'].textContent, '');
  assert.equal(els['trip-limit'].hidden, true);
});

test('main.js の結び: 上限を外れた描画で両方を消す', () => {
  assert.match(MAIN, /if \(!C\.tripsFull\(data\.trips\.length\)\) \{ limitMsg\('trip-limit', ''\); limitMsg\('shared-limit', ''\); \}/);
});
