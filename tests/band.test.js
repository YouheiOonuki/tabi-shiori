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
