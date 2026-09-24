// 自由ページ（見出し＋本文。決定 D61）のテスト: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');

const LONG = ('旅の注意。集合は駅の北口、時間厳守でお願いします。' + '\n').repeat(80).slice(0, 2000);

function tripWithFree() {
  return C.normalizeTrip({
    title: '京都', days: [{ items: [{ time: '09:00', place: '京都駅' }] }],
    freePages: [
      { id: 'p1', title: 'はじめに', body: 'たのしもう\n2 行目', place: 'before' },
      { id: 'p2', title: '注意', body: LONG, place: 'after' },
      { id: 'p3', title: '', body: '', place: 'after' },
      { id: 'p4', title: '宿題', body: '', place: 'before' },
    ],
  });
}

// --- 正規化 ---
test('自由ページ: 古い保存データ（freePages なし）はそのまま読めて、空の一覧になる', () => {
  const old = { id: 'abc', title: '古いしおり', notes: 'メモ', print: { credit: false, packing: true, stays: true, contacts: true, budget: true, notes: false } };
  const t = C.normalizeTrip(old);
  assert.deepEqual(t.freePages, []);
  assert.equal(t.title, '古いしおり');
  assert.equal(t.notes, 'メモ');
  assert.deepEqual(t.print, { credit: false, packing: true, stays: true, contacts: true, budget: true, notes: false, free: true });
  const s = C.normalizeStore({ v: 1, active: 'abc', trips: [old] });
  assert.equal(s.active, 'abc');
  assert.deepEqual(s.trips[0].freePages, []);
});

test('自由ページ: 長さ・件数・場所・id を確かめる（改行は本文だけ残す）', () => {
  const t = C.normalizeTrip({
    freePages: Array.from({ length: 25 }, (_, i) => ({ id: i === 0 ? 'BAD ID' : 'p' + i, title: 'あ\nい'.repeat(30), body: 'x\r\ny'.repeat(900), place: i === 1 ? 'before' : 'middle' })),
  });
  assert.equal(t.freePages.length, C.LIMITS.freePages);
  const f = t.freePages[0];
  assert.equal(f.title.length, 40);
  assert.ok(!/\n/.test(f.title));
  assert.equal(f.body.length <= 2000, true);
  assert.ok(/x\ny/.test(f.body) && !/\r/.test(f.body));
  assert.match(f.id, /^[a-z0-9]{1,16}$/);
  assert.notEqual(f.id, 'BAD ID');
  assert.equal(t.freePages[1].id, 'p1');
  assert.equal(t.freePages[1].place, 'before');
  assert.equal(t.freePages[2].place, 'after');
  assert.deepEqual(C.normalizeTrip({ freePages: 'x' }).freePages, []);
  assert.deepEqual(C.normalizeTrip({ freePages: [null, 3] }).freePages.map((x) => [x.title, x.body, x.place]), [['', '', 'after'], ['', '', 'after']]);
});

// --- 共有リンク・バックアップ ---
test('自由ページ: 共有リンクで往復する（id は付け直す）', async () => {
  const t = tripWithFree();
  for (const compress of [true, false]) {
    const back = await C.decodeShare(await C.encodeShare(t, { compress }));
    const strip = (x) => x.freePages.map((f) => [f.title, f.body, f.place]);
    assert.deepEqual(strip(back), strip(t));
    assert.equal(back.freePages[1].body.length, 2000);
    assert.equal(back.print.free, true);
  }
  t.print.free = false;
  assert.equal((await C.decodeShare(await C.encodeShare(t))).print.free, false);
});

test('自由ページ: 前からの共有リンク（14 項目・自由ページなし）も読める', async () => {
  // 自由ページを足す前の packTrip の形（印刷の設定は 6 ビット）
  const old = [1, '古いリンク', '', '2026-10-10', '2026-10-11', ['父'], 1, [[['09:00', '京都駅', '', 2, 30]]], [['財布', 1]], [], [], [['宿', 1000, 0]], 'メモ', 1 | 2 | 32];
  const back = await C.decodeShare('j' + Buffer.from(JSON.stringify(old)).toString('base64url'));
  assert.equal(back.title, '古いリンク');
  assert.deepEqual(back.freePages, []);
  assert.deepEqual(back.print, { credit: true, packing: true, stays: false, contacts: false, budget: false, notes: true, free: true });
  assert.equal(back.days[0].items[0].move, '電車');
});

test('自由ページ: バックアップファイルで往復する', () => {
  const data = { trips: C.normalizeStore({ trips: [tripWithFree()] }) };
  const text = JSON.stringify(C.buildBackup('tabi-shiori', data), null, 2);
  const r = C.parseBackup(text, 'tabi-shiori', ['trips']);
  assert.equal(r.ok, true);
  const back = C.normalizeStore(r.data.trips);
  assert.deepEqual(back.trips[0].freePages, data.trips.trips[0].freePages);
  assert.equal(back.trips[0].freePages[0].id, 'p1');
});

// --- 印刷の順 ---
test('freeOrder: 行程の前・後ろに分け、入力の順を保つ（空のページと印刷しない設定は除く）', () => {
  const t = tripWithFree();
  const o = C.freeOrder(t);
  assert.deepEqual(o.before.map((f) => f.id), ['p1', 'p4']);
  assert.deepEqual(o.after.map((f) => f.id), ['p2']);
  t.print.free = false;
  assert.deepEqual(C.freeOrder(t), { before: [], after: [] });
});

