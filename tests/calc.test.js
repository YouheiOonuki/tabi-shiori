// 計算ロジックのテスト: node --test tests/*.test.js
// （.github/workflows/test.yml で push・PR のたびに自動実行される）
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');

function sampleTrip() {
  return C.normalizeTrip({
    id: 'kyoto1', title: '秋の京都', sub: '家族旅行', start: '2026-10-10', end: '2026-10-12',
    members: ['父', '母', 'はな'], cover: 'city',
    days: [
      { items: [
        { time: '08:00', place: '東京駅', move: '新幹線', min: 135, memo: 'のぞみ 8号車' },
        { time: '10:30', place: '京都駅', move: 'バス', min: 30 },
        { time: '11:00', place: '清水寺', memo: '坂道注意' },
      ] },
      { items: [{ time: '09:00', place: '伏見稲荷大社' }] },
      { items: [] },
    ],
    packing: [{ name: '財布', done: true }, { name: '充電器' }],
    stays: [{ name: '京都ホテル', addr: '京都市下京区1-2', tel: '075-000-0000', checkin: '15:00', memo: '朝食つき' }],
    contacts: [{ name: '祖母', tel: '090-0000-0000', memo: '緊急時' }],
    budget: [{ name: '新幹線', amount: 42000, payer: 0 }, { name: '宿', amount: 30001, payer: 1 }, { name: 'お土産', amount: 5000 }],
    notes: '雨なら美術館へ',
    image: 'data:image/jpeg;base64,AAAA',
  });
}

// --- 正規化 ---
test('normalizeTrip: 空・不正な値でも形がそろう', () => {
  for (const v of [null, undefined, 1, 'x', [], {}]) {
    const t = C.normalizeTrip(v);
    assert.equal(typeof t.id, 'string');
    assert.equal(t.days.length, 1);
    assert.deepEqual(t.members, []);
    assert.equal(t.cover, 'mountain');
    assert.equal(t.print.credit, true);
  }
});

test('normalizeTrip: 日付・時刻・手段・分・絵柄を確かめる', () => {
  const t = C.normalizeTrip({
    start: '2026-02-30', end: '2026-10-12', cover: 'space',
    days: [{ items: [{ time: '25:00', move: 'ロケット', min: -5 }, { time: '07:05', move: '電車', min: '90' }, { min: 99999 }] }],
  });
  assert.equal(t.start, '');
  assert.equal(t.end, '2026-10-12');
  assert.equal(t.cover, 'mountain');
  assert.deepEqual(t.days[0].items.map((i) => [i.time, i.move, i.min]), [['', '', 0], ['07:05', '電車', 90], ['', '', 1440]]);
});

test('normalizeTrip: 長さと件数を切る・改行と制御文字を消す', () => {
  const t = C.normalizeTrip({
    title: 'あ'.repeat(200), members: Array.from({ length: 100 }, (_, i) => 'm' + i).concat(['', '  ']),
    days: Array.from({ length: 50 }, () => ({ items: Array.from({ length: 60 }, () => ({ place: '場\n所\u0000' })) })),
  });
  assert.equal(t.title.length, C.LIMITS.title);
  assert.equal(t.members.length, C.LIMITS.members);
  assert.equal(t.days.length, C.LIMITS.days);
  assert.equal(t.days[0].items.length, C.LIMITS.items);
  assert.equal(t.days[0].items[0].place, '場 所');
});

