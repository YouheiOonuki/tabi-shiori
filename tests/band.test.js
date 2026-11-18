// 1 日の時刻の帯（dayBand）のテスト: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' ≠ ' + b);

test('dayBand: 間に合う日（範囲・目盛り・印・移動の帯）', () => {
  const b = C.dayBand([
    { time: '08:00', place: '東京駅', min: 135 },
    { time: '10:30', place: '京都駅', min: 30 },
    { time: '11:00', place: '清水寺' },
  ]);
  assert.equal(b.from, 480);
  assert.equal(b.to, 660);   // 最後の予定 11:00 と最後の到着 11:00 の遅いほう
  assert.equal(b.clipped, false);
  assert.deepEqual(b.ticks, [480, 540, 600, 660]);
  assert.deepEqual(b.marks.map((m) => [m.i, m.n]), [[0, 1], [1, 2], [2, 3]]);
  near(b.marks[1].x, 150 / 180);
  assert.equal(b.moves.length, 2);
  near(b.moves[0].x1, 0); near(b.moves[0].x2, 135 / 180);
  assert.deepEqual(b.overlaps, []);
});

test('dayBand: 間に合わない所は、次の予定の時刻から到着の目安まで', () => {
  const b = C.dayBand([
    { time: '09:00', min: 80 },   // 着 10:20、次は 10:00 → 20 分重なる
    { time: '10:00', min: 30 },
    { time: '11:00' },
  ]);
  const s = C.daySummary([{ time: '09:00', min: 80 }, { time: '10:00', min: 30 }, { time: '11:00' }]);
  assert.equal(s.rows[0].late, true);
  assert.equal(b.overlaps.length, 1);
  assert.equal(b.overlaps[0].i, 0);
  near(b.overlaps[0].x1, 60 / 120);
  near(b.overlaps[0].x2, 80 / 120);
});

test('dayBand: 時刻の無い予定は置かない（並びの番号は行の番号のまま）', () => {
  const b = C.dayBand([
    { time: '09:00', min: 30 },
    { time: '', place: '昼ごはん', min: 20 },
    { time: '13:00' },
  ]);
  assert.deepEqual(b.marks.map((m) => m.n), [1, 3]);
  assert.equal(b.moves.length, 1);   // 時刻の無い予定からの移動は、出る時刻が分からないので置かない
  assert.equal(b.to, 780);
});

test('dayBand: 時刻のある予定が 1 つ以下なら null', () => {
  assert.equal(C.dayBand([]), null);
  assert.equal(C.dayBand([{ time: '09:00', min: 60 }]), null);
  assert.equal(C.dayBand([{ time: '09:00', min: 60 }, { time: '' }]), null);
});

test('dayBand: 24 時を超える到着は右端で切る', () => {
  const b = C.dayBand([
    { time: '22:00', min: 30 },
    { time: '23:00', min: 90 },   // 着 翌0:30
    { time: '' },
  ]);
  assert.equal(b.to, 1440);
  assert.equal(b.clipped, true);
  assert.equal(b.moves[1].clipped, true);
  near(b.moves[1].x2, 1);
  assert.deepEqual(b.ticks, [1320, 1380, 1440]);
});

test('dayBand: 同じ時刻が 2 つ（同じ位置に重ねる。幅は 60 分に広げる）', () => {
  const b = C.dayBand([{ time: '10:00' }, { time: '10:00' }]);
  assert.equal(b.from, 600);
  assert.equal(b.to, 660);
  assert.equal(b.marks.length, 2);
  near(b.marks[0].x, 0); near(b.marks[1].x, 0);
  const late = C.dayBand([{ time: '23:30' }, { time: '23:30' }]);
  assert.equal(late.to, 1440);
  assert.equal(late.from, 1380);
});

test('dayBand: 到着の目安は daySummary と同じ', () => {
  const items = [{ time: '07:15', min: 47 }, { time: '08:10', min: 125 }, { time: '10:30' }];
  const b = C.dayBand(items), s = C.daySummary(items);
  b.moves.forEach((mv) => near(b.from + mv.x2 * (b.to - b.from), s.rows[mv.i].at));
});

