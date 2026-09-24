// ===========================
// 旅のしおりメーカー — 計算ロジック（画面から切り離した純粋関数）
// DOM や localStorage に触らない。tests/*.test.js から node --test で確かめる
// ブラウザでは window.Calc、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  // --- 選べる値 ---
  var COVERS = ['none', 'mountain', 'sea', 'city', 'train', 'onsen'];
  var MOVES = ['', '徒歩', '電車', '新幹線', 'バス', '車', '飛行機', '船', 'タクシー', '自転車', 'その他'];

  // 件数と長さの上限（保存・ファイル・共有リンクのどこから来ても同じにそろえる）
  var LIMITS = {
    trips: 30, members: 30, days: 30, items: 40, packing: 150, stays: 10, contacts: 20, budget: 50,
    title: 60, sub: 80, name: 40, place: 60, memo: 300, addr: 120, tel: 30, notes: 3000, image: 400000,
    freePages: 20, freeTitle: 40, freeBody: 2000,
  };
  // 自由ページを入れる場所（行程の前・後ろ）
  var FREE_PLACES = ['before', 'after'];

  // --- 小さな道具 ---
  function str(v, max) {
    if (v === null || v === undefined) return '';
    var s = typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : '');
    // 制御文字（改行・タブ以外）を消す
    s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
    return s.length > max ? s.slice(0, max) : s;
  }
  function line(v, max) { return str(v, max).replace(/[\r\n\t]+/g, ' '); }
  function arr(v, max) { return Array.isArray(v) ? v.slice(0, max) : []; }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function isDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + 'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
  }
  function isTime(s) { return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }
  function intIn(v, lo, hi) {
    if (v === null || v === undefined || v === '') return lo < 0 ? lo : 0;
    var n = Math.round(Number(v));
    if (!isFinite(n)) return lo < 0 ? lo : 0;
    return Math.min(hi, Math.max(lo, n));
  }
  function newId() { return Math.random().toString(36).slice(2, 10) || 'a'; }

  // --- 正規化（保存データ・ファイル・共有リンクの中身はそのまま信じない） ---
  // 並びは共有リンクのビットの順。足すときは末尾に足す（古いリンクのビットがずれないように）
  var PRINT_KEYS = ['credit', 'packing', 'stays', 'contacts', 'budget', 'notes', 'free'];

  function emptyTrip() {
    return {
      id: newId(), title: '', sub: '', start: '', end: '', members: [], cover: 'mountain', image: '',
      days: [{ items: [] }], packing: [], stays: [], contacts: [], budget: [], notes: '', freePages: [],
      print: { credit: true, packing: true, stays: true, contacts: true, budget: true, notes: true, free: true },
    };
  }

  function normalizeTrip(t) {
    var o = obj(t);
    var e = emptyTrip();
    var days = arr(o.days, LIMITS.days).map(function (d) {
      var items = arr(obj(d).items, LIMITS.items).map(function (it) {
        it = obj(it);
        return {
          time: isTime(it.time) ? it.time : '',
          place: line(it.place, LIMITS.place),
          memo: str(it.memo, LIMITS.memo),
          move: MOVES.indexOf(it.move) >= 0 ? it.move : '',
          min: intIn(it.min, 0, 24 * 60),
        };
      });
      return { items: items };
    });
    if (!days.length) days = [{ items: [] }];
    var print = obj(o.print), p = {};
    PRINT_KEYS.forEach(function (k) { p[k] = print[k] === undefined ? e.print[k] : !!print[k]; });
    var image = typeof o.image === 'string' && o.image.length <= LIMITS.image &&
      /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(o.image) ? o.image : '';
    return {
      id: typeof o.id === 'string' && /^[a-z0-9]{1,16}$/.test(o.id) ? o.id : newId(),
      title: line(o.title, LIMITS.title),
      sub: line(o.sub, LIMITS.sub),
      start: isDate(o.start) ? o.start : '',
      end: isDate(o.end) ? o.end : '',
      members: arr(o.members, LIMITS.members).map(function (m) { return line(m, LIMITS.name).trim(); }).filter(Boolean),
      cover: COVERS.indexOf(o.cover) >= 0 ? o.cover : e.cover,
      image: image,
      days: days,
      packing: arr(o.packing, LIMITS.packing).map(function (x) {
        x = obj(x);
        return { name: line(x.name, LIMITS.name), done: !!x.done };
      }),
      stays: arr(o.stays, LIMITS.stays).map(function (x) {
        x = obj(x);
        return { name: line(x.name, LIMITS.place), addr: line(x.addr, LIMITS.addr), tel: line(x.tel, LIMITS.tel), checkin: line(x.checkin, LIMITS.name), memo: str(x.memo, LIMITS.memo) };
      }),
      contacts: arr(o.contacts, LIMITS.contacts).map(function (x) {
        x = obj(x);
        return { name: line(x.name, LIMITS.name), tel: line(x.tel, LIMITS.tel), memo: line(x.memo, LIMITS.place) };
      }),
      budget: arr(o.budget, LIMITS.budget).map(function (x) {
        x = obj(x);
        return { name: line(x.name, LIMITS.name), amount: intIn(x.amount, 0, 99999999), payer: intIn(x.payer, -1, LIMITS.members - 1) };
      }),
      notes: str(o.notes, LIMITS.notes),
      // 自由ページ（見出し＋本文）。古い保存データには無いので、そのときは空
      freePages: arr(o.freePages, LIMITS.freePages).map(function (x) {
        x = obj(x);
        return {
          id: typeof x.id === 'string' && /^[a-z0-9]{1,16}$/.test(x.id) ? x.id : newId(),
          title: line(x.title, LIMITS.freeTitle),
          body: str(x.body, LIMITS.freeBody).replace(/\r\n?/g, '\n'),
          place: FREE_PLACES.indexOf(x.place) >= 0 ? x.place : 'after',
        };
      }),
      print: p,
    };
  }

  /** 印刷する自由ページを、行程の前と後ろに分ける（並びは入力の順。見出しも本文も空のページと、印刷しない設定のときは除く） */
  function freeOrder(trip) {
    var out = { before: [], after: [] };
    if (!trip.print || !trip.print.free) return out;
    (trip.freePages || []).forEach(function (f) {
      if (f.title.trim() || f.body.trim()) out[f.place === 'before' ? 'before' : 'after'].push(f);
    });
    return out;
  }

  var NO_START = '、。，．・：；？！ー―」』）］｝〉》】〕”’ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々,.)]}!?:;%';
  /** 全角を 1、半角を 0.5 と数えた文字の幅 */
  function charWidth(ch) {
    var c = ch.codePointAt(0);
    return c < 0x1100 || (c >= 0xff61 && c <= 0xff9f) ? 0.5 : 1;
  }
  /**
   * 本文を、1 行 cols 文字（全角換算）以内の行に折る。改行はそのまま行の区切りにする（空行も 1 行）
   * 印刷で行ごとに高さを測ってページに詰めるため（長い本文を途中で切らずに次のページへ送る）
   * @returns {string[]}
   */
  function wrapText(text, cols) {
    cols = Math.max(1, Number(cols) || 1);
    var out = [];
    String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n').forEach(function (para) {
      var cur = '', w = 0;
      Array.from(para).forEach(function (ch) {
        var cw = charWidth(ch);
        if (w + cw > cols && cur) {
          // 行頭に句読点・閉じかっこ・小さい字などを置かない（前の行の最後の 1 字と一緒に次の行へ送る）
          var carry = '';
          var chars = Array.from(cur);
          if (NO_START.indexOf(ch) >= 0 && chars.length > 1) carry = chars.pop();
          out.push(chars.join(''));
          cur = carry; w = carry ? charWidth(carry) : 0;
        }
        cur += ch; w += cw;
      });
      out.push(cur);
    });
    return out;
  }

  /** 保存している全体 { v, active, trips }。しおりは必ず 1 つ以上 */
  function normalizeStore(s) {
    var o = obj(s);
    var seen = {};
    var trips = arr(o.trips, LIMITS.trips).map(normalizeTrip).map(function (t) {
      while (seen[t.id]) t.id = newId();   // id の重複を直す
      seen[t.id] = true;
      return t;
    });
    if (!trips.length) trips = [emptyTrip()];
    var active = trips.some(function (t) { return t.id === o.active; }) ? o.active : trips[0].id;
    return { v: 1, active: active, trips: trips };
  }

  // --- 日付 ---
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  function addDays(iso, n) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  /** 旅行の日数（出発日と帰着日から）。分からなければ 0 */
  function tripDays(start, end) {
    if (!isDate(start) || !isDate(end)) return 0;
    var n = Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000) + 1;
    return n >= 1 && n <= 366 ? n : 0;
  }
  /** 「2泊3日」「日帰り」 */
  function nightsLabel(start, end) {
    var n = tripDays(start, end);
    if (!n) return '';
    return n === 1 ? '日帰り' : (n - 1) + '泊' + n + '日';
  }
  /** 「10月10日（土）」 */
  function dateJa(iso) {
    if (!isDate(iso)) return '';
    var d = new Date(iso + 'T00:00:00Z');
    return (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日（' + WD[d.getUTCDay()] + '）';
  }
  /** i 日目（0 始まり）の日付。出発日が無ければ '' */
  function dayDate(start, i) { return isDate(start) ? addDays(start, i) : ''; }
  /** 表紙の日程「2026年10月10日（土）〜12日（月）」 */
  function rangeJa(start, end) {
    if (!isDate(start)) return '';
    var s = start.slice(0, 4) + '年' + dateJa(start);
    if (!isDate(end) || end <= start) return s;
    var e = dateJa(end);
    if (end.slice(0, 4) !== start.slice(0, 4)) e = end.slice(0, 4) + '年' + e;
    else if (end.slice(5, 7) === start.slice(5, 7)) e = e.replace(/^\d+月/, '');
    return s + '〜' + e;
  }

  // --- 時刻と移動時間 ---
  function toMin(t) { return isTime(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null; }
  /** 分を「1時間20分」「45分」に */
  function formatMin(m) {
    m = Math.max(0, Math.round(Number(m) || 0));
    var h = Math.floor(m / 60), r = m % 60;
    if (!h) return r + '分';
    return h + '時間' + (r ? r + '分' : '');
  }
  /** 分を「HH:MM」に（24 時を超えたら「翌」を付ける） */
  function clock(m) {
    var day = Math.floor(m / 1440), r = m % 1440;
    var s = String(Math.floor(r / 60)).padStart(2, '0') + ':' + String(r % 60).padStart(2, '0');
    return day > 0 ? '翌' + s : s;
  }

  /**
   * 1 日の移動の集計。items[i].move / min は「この場所から次の場所へ」の移動
   * @returns {{total:number, legs:number, rows:Array<{arrive:string, late:boolean, lateBy:number}>}}
   *   arrive: 時刻と移動時間から出した、次の場所に着く時刻の目安（出せなければ ''）
   *   late:   次の予定の時刻に間に合わない（次の予定に時刻があるときだけ判定）
   */
  function daySummary(items) {
    items = items || [];
    var total = 0, legs = 0;
    var rows = items.map(function (it, i) {
      var min = Number(it.min) || 0;
      if (min > 0) { total += min; legs++; }
      var r = { arrive: '', late: false, lateBy: 0 };
      var t = toMin(it.time);
      if (t !== null && min > 0) {
        var arrive = t + min;
        r.arrive = clock(arrive);
        var next = items[i + 1];
        var nt = next ? toMin(next.time) : null;
        if (nt !== null && arrive > nt) { r.late = true; r.lateBy = arrive - nt; }
      }
      return r;
    });
    return { total: total, legs: legs, rows: rows };
  }

  /** 旅行全体の移動時間の合計（分） */
  function tripMoveTotal(trip) {
    return (trip.days || []).reduce(function (s, d) { return s + daySummary(d.items).total; }, 0);
  }

  // --- 予算・割り勘 ---
  /** 合計を人数で割る。1 円未満は切り捨て、余りを別に出す */
  function splitEven(total, people) {
    total = Math.max(0, Math.round(Number(total) || 0));
    people = Math.floor(Number(people) || 0);
    if (people < 1) return { per: 0, remainder: total };
    var per = Math.floor(total / people);
    return { per: per, remainder: total - per * people };
  }

  /**
   * 立て替えの精算（全員で均等に負担する前提）
   * 各人の負担 = 立て替えた額の合計 ÷ 人数（割り切れない余りは、先頭の人から 1 円ずつ多く負担）
   * @param {number} people 人数（メンバーの数）
   * @param {Array<{amount:number,payer:number}>} items payer はメンバーの番号（-1 は未設定）
   * @returns {{total:number, share:number[], paid:number[], balance:number[], transfers:Array<{from:number,to:number,amount:number}>, unassigned:number}}
   *   balance は「受け取る額（+）／払う額（−）」。transfers は、差の大きい人どうしから組む（回数は人数 − 1 以下）
   *   立て替えた人が決まっていない額（unassigned）は精算に入れない
   */
  function settle(people, items) {
    var n = Math.max(0, Math.floor(Number(people) || 0));
    var total = 0, unassigned = 0;
    var paid = new Array(n).fill(0);
    (items || []).forEach(function (it) {
      var a = Math.max(0, Math.round(Number(it.amount) || 0));
      total += a;
      if (Number.isInteger(it.payer) && it.payer >= 0 && it.payer < n) paid[it.payer] += a;
      else unassigned += a;
    });
    if (!n) return { total: total, share: [], paid: [], balance: [], transfers: [], unassigned: unassigned };
    var sp = splitEven(total - unassigned, n);
    var share = paid.map(function (_, i) { return sp.per + (i < sp.remainder ? 1 : 0); });
    var balance = paid.map(function (p, i) { return p - share[i]; });
    var cred = [], debt = [];
    balance.forEach(function (b, i) { if (b > 0) cred.push({ i: i, v: b }); else if (b < 0) debt.push({ i: i, v: -b }); });
    var transfers = [];
    var byV = function (a, b) { return b.v - a.v || a.i - b.i; };
    while (cred.length && debt.length) {
      cred.sort(byV); debt.sort(byV);
      var c = cred[0], d = debt[0], v = Math.min(c.v, d.v);
      transfers.push({ from: d.i, to: c.i, amount: v });
      c.v -= v; d.v -= v;
      if (!c.v) cred.shift();
      if (!d.v) debt.shift();
    }
    return { total: total, share: share, paid: paid, balance: balance, transfers: transfers, unassigned: unassigned };
  }

  // --- base64url（UTF-8） ---
  function bytesToB64u(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64uToBytes(s) {
    var bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // --- easy-split への受け渡し ---
  // easy-split の共有リンク（easy-split の main.js の encodeShare / decodeShare）と同じ形:
  //   #s= + base64url(JSON { v:1, b:[[会計名, 合計, 除外額, 欠席者の番号[]]], p:[[名前, 傾斜, 固定額|null]], o:幹事の番号, u:'auto' })
  //   easy-split 側で 参加者 50 人・名前 40 文字、会計 10 件・名前 20 文字、傾斜 0.5〜2 に切られる
  function toEasySplit(trip) {
    var members = (trip.members || []).slice(0, 50);
    var bills = (trip.budget || []).filter(function (b) { return b.amount > 0; }).map(function (b) {
      return [(b.name || '費用').slice(0, 20), b.amount, 0, []];
    });
    if (bills.length > 10) {
      var rest = bills.slice(9).reduce(function (s, b) { return s + b[1]; }, 0);
      bills = bills.slice(0, 9).concat([['その他', rest, 0, []]]);
    }
    if (!members.length || !bills.length) return null;
    return { v: 1, b: bills, p: members.map(function (m) { return [m.slice(0, 40), 1, null]; }), o: 0, u: 'auto' };
  }

  /** easy-split を開く URL（base は easy-split のページの URL）。渡せるものが無ければ '' */
  function easySplitUrl(trip, base) {
    var d = toEasySplit(trip);
    return d ? base + '#s=' + bytesToB64u(new TextEncoder().encode(JSON.stringify(d))) : '';
  }

  // --- 共有リンク #s= ---
  // 形: 先頭 1 文字が方式（z = deflate-raw、j = 無圧縮）＋ base64url
  // 中身は短い配列: [版, タイトル, サブ, 出発, 帰着, メンバー[], 絵柄, 日[[[時刻,場所,メモ,手段,分]]], 持ち物[[名前,済]],
  //                  宿[[名前,住所,電話,チェックイン,メモ]], 連絡先[[名前,電話,メモ]], 予算[[名前,金額,立替]], メモ, 印刷の設定(ビット),
  //                  自由ページ[[見出し,本文,場所(0=行程の前,1=後ろ)]]]
  // 自由ページは後から足した末尾の項目。版は 1 のまま（無いリンク＝前からのリンクも読める）
  // 画像は入れない。withContacts が false なら宿の住所・電話と連絡先を入れない
  var SHARE_V = 1;

  function packTrip(trip, withContacts) {
    var t = normalizeTrip(trip);
    return [
      SHARE_V, t.title, t.sub, t.start, t.end, t.members, COVERS.indexOf(t.cover),
      t.days.map(function (d) { return d.items.map(function (it) { return [it.time, it.place, it.memo, MOVES.indexOf(it.move), it.min]; }); }),
      t.packing.map(function (x) { return [x.name, x.done ? 1 : 0]; }),
      t.stays.map(function (x) { return withContacts ? [x.name, x.addr, x.tel, x.checkin, x.memo] : [x.name, '', '', x.checkin, x.memo]; }),
      withContacts ? t.contacts.map(function (x) { return [x.name, x.tel, x.memo]; }) : [],
      t.budget.map(function (x) { return [x.name, x.amount, x.payer]; }),
      t.notes,
      PRINT_KEYS.reduce(function (bits, k, i) { return bits | (t.print[k] ? 1 << i : 0); }, 0),
      t.freePages.map(function (x) { return [x.title, x.body, FREE_PLACES.indexOf(x.place)]; }),
    ];
  }

  function unpackTrip(a) {
    if (!Array.isArray(a) || a[0] !== SHARE_V) return null;
    var g = function (i) { return Array.isArray(a[i]) ? a[i] : []; };
    var row = function (x) { return Array.isArray(x) ? x : []; };
    var bits = Number.isInteger(a[13]) ? a[13] : 127;
    var print = {};
    PRINT_KEYS.forEach(function (k, i) { print[k] = !!(bits & (1 << i)); });
    if (a.length < 15) print.free = true;   // 自由ページができる前のリンク: 既定（印刷する）にする
    return normalizeTrip({
      title: a[1], sub: a[2], start: a[3], end: a[4], members: g(5), cover: COVERS[a[6]] || 'none',
      days: g(7).map(function (d) {
        return { items: row(d).map(function (x) { x = row(x); return { time: x[0], place: x[1], memo: x[2], move: MOVES[x[3]] || '', min: x[4] }; }) };
      }),
      packing: g(8).map(function (x) { x = row(x); return { name: x[0], done: !!x[1] }; }),
      stays: g(9).map(function (x) { x = row(x); return { name: x[0], addr: x[1], tel: x[2], checkin: x[3], memo: x[4] }; }),
      contacts: g(10).map(function (x) { x = row(x); return { name: x[0], tel: x[1], memo: x[2] }; }),
      budget: g(11).map(function (x) { x = row(x); return { name: x[0], amount: x[1], payer: x[2] }; }),
      notes: a[12],
      freePages: g(14).map(function (x) { x = row(x); return { title: x[0], body: x[1], place: FREE_PLACES[x[2]] }; }),
      print: print,
    });
  }

  function hasCompression() {
    return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function' && typeof Response === 'function' && typeof Blob === 'function';
  }
  async function deflate(bytes) {
    var s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function inflate(bytes, maxBytes) {
    var reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    var chunks = [], size = 0;
    for (;;) {
      var r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > maxBytes) { reader.cancel(); throw new Error('too large'); }   // 展開すると巨大になるリンクよけ
      chunks.push(r.value);
    }
    var out = new Uint8Array(size), off = 0;
    chunks.forEach(function (c) { out.set(c, off); off += c.length; });
    return out;
  }

  /** しおりを #s= の中身（'z…' か 'j…'）にする。opts.withContacts で連絡先を含める、opts.compress=false で無圧縮 */
  async function encodeShare(trip, opts) {
    opts = opts || {};
    var bytes = new TextEncoder().encode(JSON.stringify(packTrip(trip, !!opts.withContacts)));
    if (opts.compress !== false && hasCompression()) return 'z' + bytesToB64u(await deflate(bytes));
    return 'j' + bytesToB64u(bytes);
  }

  /** #s= の中身をしおりに戻す。読めなければ null */
  async function decodeShare(s) {
    if (typeof s !== 'string' || s.length < 2 || s.length > 60000 || !/^[zj][A-Za-z0-9_-]+$/.test(s)) return null;
    try {
      var bytes = b64uToBytes(s.slice(1));
      if (s[0] === 'z') {
        if (!hasCompression()) return null;
        bytes = await inflate(bytes, 400000);
      }
      return unpackTrip(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    } catch (e) { return null; }
  }

  // これより長い共有リンクは、LINE やメールで途中で切れることがあるので、ファイルを勧める
  var SHARE_MAX = 8000;

  // --- 地図 ---
  /** Google マップの検索結果を開くリンク（埋め込みも API も使わない） */
  function mapUrl(place) {
    var q = line(place, LIMITS.place).trim();
    return q ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q) : '';
  }

  // --- 印刷: ページ分け ---
  /**
   * 塊（高さ）を、決まった高さのページに順に詰める
   * @param {Array<{h:number, breakBefore?:boolean, keepWithNext?:boolean}>} blocks
   *   breakBefore: この塊から新しいページ（表紙のあと・日の始まりなど）
   *   keepWithNext: 次の塊と同じページに置く（見出しを孤立させない）
   *   skip: 順には置かない塊（cont で使う「（つづき）」の見出し）
   *   cont: 塊の番号。この塊が新しいページの先頭になるとき、先にその塊（「（つづき）」の見出し）を置く
   * @param {number} cap 1 ページに入る高さ
   * @returns {number[][]} ページごとの塊の番号
   */
  function paginate(blocks, cap) {
    var pages = [], cur = [], used = 0;
    function flush() { if (cur.length) pages.push(cur); cur = []; used = 0; }
    // 新しいページの先頭に k を置く前に、つづきの見出しを置く
    function lead(k) {
      var c = blocks[k].cont;
      if (!cur.length && c !== undefined && c !== null && blocks[c]) { cur.push(c); used += blocks[c].h; }
    }
    function put(k) {
      if (used + blocks[k].h > cap && cur.length) flush();
      lead(k);
      cur.push(k); used += blocks[k].h;
    }
    var i = 0;
    while (i < blocks.length) {
      if (blocks[i].skip) { i++; continue; }
      // keepWithNext でつながった塊をひとまとめにする（見出し＋最初の行）
      var j = i, h = blocks[i].h;
      while (blocks[j].keepWithNext && j + 1 < blocks.length && !blocks[j + 1].breakBefore && !blocks[j + 1].skip) { j++; h += blocks[j].h; }
      if (blocks[i].breakBefore) flush();
      if (h <= cap) {
        if (used + h > cap) flush();
        lead(i);
        for (var m = i; m <= j; m++) cur.push(m);
        used += h;
      } else if (j > i) {
        // まとまりが 1 ページより大きい: 最初の 2 つ（見出し＋最初の行）だけは離さず、残りは順に流す
        var head = blocks[i].h + blocks[i + 1].h;
        if (used + head > cap) flush();
        cur.push(i, i + 1); used += head;
        for (var k = i + 2; k <= j; k++) put(k);
      } else {
        put(i);   // 1 つで 1 ページを超える塊は、そのまま 1 ページに置く（はみ出た分は切れる）
      }
      i = j + 1;
    }
    flush();
    return pages;
  }

  // --- 印刷: 中綴じの面付け ---
  /** ページ数を 4 の倍数にそろえる（中綴じは紙 1 枚の表裏で 4 ページ） */
  function padTo4(n) { return Math.max(4, Math.ceil(n / 4) * 4); }

  /**
   * 中綴じの面付け。n ページ（4 の倍数にそろえる）を、A4 横 1 面に 2 ページずつ並べる順番
   * 紙 k 枚目（0 始まり）の表: [n-2k, 2k+1]、裏: [2k+2, n-2k-1]（左・右。ページ番号は 1 始まり）
   * 両面印刷（短辺とじ）して、紙の順に重ねて真ん中で折ると 1, 2, 3, … の順に読める
   * @returns {Array<{sheet:number, side:'表'|'裏', left:number, right:number}>}
   */
  function imposeBooklet(n) {
    n = padTo4(n);
    var out = [];
    for (var k = 0; k < n / 4; k++) {
      out.push({ sheet: k + 1, side: '表', left: n - 2 * k, right: 2 * k + 1 });
      out.push({ sheet: k + 1, side: '裏', left: 2 * k + 2, right: n - 2 * k - 1 });
    }
    return out;
  }

  // --- バックアップファイル（README「ツールを追加するとき」20。決定 D31） ---
  var BACKUP_VERSION = 1;
  var BACKUP_MAX_BYTES = 1024 * 1024;

  /** 書き出すファイル名: <ツール名>-backup-YYYYMMDD.json（日付は端末の時計） */
  function backupFileName(tool, date) {
    var d = date || new Date();
    return tool + '-backup-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json';
  }

  /** 書き出す中身 */
  function buildBackup(tool, data, date) {
    return { tool: tool, version: BACKUP_VERSION, exportedAt: (date || new Date()).toISOString(), data: data };
  }

  /**
   * 読み込んだファイルの文字列を確かめる。中身の正規化は normalizeStore で行う
   * @returns {{ok: true, data: object} | {ok: false, error: string}} error は画面にそのまま出す文
   */
  function parseBackup(text, tool, requiredKeys) {
    var o;
    try { o = JSON.parse(text); } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o) || typeof o.tool !== 'string') {
      return { ok: false, error: 'ファイルを読み取れませんでした。このツールの「ファイルに書き出す」で作った .json ファイルを選んでください。' };
    }
    if (o.tool !== tool) {
      return { ok: false, error: 'ほかのツール（' + o.tool.slice(0, 40) + '）のファイルです。このツールで書き出したファイルを選んでください。' };
    }
    if (o.version !== BACKUP_VERSION) {
      return { ok: false, error: typeof o.version === 'number' && o.version > BACKUP_VERSION
        ? '新しい版のツールで書き出したファイルのため読み込めません。ページを再読み込みしてから、もう一度お試しください。'
        : 'ファイルの形式が正しくないため読み込めません。' };
    }
    var data = o.data;
    var missing = !data || typeof data !== 'object' || Array.isArray(data) ||
      (requiredKeys || []).some(function (k) { return data[k] === undefined || data[k] === null; });
    if (missing) return { ok: false, error: 'ファイルの中身が足りないため読み込めません。' };
    return { ok: true, data: data };
  }

  // 印刷物の最後のページに小さく入れるクレジット（既定で表示、「印刷する項目」で外せる）。
  // 紙から来た人を数えるため、着地ページ /tabi-shiori/print/ に向ける（サイト README「ツールを追加するとき」22）
  var CREDIT = 'yorozu-craft.com/tabi-shiori/print/ で作成';

  var api = {
    CREDIT: CREDIT, COVERS: COVERS, MOVES: MOVES, LIMITS: LIMITS, SHARE_MAX: SHARE_MAX, BACKUP_MAX_BYTES: BACKUP_MAX_BYTES,
    emptyTrip: emptyTrip, normalizeTrip: normalizeTrip, normalizeStore: normalizeStore,
    isDate: isDate, isTime: isTime, tripDays: tripDays, nightsLabel: nightsLabel, dateJa: dateJa, dayDate: dayDate, rangeJa: rangeJa,
    formatMin: formatMin, daySummary: daySummary, tripMoveTotal: tripMoveTotal,
    splitEven: splitEven, settle: settle, toEasySplit: toEasySplit, easySplitUrl: easySplitUrl,
    encodeShare: encodeShare, decodeShare: decodeShare, packTrip: packTrip, unpackTrip: unpackTrip,
    FREE_PLACES: FREE_PLACES, freeOrder: freeOrder, wrapText: wrapText,
    mapUrl: mapUrl, paginate: paginate, padTo4: padTo4, imposeBooklet: imposeBooklet,
    backupFileName: backupFileName, buildBackup: buildBackup, parseBackup: parseBackup,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(this);