test('normalizeTrip: 画像は data:image の base64 で上限以内だけ', () => {
  assert.equal(C.normalizeTrip({ image: 'data:image/png;base64,iVBORw0KGgo=' }).image, 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(C.normalizeTrip({ image: 'javascript:alert(1)' }).image, '');
  assert.equal(C.normalizeTrip({ image: 'data:image/svg+xml;base64,AAAA' }).image, '');
  assert.equal(C.normalizeTrip({ image: 'data:image/jpeg;base64,' + 'A'.repeat(C.LIMITS.image) }).image, '');
});

test('normalizeTrip: 予算の金額と立て替えた人', () => {
  const t = C.normalizeTrip({ budget: [{ amount: '1200.4', payer: 2 }, { amount: -5, payer: 'x' }, { amount: 1e12 }] });
  assert.deepEqual(t.budget.map((b) => [b.amount, b.payer]), [[1200, 2], [0, -1], [99999999, -1]]);
});

test('normalizeStore: しおりが無ければ 1 つ作る・active と重複 id を直す', () => {
  const s = C.normalizeStore({ active: 'zzz', trips: [{ id: 'aaa' }, { id: 'aaa' }, { id: 'BAD ID' }] });
  assert.equal(s.v, 1);
  assert.equal(s.trips.length, 3);
  assert.equal(new Set(s.trips.map((t) => t.id)).size, 3);
  assert.equal(s.active, 'aaa');
  assert.equal(C.normalizeStore(null).trips.length, 1);
  assert.equal(C.normalizeStore({ trips: 'x' }).trips.length, 1);
});

// --- 日付 ---
test('日付: 泊数・日付の表示・日程の範囲', () => {
  assert.equal(C.nightsLabel('2026-10-10', '2026-10-12'), '2泊3日');
  assert.equal(C.nightsLabel('2026-10-10', '2026-10-10'), '日帰り');
  assert.equal(C.nightsLabel('2026-10-12', '2026-10-10'), '');
  assert.equal(C.nightsLabel('2026-10-10', ''), '');
  assert.equal(C.dateJa('2026-10-10'), '10月10日（土）');
  assert.equal(C.dayDate('2026-12-31', 1), '2027-01-01');
  assert.equal(C.dayDate('', 1), '');
  assert.equal(C.rangeJa('2026-10-10', '2026-10-12'), '2026年10月10日（土）〜12日（月）');
  assert.equal(C.rangeJa('2026-10-30', '2026-11-01'), '2026年10月30日（金）〜11月1日（日）');
  assert.equal(C.rangeJa('2026-12-30', '2027-01-02'), '2026年12月30日（水）〜2027年1月2日（土）');
  assert.equal(C.rangeJa('2026-10-10', ''), '2026年10月10日（土）');
});

// --- 移動時間 ---
test('formatMin: 時間と分', () => {
  assert.equal(C.formatMin(0), '0分');
  assert.equal(C.formatMin(45), '45分');
  assert.equal(C.formatMin(60), '1時間');
  assert.equal(C.formatMin(135), '2時間15分');
});

test('daySummary: 移動時間の合計・到着の目安・間に合うか', () => {
  const t = sampleTrip();
  const s = C.daySummary(t.days[0].items);
  assert.equal(s.total, 165);
  assert.equal(s.legs, 2);
  assert.deepEqual(s.rows[0], { arrive: '10:15', late: false, lateBy: 0 });   // 8:00 + 2:15 = 10:15 ≤ 10:30
  assert.deepEqual(s.rows[1], { arrive: '11:00', late: false, lateBy: 0 });   // ちょうど間に合う
  assert.deepEqual(s.rows[2], { arrive: '', late: false, lateBy: 0 });
  assert.equal(C.tripMoveTotal(t), 165);
});

test('daySummary: 間に合わない・時刻なし・日付をまたぐ', () => {
  const s = C.daySummary([
    { time: '10:00', min: 50 }, { time: '10:30', min: 10 }, { time: '', min: 20 }, { time: '23:30', min: 60 },
  ]);
  assert.equal(s.rows[0].late, true);
  assert.equal(s.rows[0].lateBy, 20);
  assert.equal(s.rows[1].arrive, '10:40');
  assert.equal(s.rows[1].late, false);   // 次に時刻が無いので判定しない
  assert.equal(s.rows[2].arrive, '');
  assert.equal(s.rows[3].arrive, '翌00:30');
  assert.equal(s.total, 140);
  assert.deepEqual(C.daySummary([]), { total: 0, legs: 0, rows: [] });
});

// --- 予算・割り勘 ---
test('splitEven: 1 人あたりと余り', () => {
  assert.deepEqual(C.splitEven(10000, 3), { per: 3333, remainder: 1 });
  assert.deepEqual(C.splitEven(9000, 3), { per: 3000, remainder: 0 });
  assert.deepEqual(C.splitEven(500, 0), { per: 0, remainder: 500 });
  assert.deepEqual(C.splitEven('abc', 2), { per: 0, remainder: 0 });
});

test('settle: 立て替えの精算（合計が 0・余りは先頭から・立て替えなしは除く）', () => {
  const t = sampleTrip();
  const r = C.settle(t.members.length, t.budget);
  assert.equal(r.total, 77001);
  assert.equal(r.unassigned, 5000);
  assert.deepEqual(r.share, [24001, 24000, 24000]);   // 72001 ÷ 3 = 24000 余り 1
  assert.deepEqual(r.paid, [42000, 30001, 0]);
  assert.deepEqual(r.balance, [17999, 6001, -24000]);
  assert.equal(r.balance.reduce((a, b) => a + b, 0), 0);
  assert.deepEqual(r.transfers, [{ from: 2, to: 0, amount: 17999 }, { from: 2, to: 1, amount: 6001 }]);
});

test('settle: 送金の結果、全員の差がちょうど 0 になる（乱数で 200 通り）', () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let k = 0; k < 200; k++) {
    const n = 1 + rnd(8);
    const items = Array.from({ length: rnd(10) }, () => ({ amount: rnd(50000), payer: rnd(n + 1) - 1 }));
    const r = C.settle(n, items);
    const bal = r.balance.slice();
    r.transfers.forEach((t) => { assert.ok(t.amount > 0); bal[t.from] += t.amount; bal[t.to] -= t.amount; });
    assert.ok(bal.every((b) => b === 0), JSON.stringify({ n, items }));
    assert.ok(r.transfers.length <= Math.max(0, n - 1));
  }
});