test('bandLabelStep: 字の間が 24px 以上になる最小の 1・2・3・4・6 時間（Q-396）', () => {
  // 390 幅の帯はおよそ 275px（Q-396 で測った値: 16 時間の日で 1 時間 17.2px）
  assert.equal(C.bandLabelStep(275, 600, 840), 1);    // 4 時間: 68.8px
  assert.equal(C.bandLabelStep(275, 540, 1020), 1);   // 8 時間: 34.4px
  assert.equal(C.bandLabelStep(275, 360, 1320), 2);   // 16 時間: 17.2px → 2 時間おき 34.4px
  assert.equal(C.bandLabelStep(275, 0, 1440), 3);     // 24 時間: 11.5px → 3 時間おき 34.4px
  assert.equal(C.bandLabelStep(560, 0, 1440), 2);     // 1,280 幅でも 24 時間なら 23.3px → 2 時間おき
  assert.equal(C.bandLabelStep(60, 0, 1440), 6);      // 6 時間おきでも狭ければ 6
  for (const px of [100, 200, 275, 560, 900]) for (const h of [4, 8, 16, 24]) {
    const st = C.bandLabelStep(px, 0, h * 60);
    if (st < 6) assert.ok(st * px / h >= 24, px + 'px ' + h + ' 時間');
  }
});

test('帯の印はリンク（href はその予定の「場所・予定」の欄）。Tab で止まり、押すと欄へ（Q-396）', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(src, /<a class="band-mark" href="#d' \+ di \+ 'i' \+ m\.i \+ 'p"/);
  assert.match(src, /id="' \+ id \+ 'p" data-p="' \+ base \+ 'place"/);   // 欄の id と同じ形
  assert.match(src, /case 'band-go':\s*e\.preventDefault\(\);/);
  assert.doesNotMatch(src, /class="band-svg"[^>]*role="img"/);   // img の中のリンクは読み上げに出ないので group
  assert.match(src, /class="band-svg"[^']*role="group" aria-label="' \+ esc\(label\)/);
});

// ---- 帯の印を動かして時刻を変える（Q-510） ----

test('BAND_MOVE は 5 分・30 分・8 px（QUEUE Q-510 の数。芯はここ 1 か所）', () => {
  assert.deepEqual(C.BAND_MOVE, { step: 5, big: 30, tap: 8 });
  assert.equal(C.BAND_MOVE.big % C.BAND_MOVE.step, 0);
});