// --- 折り返し ---
test('wrapText: 全角 1・半角 0.5 で折る・改行と空行を保つ', () => {
  assert.deepEqual(C.wrapText('あいうえおかき', 3), ['あいう', 'えおか', 'き']);
  assert.deepEqual(C.wrapText('abcdefg', 2), ['abcd', 'efg']);
  assert.deepEqual(C.wrapText('あ\n\nい', 10), ['あ', '', 'い']);
  assert.deepEqual(C.wrapText('', 10), ['']);
  // 行頭に「。」「ー」などを置かない
  assert.deepEqual(C.wrapText('あいう。えお', 3), ['あい', 'う。え', 'お']);
  assert.deepEqual(C.wrapText('アレルギー', 4), ['アレル', 'ギー']);
  C.wrapText(LONG, 45).forEach((ln) => assert.ok(!/^[、。ー]/.test(ln), ln));
  assert.equal(C.wrapText(LONG, 40).join(''), LONG.replace(/\n/g, ''));
  C.wrapText(LONG, 40).forEach((ln) => assert.ok(ln.length <= 40));
});

// --- ページ分け（main.js の buildBlocks と同じ形の塊で確かめる） ---
// 自由ページは [「（つづき）」の見出し(skip), 見出し(breakBefore・keepWithNext), 本文の行(cont)...]、
// そのあとの塊は breakBefore
function freeBlocks(title, lines, h) {
  const B = [];
  const cont = B.length;
  B.push({ h: h.head, skip: true, name: title + '（つづき）' });
  B.push({ h: h.head, breakBefore: true, keepWithNext: lines.length > 0, name: title });
  lines.forEach((ln, i) => B.push({ h: h.line, cont, name: title + ':' + i }));
  return B;
}

test('paginate: 2,000 字の本文は複数ページに分かれ、どの行も落ちず、つづきの見出しが付く', () => {
  const h = { head: 40, line: 22 };
  const cap = 990;   // A4 の本文の高さの目安（px）
  const lines = C.wrapText(LONG, 45);
  const blocks = [
    ...freeBlocks('はじめに', ['たのしもう'], h),
    { h: 40, breakBefore: true, keepWithNext: true, name: '1日目' }, { h: 30, name: '京都駅' },
    ...freeBlocks('注意', lines, h).map((b) => (b.cont !== undefined ? { ...b, cont: b.cont + 5 } : b)),
    { h: 40, breakBefore: true, keepWithNext: true, name: '持ち物' }, { h: 20, name: '財布' },
  ];
  const pages = C.paginate(blocks, cap);
  const names = pages.map((p) => p.map((k) => blocks[k].name));
  assert.deepEqual(names[0], ['はじめに', 'はじめに:0']);
  assert.deepEqual(names[1], ['1日目', '京都駅']);
  assert.equal(names[2][0], '注意');
  assert.ok(pages.length >= 5, String(pages.length));   // 前 1・行程 1・注意 2 以上・持ち物 1
  const noteLines = names.flat().filter((n) => /^注意:/.test(n));
  assert.deepEqual(noteLines, lines.map((_, i) => '注意:' + i));   // 全行が順に 1 回ずつ
  const contPages = names.filter((p) => p[0] === '注意（つづき）');
  assert.equal(contPages.length, pages.length - 4);
  assert.deepEqual(names[names.length - 1], ['持ち物', '財布']);
  pages.forEach((p) => assert.ok(p.reduce((s, k) => s + blocks[k].h, 0) <= cap));   // はみ出さない
  assert.ok(!names.flat().includes('はじめに（つづき）'));
});

test('paginate: skip の塊は順に置かず、keepWithNext もまたがない', () => {
  const pages = C.paginate([{ h: 10, keepWithNext: true }, { h: 10, skip: true }, { h: 10 }], 100);
  assert.deepEqual(pages, [[0, 2]]);
  // cont: ページの先頭になった行の前にだけ見出しを置く
  const b = [{ h: 10, skip: true }, { h: 10, breakBefore: true, keepWithNext: true }, { h: 40, cont: 0 }, { h: 40, cont: 0 }, { h: 40, cont: 0 }];
  assert.deepEqual(C.paginate(b, 100), [[1, 2, 3], [0, 4]]);
});

test('imposeBooklet: 自由ページで奇数ページになっても 4 の倍数にそろえて全ページを 1 回ずつ置く', () => {
  for (const n of [5, 7, 9, 11, 13]) {
    const sides = C.imposeBooklet(n);
    const total = C.padTo4(n);
    assert.equal(sides.length, total / 2);
    const all = sides.flatMap((s) => [s.left, s.right]).sort((a, b) => a - b);
    assert.deepEqual(all, Array.from({ length: total }, (_, i) => i + 1));
    assert.deepEqual([sides[0].left, sides[0].right], [total, 1]);
  }
  assert.deepEqual(C.imposeBooklet(5).map((s) => [s.left, s.right]), [[8, 1], [2, 7], [6, 3], [4, 5]]);
});