test('settle: 人数 0 でも落ちない', () => {
  const r = C.settle(0, [{ amount: 100, payer: 0 }]);
  assert.equal(r.total, 100);
  assert.deepEqual(r.transfers, []);
});

// --- easy-split ---
test('toEasySplit: easy-split の共有形式（v:1）で参加者と会計を渡す', () => {
  const d = C.toEasySplit(sampleTrip());
  assert.deepEqual(d, {
    v: 1,
    b: [['新幹線', 42000, 0, []], ['宿', 30001, 0, []], ['お土産', 5000, 0, []]],
    p: [['父', 1, null], ['母', 1, null], ['はな', 1, null]],
    o: 0, u: 'auto',
  });
  const url = C.easySplitUrl(sampleTrip(), 'https://yorozu-craft.com/easy-split/');
  const m = /^https:\/\/yorozu-craft\.com\/easy-split\/#s=([A-Za-z0-9_-]+)$/.exec(url);
  assert.ok(m, url);   // easy-split の readShareLink の正規表現と同じ文字だけ
  const json = Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  assert.deepEqual(JSON.parse(json), d);
});

test('toEasySplit: 会計は 10 件まで（残りは「その他」）、渡せないときは null', () => {
  const t = C.normalizeTrip({ members: ['a'], budget: Array.from({ length: 12 }, (_, i) => ({ name: 'x' + i, amount: 100 })) });
  const d = C.toEasySplit(t);
  assert.equal(d.b.length, 10);
  assert.deepEqual(d.b[9], ['その他', 300, 0, []]);
  assert.equal(C.toEasySplit(C.normalizeTrip({ members: [], budget: [{ amount: 1 }] })), null);
  assert.equal(C.toEasySplit(C.normalizeTrip({ members: ['a'], budget: [{ amount: 0 }] })), null);
  assert.equal(C.easySplitUrl(C.normalizeTrip({}), 'x'), '');
});

// --- 共有リンク ---
test('共有リンク: 往復で同じしおりに戻る（画像と id は入らない）', async () => {
  const t = sampleTrip();
  const s = await C.encodeShare(t, { withContacts: true });
  assert.match(s, /^z[A-Za-z0-9_-]+$/);
  const back = await C.decodeShare(s);
  const strip = (x) => Object.assign({}, x, { id: '', image: '' });
  assert.deepEqual(strip(back), strip(t));
  assert.equal(back.image, '');
});

test('共有リンク: 無圧縮でも往復できる・圧縮すると短い', async () => {
  const t = sampleTrip();
  const j = await C.encodeShare(t, { withContacts: true, compress: false });
  const z = await C.encodeShare(t, { withContacts: true });
  assert.match(j, /^j/);
  assert.ok(z.length < j.length, `${z.length} < ${j.length}`);
  assert.deepEqual((await C.decodeShare(j)).days, t.days);
});

test('共有リンク: 既定では住所・電話・連絡先を入れない', async () => {
  const back = await C.decodeShare(await C.encodeShare(sampleTrip()));
  assert.deepEqual(back.stays, [{ name: '京都ホテル', addr: '', tel: '', checkin: '15:00', memo: '朝食つき' }]);
  assert.deepEqual(back.contacts, []);
});

test('共有リンク: 印刷の設定を運ぶ', async () => {
  const t = sampleTrip();
  t.print.credit = false; t.print.budget = false;
  const back = await C.decodeShare(await C.encodeShare(t));
  assert.deepEqual(back.print, { credit: false, packing: true, stays: true, contacts: true, budget: false, notes: true });
});

test('共有リンク: 壊れたもの・ほかの形は null', async () => {
  for (const s of ['', 'z', 'x123', 'zあ', 'j' + Buffer.from('{"a":1}').toString('base64url'), 'j' + Buffer.from('[2]').toString('base64url'), 'zAAAA', 'j%%%', null, 'j' + 'A'.repeat(70000)]) {
    assert.equal(await C.decodeShare(s), null, String(s).slice(0, 20));
  }
});