test('main.js は刻みを Calc から取る（5・30・8 を直書きしない。目に揃える式は calc.js の bandKeyTo・bandDragTo。Q-516）', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(src, /C\.bandKeyTo\(/);
  assert.match(src, /C\.bandDragTo\(/);
  assert.match(src, /C\.BAND_MOVE\.tap/);
  assert.doesNotMatch(src, /Math\.(round|floor|ceil)\([^)]*BAND_MOVE/);   // 揃える式を main.js に書かない
  const body = src.slice(src.indexOf('function bandSet'), src.indexOf("$('day-add')"));
  assert.doesNotMatch(body.replace(/\/\/[^\n]*/g, ''), /[^\w.](5|30|8)\b(?!\s*px)/);
});

test('bandMoveTo: 前後の時刻の在る予定を越えない（同じ時刻までは行ける。時刻の無い予定は飛ばして見る）', () => {
  const items = [{ time: '09:00' }, { time: '' }, { time: '10:00' }, { time: '11:30' }];
  const T = (t) => C.toMin(t);
  assert.equal(C.bandMoveTo(items, 2, T('10:05')), T('10:05'));
  assert.equal(C.bandMoveTo(items, 2, T('08:00')), T('09:00'));   // 前の時刻の在る予定（0 番）まで
  assert.equal(C.bandMoveTo(items, 2, T('12:00')), T('11:30'));   // 次の予定まで
  assert.equal(C.bandMoveTo(items, 1, T('10:00')), null);         // 時刻の無い予定は動かせない
});

test('bandMoveTo: 0:00 と 23:55 で止まる', () => {
  const items = [{ time: '00:10' }, { time: '23:50' }];
  assert.equal(C.bandMoveTo(items, 0, -30), 0);
  assert.equal(C.bandMoveTo(items, 1, 23 * 60 + 50 + 30), C.DAY_MIN - C.BAND_MOVE.step);
  assert.equal(C.hhmm(C.bandMoveTo(items, 1, 9999)), '23:55');
  assert.equal(C.hhmm(C.bandMoveTo(items, 0, -9999)), '00:00');
});

test('bandMoveTo: 前後と逆の順に入っている予定は、今の時刻から外へは動かさない（飛ばない）', () => {
  const items = [{ time: '10:00' }, { time: '09:00' }, { time: '11:00' }];
  assert.equal(C.bandMoveTo(items, 1, C.toMin('08:55')), C.toMin('09:00'));
  assert.equal(C.bandMoveTo(items, 1, C.toMin('09:05')), C.toMin('09:05'));
});

test('hhmm は時刻の欄の値（toMin の逆）', () => {
  for (const t of ['00:00', '07:05', '12:30', '23:55']) assert.equal(C.hhmm(C.toMin(t)), t);
});

test('印の位置 ＝ dayBand の位置 ＝ 欄の時刻（動かす前と後）', () => {
  const items = [{ time: '08:00', min: 30 }, { time: '09:00', min: 20 }, { time: '10:00' }];
  const check = () => {
    const b = C.dayBand(items);
    b.marks.forEach((m) => near(b.from + m.x * (b.to - b.from), C.toMin(items[m.i].time)));
  };
  check();
  items[1].time = C.hhmm(C.bandMoveTo(items, 1, C.toMin(items[1].time) + 5 * C.BAND_MOVE.step));
  assert.equal(items[1].time, '09:25');
  check();
});

test('dayBand に範囲を渡すと、その範囲で描く（動かしている間は目盛りを変えない）', () => {
  const items = [{ time: '08:00' }, { time: '09:00' }, { time: '10:00' }];
  const b0 = C.dayBand(items);
  items[0].time = '08:30';   // 範囲の左端を決めていた予定を動かす
  const b1 = C.dayBand(items, { from: b0.from, to: b0.to });
  assert.equal(b1.from, b0.from); assert.equal(b1.to, b0.to);
  assert.deepEqual(b1.ticks, b0.ticks);
  near(b1.marks[0].x, 30 / 120);
  assert.notEqual(C.dayBand(items).from, b0.from);   // 渡さなければ取り直す
});

// ---- 5 分の目に揃える・重なった印は近い方（Q-516） ----

const T = (t) => C.toMin(t);
const key = (items, i, dir, big) => C.hhmm(C.bandKeyTo(items, i, dir, big));

test('bandKeyTo: 目に無い時刻は最初の 1 歩で進む向きの目へ（10:03 は → で 10:05、← で 10:00、Shift は 10:30・10:00）', () => {
  const items = [{ time: '08:00' }, { time: '10:03' }, { time: '12:00' }];
  assert.equal(key(items, 1, 1, false), '10:05');
  assert.equal(key(items, 1, -1, false), '10:00');
  assert.equal(key(items, 1, 1, true), '10:30');
  assert.equal(key(items, 1, -1, true), '10:00');
});

test('bandKeyTo: 目に在る時刻は今までどおり 1 目（10:05 は → で 10:10、← で 10:00。Shift は 30 分の目）', () => {
  const items = [{ time: '08:00' }, { time: '10:05' }, { time: '12:00' }];
  assert.equal(key(items, 1, 1, false), '10:10');
  assert.equal(key(items, 1, -1, false), '10:00');
  assert.equal(key(items, 1, 1, true), '10:30');
  assert.equal(key(items, 1, -1, true), '10:00');
  items[1].time = '10:30';
  assert.equal(key(items, 1, 1, true), '11:00');
  assert.equal(key(items, 1, -1, true), '10:00');
});

test('bandKeyTo: 23:58 の → は 23:55 の先（24:00）へ行かない', () => {
  const items = [{ time: '23:00' }, { time: '23:58' }];
  const v = C.bandKeyTo(items, 1, 1, false);
  assert.ok(v < C.DAY_MIN, 'v=' + v);
  assert.equal(C.hhmm(v), '23:58');   // 23:55 より後に入っている時刻は、今の時刻より外へは動かさない（bandMoveTo のまま）
  assert.equal(key(items, 1, -1, false), '23:55');
  assert.equal(key([{ time: '23:00' }, { time: '23:53' }], 1, 1, false), '23:55');
  assert.equal(key([{ time: '23:00' }, { time: '23:55' }], 1, 1, false), '23:55');
});

test('bandKeyTo: 前の予定が 10:04 に在る 10:06 の ← は 10:05 で止まり、次の ← も 10:04 より前へ行かない', () => {
  const items = [{ time: '10:04' }, { time: '10:06' }, { time: '11:00' }];
  assert.equal(key(items, 1, -1, false), '10:05');
  items[1].time = '10:05';
  assert.equal(key(items, 1, -1, false), '10:04');
  items[1].time = '10:06';
  assert.equal(key(items, 1, -1, true), '10:04');
  assert.equal(C.bandKeyTo([{ time: '' }, { time: '10:00' }], 0, 1, false), null);
});

test('bandDragTo: 引いた後の時刻は 5 で割り切れる（引き始めが目に無くても。前後の予定が目に在る時）', () => {
  for (const start of ['10:03', '10:07', '10:00', '10:58']) {
    const items = [{ time: '08:00' }, { time: start }, { time: '13:00' }];
    for (let dm = -90; dm <= 90; dm += 0.7) {
      const v = C.bandDragTo(items, 1, T(start), dm);
      assert.equal(v % C.BAND_MOVE.step, 0, start + ' ' + dm + ' → ' + v);
      assert.ok(Math.abs(v - (T(start) + dm)) <= C.BAND_MOVE.step / 2 + 1e-9);
    }
  }
});

test('bandKeyTo・bandDragTo: 目に揃えても並びの順は変わらない（前後の時刻が目に無い入力を総当たり）', () => {
  let n = 0;
  for (let a = 600; a <= 615; a++) for (let c = 616; c <= 640; c++) for (let b = a; b <= c; b++) {
    const items = [{ time: C.hhmm(a) }, { time: C.hhmm(b) }, { time: C.hhmm(c) }];
    const vs = [C.bandKeyTo(items, 1, 1, false), C.bandKeyTo(items, 1, -1, false), C.bandKeyTo(items, 1, 1, true), C.bandKeyTo(items, 1, -1, true)];
    for (let dm = -40; dm <= 40; dm += 3) vs.push(C.bandDragTo(items, 1, b, dm));
    for (const v of vs) { assert.ok(v >= a && v <= c, [a, b, c, v].join(' ')); n++; }
  }
  assert.ok(n > 10000);
});

test('bandNearest: 重なった 2 つの印は、押した点に中心が近い方（3 組）', () => {
  const pairs = [[100, 112], [50, 80], [200, 201]];   // 中心の x（y は同じ 66）
  pairs.forEach(([xl, xr], k) => {
    const marks = [{ i: k, t: 600, x: xl, y: 66 }, { i: k + 1, t: 610, x: xr, y: 66 }];
    assert.equal(C.bandNearest(marks, xr - (xr - xl) * 0.25, 70), k + 1);   // 右の中心に近い点 → 右
    assert.equal(C.bandNearest(marks, xl + (xr - xl) * 0.25, 60), k);       // 左の中心に近い点 → 左
    assert.equal(C.bandNearest(marks.slice().reverse(), xr - (xr - xl) * 0.25, 66), k + 1);   // 描く順に依らない
  });
});

test('bandNearest: 同じ近さなら時刻の早い方（同じ時刻なら番号の小さい方）。空なら null', () => {
  assert.equal(C.bandNearest([{ i: 3, t: 610, x: 10, y: 0 }, { i: 2, t: 600, x: 30, y: 0 }], 20, 0), 2);
  assert.equal(C.bandNearest([{ i: 5, t: 600, x: 10, y: 0 }, { i: 4, t: 600, x: 10, y: 0 }], 10, 0), 4);
  assert.equal(C.bandNearest([], 0, 0), null);
});

test('main.js の押す・引くは bandPick（Calc.bandNearest）で印を決める（描く順で決めない。Q-516）', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(src, /function bandPick\(mk, x, y\)[\s\S]*?C\.bandNearest\(/);
  assert.match(src, /mk = bandPick\(mk, e\.clientX, e\.clientY\)/);   // 引く
  assert.match(src, /case 'band-go':[\s\S]*?bandPick\(b, e\.clientX, e\.clientY\)/);   // 押して飛ぶ
});