test('共有リンク: 中の値も正規化される', async () => {
  const evil = [1, '<b>x</b>'.repeat(20), 1, '2026-13-01', 'x', ['a', 5, null], 99, [[['99:99', 'p', 'm', 99, -1]]], 'x', null, null, [['b', 'NaN', 7]], { a: 1 }, 'x'];
  const t = await C.decodeShare('j' + Buffer.from(JSON.stringify(evil)).toString('base64url'));
  assert.equal(t.title.length, C.LIMITS.title);
  assert.equal(t.start, '');
  assert.deepEqual(t.members, ['a', '5']);
  assert.equal(t.cover, 'none');
  assert.deepEqual(t.days[0].items[0], { time: '', place: 'p', memo: 'm', move: '', min: 0 });
  assert.deepEqual(t.budget, [{ name: 'b', amount: 0, payer: 7 }]);
  assert.equal(t.notes, '');
});

// --- 地図 ---
test('mapUrl: Google マップの検索リンク（場所名だけを入れる）', () => {
  assert.equal(C.mapUrl('清水寺'), 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('清水寺'));
  assert.equal(C.mapUrl('A&B #1'), 'https://www.google.com/maps/search/?api=1&query=A%26B%20%231');
  assert.equal(C.mapUrl('  '), '');
});

// --- 印刷: ページ分け ---
test('paginate: 順に詰める・breakBefore で改ページ', () => {
  const b = (h, o) => Object.assign({ h }, o);
  assert.deepEqual(C.paginate([b(40), b(40), b(40)], 100), [[0, 1], [2]]);
  assert.deepEqual(C.paginate([b(10), b(10, { breakBefore: true }), b(10)], 100), [[0], [1, 2]]);
  assert.deepEqual(C.paginate([b(10, { breakBefore: true })], 100), [[0]]);
  assert.deepEqual(C.paginate([], 100), []);
});

test('paginate: 見出しを最後の行に孤立させない', () => {
  const b = (h, o) => Object.assign({ h }, o);
  // 75 + 見出し 10 は入るが、見出し＋最初の行 30 は入らない → 見出しごと次のページ
  assert.deepEqual(C.paginate([b(75), b(10, { keepWithNext: true }), b(20), b(20)], 100), [[0], [1, 2, 3]]);
});

test('paginate: 1 ページより大きいまとまり・大きすぎる塊', () => {
  const b = (h, o) => Object.assign({ h }, o);
  // 見出し＋行（keepWithNext の連なり）が 1 ページを超える: 見出し＋最初の行は一緒、あとは流す
  const blocks = [b(50), b(10, { keepWithNext: true }), b(30, { keepWithNext: true }), b(30, { keepWithNext: true }), b(30, { keepWithNext: true }), b(30)];
  const pages = C.paginate(blocks, 100);
  assert.deepEqual(pages, [[0, 1, 2], [3, 4, 5]]);
  assert.deepEqual(C.paginate([b(250), b(10)], 100), [[0], [1]]);
});

// --- 印刷: 面付け ---
test('padTo4: 4 の倍数（最低 4）', () => {
  assert.deepEqual([0, 1, 4, 5, 8, 9].map(C.padTo4), [4, 4, 4, 8, 8, 12]);
});

test('imposeBooklet: 4 ページ（紙 1 枚）', () => {
  assert.deepEqual(C.imposeBooklet(4), [
    { sheet: 1, side: '表', left: 4, right: 1 },
    { sheet: 1, side: '裏', left: 2, right: 3 },
  ]);
});

test('imposeBooklet: 8 ページ（紙 2 枚）と 6 ページ（8 にそろえる）', () => {
  const order = (n) => C.imposeBooklet(n).map((s) => [s.left, s.right]);
  assert.deepEqual(order(8), [[8, 1], [2, 7], [6, 3], [4, 5]]);
  assert.deepEqual(order(6), order(8));
  assert.deepEqual(order(12), [[12, 1], [2, 11], [10, 3], [4, 9], [8, 5], [6, 7]]);
});

test('imposeBooklet: どのページも 1 回ずつ・向かい合うページの和は n+1', () => {
  for (const n of [4, 8, 12, 16, 20, 40]) {
    const all = C.imposeBooklet(n).flatMap((s) => [s.left, s.right]).sort((a, b) => a - b);
    assert.deepEqual(all, Array.from({ length: n }, (_, i) => i + 1));
    C.imposeBooklet(n).forEach((s) => assert.equal(s.left + s.right, n + 1));
  }
});

test('印刷のクレジットは紙から来た人の着地ページ /tabi-shiori/print/ に向ける', () => {
  assert.equal(C.CREDIT, 'yorozu-craft.com/tabi-shiori/print/ で作成');
  // 既定で表示（設定で外せる）
  assert.equal(C.emptyTrip().print.credit, true);
});
