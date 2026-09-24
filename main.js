// ===========================
// 旅のしおりメーカー — 画面の制御
// 計算は calc.js（純粋関数）、定番の持ち物と表紙の絵柄は presets.js
// ===========================
(function () {
  'use strict';

  var C = window.Calc, P = window.Presets;
  var $ = function (id) { return document.getElementById(id); };
  var TOOL = 'tabi-shiori';

  // --- ブラウザへの保存（README「ツールを追加するとき」12。キーは "tabi-shiori_" で始める） ---
  var KEY_PREFIX = 'tabi-shiori_';
  var store = {
    get: function (name, fallback) {
      try {
        var v = localStorage.getItem(KEY_PREFIX + name);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set: function (name, value) {
      try { localStorage.setItem(KEY_PREFIX + name, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
  };

  // --- 状態 ---
  var data = C.normalizeStore(store.get('trips', null));   // { v, active, trips }
  var shared = null;   // 共有リンクで開いたしおり（保存するまでは data に入れない）
  var mode = store.get('mode', 'a4') === 'booklet' ? 'booklet' : 'a4';

  function cur() {
    if (shared) return shared;
    for (var i = 0; i < data.trips.length; i++) if (data.trips[i].id === data.active) return data.trips[i];
    return data.trips[0];
  }

  var saveTimer = null;
  function save(now) {
    if (shared) return;
    clearTimeout(saveTimer);
    var run = function () {
      saveTimer = null;
      if (!store.set('trips', data)) {
        showLoadMsg('ブラウザに保存できませんでした（容量がいっぱいか、保存できない設定です）。表紙の写真を外すか、「ファイルに書き出す」で残してください。');
      }
    };
    if (now) run(); else saveTimer = setTimeout(run, 300);
  }
  addEventListener('pagehide', function () { if (saveTimer) { clearTimeout(saveTimer); save(true); } });

  function showLoadMsg(text) { var el = $('load-msg'); el.textContent = text; el.hidden = !text; }

  // --- 表示の道具 ---
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function yen(n) { return Number(n || 0).toLocaleString('ja-JP') + '円'; }
  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }
  function tripLabel(t) { return (t.title || '（タイトルなし）') + (t.start ? '　' + C.dateJa(t.start) : ''); }

  // data-p="days.0.items.1.place" の場所に値を入れる
  function setPath(o, path, v) {
    var ks = path.split('.');
    for (var i = 0; i < ks.length - 1; i++) {
      o = o[/^\d+$/.test(ks[i]) ? Number(ks[i]) : ks[i]];
      if (!o) return;
    }
    o[ks[ks.length - 1]] = v;
  }
  function getPath(o, path) {
    return path.split('.').reduce(function (a, k) { return a == null ? a : a[/^\d+$/.test(k) ? Number(k) : k]; }, o);
  }

  // =========================================================
  // 描画
  // =========================================================
  function renderAll() {
    var t = cur();
    renderTrips();
    // 固定の入力欄（data-p を持つもの）
    document.querySelectorAll('#sec-cover [data-p], #sec-notes [data-p], #sec-print [data-p]').forEach(function (el) {
      var v = getPath(t, el.getAttribute('data-p'));
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v == null ? '' : v;
    });
    $('f-members').value = t.members.join('\n');
    renderCoverPick();
    renderImage();
    renderNights();
    renderDays();
    renderPacking();
    renderStays();
    renderContacts();
    renderBudget();
    document.querySelectorAll('input[name="mode"]').forEach(function (r) { r.checked = r.value === mode; });
    renderPrintHelp();
    if (!$('preview').hidden) renderPreview();
  }

  function renderTrips() {
    $('sec-trips').hidden = !!shared;
    $('shared-banner').hidden = !shared;
    var sel = $('trip-select');
    sel.innerHTML = data.trips.map(function (t) {
      return '<option value="' + esc(t.id) + '"' + (t.id === data.active ? ' selected' : '') + '>' + esc(tripLabel(t)) + '</option>';
    }).join('');
    $('trip-del').disabled = false;
  }

  function renderCoverPick() {
    var t = cur();
    $('cover-pick').innerHTML = C.COVERS.map(function (c) {
      return '<label class="cover-opt"><input type="radio" name="cover" value="' + c + '"' + (t.cover === c ? ' checked' : '') + '>' +
        '<span class="cover-art">' + (P.COVER_ART[c] || '<span class="cover-none">—</span>') + '</span>' +
        '<span class="cover-name">' + esc(P.COVER_LABELS[c]) + '</span></label>';
    }).join('');
  }

  function renderImage() {
    var t = cur(), img = $('img-thumb');
    if (t.image) { img.src = t.image; img.hidden = false; } else { img.removeAttribute('src'); img.hidden = true; }
    $('img-del').hidden = !t.image;
  }

  function renderNights() {
    var t = cur();
    var n = C.tripDays(t.start, t.end);
    var text = '';
    if (t.start && t.end && !n) text = '帰着日が出発日より前になっています。';
    else if (n) text = C.nightsLabel(t.start, t.end) + '（' + C.rangeJa(t.start, t.end) + '）';
    $('nights').textContent = text;
    $('day-fit').hidden = !(n > t.days.length && n <= C.LIMITS.days);
    if (n > t.days.length) $('day-fit').textContent = '日程に合わせて ' + n + ' 日にする';
  }

  var moveOptions = C.MOVES.map(function (m) { return m; });

  function dayTitle(t, di) {
    var d = C.dayDate(t.start, di);
    return (di + 1) + '日目' + (d ? '　' + C.dateJa(d) : '');
  }

  function renderDays() {
    var t = cur();
    $('days').innerHTML = t.days.map(function (day, di) {
      var items = day.items.map(function (it, ii) {
        var base = 'days.' + di + '.items.' + ii + '.';
        var id = 'd' + di + 'i' + ii;
        var map = C.mapUrl(it.place);
        return '<li class="item">' +
          '<div class="item-row">' +
            '<label class="visually-hidden" for="' + id + 't">時刻</label>' +
            '<input type="time" id="' + id + 't" data-p="' + base + 'time" value="' + esc(it.time) + '">' +
            '<label class="visually-hidden" for="' + id + 'p">場所・予定</label>' +
            '<input type="text" id="' + id + 'p" data-p="' + base + 'place" maxlength="60" value="' + esc(it.place) + '" placeholder="場所・予定（例：清水寺）">' +
            '<a class="map-link" id="map-' + id + '" href="' + esc(map || '#') + '" target="_blank" rel="noopener"' + (map ? '' : ' hidden') + '>地図</a>' +
          '</div>' +
          '<label class="visually-hidden" for="' + id + 'm">メモ</label>' +
          '<textarea id="' + id + 'm" data-p="' + base + 'memo" rows="1" maxlength="300" placeholder="メモ（集合場所・予約番号など）">' + esc(it.memo) + '</textarea>' +
          '<div class="move-row">' +
            '<span class="move-label" aria-hidden="true">↓ 次へ</span>' +
            '<label class="visually-hidden" for="' + id + 'v">次の場所への移動手段</label>' +
            '<select id="' + id + 'v" data-p="' + base + 'move">' + moveOptions.map(function (m) {
              return '<option value="' + esc(m) + '"' + (it.move === m ? ' selected' : '') + '>' + (m ? esc(m) : '手段') + '</option>';
            }).join('') + '</select>' +
            '<label class="visually-hidden" for="' + id + 'n">移動時間（分）</label>' +
            '<input type="number" id="' + id + 'n" class="num-min" data-p="' + base + 'min" data-type="int" min="0" max="1440" step="5" inputmode="numeric" value="' + (it.min || '') + '" placeholder="0">' +
            '<span aria-hidden="true">分</span>' +
            '<span class="arrive" id="arr-' + id + '"></span>' +
          '</div>' +
          '<p class="warn" id="warn-' + id + '" hidden></p>' +
          '<div class="item-tools">' +
            '<button type="button" class="mini" data-act="item-up" data-d="' + di + '" data-i="' + ii + '" aria-label="上へ"' + (ii === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button type="button" class="mini" data-act="item-down" data-d="' + di + '" data-i="' + ii + '" aria-label="下へ"' + (ii === day.items.length - 1 ? ' disabled' : '') + '>↓</button>' +
            '<button type="button" class="mini" data-act="item-ins" data-d="' + di + '" data-i="' + ii + '">下に予定を挿入</button>' +
            '<button type="button" class="mini danger" data-act="item-del" data-d="' + di + '" data-i="' + ii + '">削除</button>' +
          '</div>' +
        '</li>';
      }).join('');
      return '<div class="day" id="day-' + di + '">' +
        '<div class="day-head"><h3>' + esc(dayTitle(t, di)) + '</h3>' +
          (t.days.length > 1 ? '<button type="button" class="mini danger" data-act="day-del" data-d="' + di + '">この日を削除</button>' : '') +
        '</div>' +
        '<ol class="items">' + items + '</ol>' +
        '<button type="button" class="btn btn-sub" data-act="item-add" data-d="' + di + '">予定を追加</button>' +
        '<p class="total-line" id="day-total-' + di + '"></p>' +
      '</div>';
    }).join('');
    t.days.forEach(function (_, di) { updateDay(di); });
    updateMoveTotal();
    growAll($('days'));
  }

  // 移動時間の合計・到着の目安・間に合うか（入力のたびに、その日だけ直す）
  function updateDay(di) {
    var t = cur(), day = t.days[di];
    if (!day) return;
    var s = C.daySummary(day.items);
    s.rows.forEach(function (r, ii) {
      var id = 'd' + di + 'i' + ii;
      var a = $('arr-' + id), w = $('warn-' + id);
      if (a) a.textContent = r.arrive ? '着 ' + r.arrive + ' ごろ' : '';
      if (w) {
        w.hidden = !r.late;
        w.textContent = r.late ? '次の予定の時刻に ' + C.formatMin(r.lateBy) + ' 間に合いません（着 ' + r.arrive + ' ごろ）。' : '';
      }
    });
    var el = $('day-total-' + di);
    if (el) el.textContent = s.total ? 'この日の移動 ' + C.formatMin(s.total) + '（' + s.legs + ' 回）' : '';
  }
  function updateMoveTotal() {
    var m = C.tripMoveTotal(cur());
    $('move-total').textContent = m ? '旅行全体の移動 ' + C.formatMin(m) : '';
  }

  function renderPacking() {
    var t = cur();
    $('packing').innerHTML = t.packing.map(function (x, i) {
      return '<li><label class="inline grow"><input type="checkbox" data-p="packing.' + i + '.done" data-type="bool"' + (x.done ? ' checked' : '') + '>' +
        '<span class="visually-hidden">用意した：</span></label>' +
        '<label class="visually-hidden" for="pk' + i + '">持ち物</label>' +
        '<input type="text" id="pk' + i + '" data-p="packing.' + i + '.name" maxlength="40" value="' + esc(x.name) + '">' +
        '<button type="button" class="mini danger" data-act="pack-del" data-i="' + i + '" aria-label="' + esc(x.name) + ' を削除">×</button></li>';
    }).join('');
    var done = t.packing.filter(function (x) { return x.done; }).length;
    $('h-packing').textContent = '持ち物チェックリスト' + (t.packing.length ? '（' + done + ' / ' + t.packing.length + '）' : '');
  }

  function renderStays() {
    var t = cur();
    $('stays').innerHTML = t.stays.map(function (x, i) {
      var b = 'stays.' + i + '.';
      return '<div class="entry">' +
        field('st' + i + 'n', '宿の名前', '<input type="text" id="st' + i + 'n" data-p="' + b + 'name" maxlength="60" value="' + esc(x.name) + '">') +
        '<div class="grid2">' +
          field('st' + i + 'c', 'チェックイン', '<input type="text" id="st' + i + 'c" data-p="' + b + 'checkin" maxlength="40" value="' + esc(x.checkin) + '" placeholder="例：15:00〜">') +
          field('st' + i + 't', '電話番号', '<input type="tel" id="st' + i + 't" data-p="' + b + 'tel" maxlength="30" value="' + esc(x.tel) + '">') +
        '</div>' +
        field('st' + i + 'a', '住所', '<input type="text" id="st' + i + 'a" data-p="' + b + 'addr" maxlength="120" value="' + esc(x.addr) + '">') +
        field('st' + i + 'm', 'メモ', '<textarea id="st' + i + 'm" data-p="' + b + 'memo" rows="1" maxlength="300" placeholder="例：朝食 7:00〜、駐車場あり">' + esc(x.memo) + '</textarea>') +
        '<button type="button" class="mini danger" data-act="stay-del" data-i="' + i + '">この宿を削除</button>' +
      '</div>';
    }).join('');
    growAll($('stays'));
  }

  function renderContacts() {
    var t = cur();
    $('contacts').innerHTML = t.contacts.map(function (x, i) {
      var b = 'contacts.' + i + '.';
      return '<div class="entry"><div class="grid2">' +
        field('ct' + i + 'n', '名前', '<input type="text" id="ct' + i + 'n" data-p="' + b + 'name" maxlength="40" value="' + esc(x.name) + '">') +
        field('ct' + i + 't', '電話番号', '<input type="tel" id="ct' + i + 't" data-p="' + b + 'tel" maxlength="30" value="' + esc(x.tel) + '">') +
        '</div>' +
        field('ct' + i + 'm', 'メモ', '<input type="text" id="ct' + i + 'm" data-p="' + b + 'memo" maxlength="60" value="' + esc(x.memo) + '" placeholder="例：レンタカー会社、旅行保険">') +
        '<button type="button" class="mini danger" data-act="contact-del" data-i="' + i + '">この連絡先を削除</button>' +
      '</div>';
    }).join('');
  }

  function field(id, label, input) {
    return '<div class="field"><label for="' + id + '">' + esc(label) + '</label>' + input + '</div>';
  }

  function renderBudget() {
    var t = cur();
    var opts = function (sel) {
      return '<option value="-1"' + (sel < 0 ? ' selected' : '') + '>（未設定）</option>' + t.members.map(function (m, i) {
        return '<option value="' + i + '"' + (sel === i ? ' selected' : '') + '>' + esc(m) + '</option>';
      }).join('');
    };
    $('budget').innerHTML = t.budget.map(function (x, i) {
      var b = 'budget.' + i + '.';
      return '<div class="entry budget-row">' +
        field('bg' + i + 'n', '費用', '<input type="text" id="bg' + i + 'n" data-p="' + b + 'name" maxlength="40" value="' + esc(x.name) + '" placeholder="例：新幹線、宿">') +
        field('bg' + i + 'a', '金額（円）', '<input type="number" id="bg' + i + 'a" data-p="' + b + 'amount" data-type="int" min="0" step="1" inputmode="numeric" value="' + (x.amount || '') + '">') +
        field('bg' + i + 'p', '立て替えた人', '<select id="bg' + i + 'p" data-p="' + b + 'payer" data-type="int">' + opts(x.payer) + '</select>') +
        '<button type="button" class="mini danger" data-act="budget-del" data-i="' + i + '" aria-label="この費用を削除">削除</button>' +
      '</div>';
    }).join('');
    updateBudgetSummary();
  }

  function updateBudgetSummary() {
    var t = cur();
    var n = t.members.length;
    var r = C.settle(n, t.budget);
    var html = '';
    if (r.total) {
      html += '<p>合計 <strong>' + yen(r.total) + '</strong>';
      if (n) {
        var sp = C.splitEven(r.total, n);
        html += '　1 人あたり <strong>' + yen(sp.per) + '</strong>（' + n + ' 人' + (sp.remainder ? '・余り ' + yen(sp.remainder) : '') + '）';
      }
      html += '</p>';
      if (n && r.transfers.length) {
        html += '<p class="sum-h">精算（立て替えた分を均等に）</p><ul class="transfers">' + r.transfers.map(function (x) {
          return '<li>' + esc(t.members[x.from]) + ' → ' + esc(t.members[x.to]) + '　<strong>' + yen(x.amount) + '</strong></li>';
        }).join('') + '</ul>';
      } else if (n && r.total > r.unassigned) {
        html += '<p class="small">精算は必要ありません。</p>';
      }
      if (r.unassigned) html += '<p class="small">立て替えた人が未設定の ' + yen(r.unassigned) + ' は精算に入れていません（合計には入っています）。</p>';
      if (!n) html += '<p class="small">表紙の「メンバー」を入れると、1 人あたりの額と精算を出します。</p>';
    }
    $('budget-summary').innerHTML = html;
    var url = C.easySplitUrl(t, new URL('../easy-split/', location.href).href);
    $('es-wrap').innerHTML = url
      ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">傾斜割り勘（easy-split）で開く</a>：飲む人・飲まない人などで負担に差をつけたいときは、メンバーと費用をそのまま渡して計算できます。'
      : '傾斜をつけて割り勘したいときは <a href="../easy-split/" target="_blank" rel="noopener">傾斜割り勘（easy-split）</a> へ。メンバーと費用を入れると、そのまま渡せます。';
  }

  // =========================================================
  // 入力
  // =========================================================
  var main = document.querySelector('.app-main');

  function onField(el) {
    var p = el.getAttribute('data-p');
    if (!p) return;
    var t = cur();
    var type = el.getAttribute('data-type');
    var v = el.type === 'checkbox' ? el.checked : el.value;
    if (type === 'int') v = v === '' ? (/payer$/.test(p) ? -1 : 0) : Math.round(Number(v)) || 0;
    if (/\.min$/.test(p)) v = Math.min(1440, Math.max(0, v));
    if (/\.amount$/.test(p)) v = Math.min(99999999, Math.max(0, v));
    setPath(t, p, v);
    // 表示の一部を直す
    var m = /^days\.(\d+)\.items\.(\d+)\.(\w+)$/.exec(p);
    if (m) {
      updateDay(Number(m[1]));
      updateMoveTotal();
      if (m[3] === 'place') {
        var a = $('map-d' + m[1] + 'i' + m[2]), url = C.mapUrl(v);
        if (a) { a.hidden = !url; a.href = url || '#'; }
      }
    }
    if (/^budget\./.test(p)) updateBudgetSummary();
    if (/^packing\./.test(p)) {
      var done = t.packing.filter(function (x) { return x.done; }).length;
      $('h-packing').textContent = '持ち物チェックリスト（' + done + ' / ' + t.packing.length + '）';
    }
    if (p === 'title' || p === 'start') renderTrips();
    if (p === 'start' || p === 'end') {
      renderNights();
      t.days.forEach(function (_, di) { var h = document.querySelector('#day-' + di + ' h3'); if (h) h.textContent = dayTitle(t, di); });
    }
    if (/^print\./.test(p)) renderPrintHelp();
    save();
  }

  main.addEventListener('input', function (e) {
    var el = e.target;
    if (el.id === 'f-members') {
      cur().members = C.normalizeTrip({ members: el.value.split('\n') }).members;
      updateBudgetSummary();
      save();
      return;
    }
    if (el.tagName === 'TEXTAREA') autoGrow(el);
    if (el.type !== 'radio' && el.type !== 'checkbox' && el.tagName !== 'SELECT') onField(el);
  });
  main.addEventListener('change', function (e) {
    var el = e.target;
    if (el.id === 'f-members') { renderBudget(); return; }   // 立て替えた人の選択肢を直す
    if (el.name === 'cover') { cur().cover = el.value; save(); return; }
    if (el.name === 'mode') { mode = el.value; store.set('mode', mode); renderPrintHelp(); if (!$('preview').hidden) renderPreview(); return; }
    if (el.id === 'trip-select') { data.active = el.value; save(true); renderAll(); return; }
    if (el.id === 'share-contacts') { $('share-warn').hidden = !el.checked; clearShare(); return; }
    if (el.type === 'radio' || el.type === 'checkbox' || el.tagName === 'SELECT') onField(el);
    else if (el.getAttribute('data-p')) {
      // 数値の欄は、確定したときに正規化した値を表示し直す
      // （同じ値を入れ直すと、Chromium ではフォーカスが外れるときにその欄へスクロールして、押したボタンがずれるので、違うときだけ）
      if (el.type === 'number') { var nv = String(getPath(cur(), el.getAttribute('data-p')) || ''); if (el.value !== nv) el.value = nv; }
    }
  });

  function autoGrow(el) { if (!el.value) { el.style.height = ''; return; } el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight + 2, 400) + 'px'; }
  function growAll(box) { box.querySelectorAll('textarea').forEach(autoGrow); }

  function focusLater(id) { setTimeout(function () { var el = $(id); if (el) el.focus(); }, 0); }

  main.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var t = cur(), act = b.getAttribute('data-act');
    var di = Number(b.getAttribute('data-d')), ii = Number(b.getAttribute('data-i'));
    var items = t.days[di] && t.days[di].items;
    var blank = function () { return { time: '', place: '', memo: '', move: '', min: 0 }; };
    switch (act) {
      case 'item-add':
        if (items.length >= C.LIMITS.items) return;
        items.push(blank());
        renderDays(); focusLater('d' + di + 'i' + (items.length - 1) + 'p');
        break;
      case 'item-ins':
        if (items.length >= C.LIMITS.items) return;
        items.splice(ii + 1, 0, blank());
        renderDays(); focusLater('d' + di + 'i' + (ii + 1) + 'p');
        break;
      case 'item-up': case 'item-down':
        var j = act === 'item-up' ? ii - 1 : ii + 1;
        if (j < 0 || j >= items.length) return;
        var x = items[ii]; items[ii] = items[j]; items[j] = x;
        renderDays(); var btn = document.querySelector('[data-act="' + act + '"][data-d="' + di + '"][data-i="' + j + '"]'); if (btn && !btn.disabled) btn.focus();
        break;
      case 'item-del':
        if ((items[ii].place || items[ii].memo) && !confirm('「' + (items[ii].place || 'この予定') + '」を削除しますか？')) return;
        items.splice(ii, 1); renderDays();
        break;
      case 'day-del':
        if (t.days[di].items.length && !confirm((di + 1) + '日目の予定（' + t.days[di].items.length + ' 件）を削除しますか？')) return;
        t.days.splice(di, 1); renderDays(); renderNights();
        break;
      case 'pack-del': t.packing.splice(ii, 1); renderPacking(); break;
      case 'stay-del':
        if (t.stays[ii].name && !confirm('「' + t.stays[ii].name + '」を削除しますか？')) return;
        t.stays.splice(ii, 1); renderStays(); break;
      case 'contact-del':
        if (t.contacts[ii].name && !confirm('「' + t.contacts[ii].name + '」を削除しますか？')) return;
        t.contacts.splice(ii, 1); renderContacts(); break;
      case 'budget-del': t.budget.splice(ii, 1); renderBudget(); break;
      default: return;
    }
    save();
  });

  $('day-add').addEventListener('click', function () {
    var t = cur();
    if (t.days.length >= C.LIMITS.days) return;
    t.days.push({ items: [] });
    renderDays(); renderNights(); save();
  });
  $('day-fit').addEventListener('click', function () {
    var t = cur(), n = Math.min(C.LIMITS.days, C.tripDays(t.start, t.end));
    while (t.days.length < n) t.days.push({ items: [] });
    renderDays(); renderNights(); save();
  });

  // 持ち物
  $('preset').innerHTML = P.PACKING.map(function (p) { return '<option value="' + p.id + '">' + esc(p.label) + '（' + p.items.length + '）</option>'; }).join('');
  $('preset-add').addEventListener('click', function () {
    var t = cur(), p = P.PACKING.filter(function (x) { return x.id === $('preset').value; })[0];
    if (!p) return;
    var have = {};
    t.packing.forEach(function (x) { have[x.name] = true; });
    var added = 0;
    p.items.forEach(function (name) {
      if (!have[name] && t.packing.length < C.LIMITS.packing) { t.packing.push({ name: name, done: false }); added++; }
    });
    $('preset-msg').textContent = added ? '「' + p.label + '」から ' + added + ' 件を追加しました。' : 'すべて追加ずみです。';
    renderPacking(); save();
  });
  function addPack() {
    var t = cur(), v = $('pack-new').value.trim().slice(0, 40);
    if (!v || t.packing.length >= C.LIMITS.packing) return;
    t.packing.push({ name: v, done: false });
    $('pack-new').value = '';
    renderPacking(); save();
  }
  $('pack-add').addEventListener('click', addPack);
  $('pack-new').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addPack(); } });

  $('stay-add').addEventListener('click', function () {
    var t = cur(); if (t.stays.length >= C.LIMITS.stays) return;
    t.stays.push({ name: '', addr: '', tel: '', checkin: '', memo: '' }); renderStays(); save(); focusLater('st' + (t.stays.length - 1) + 'n');
  });
  $('contact-add').addEventListener('click', function () {
    var t = cur(); if (t.contacts.length >= C.LIMITS.contacts) return;
    t.contacts.push({ name: '', tel: '', memo: '' }); renderContacts(); save(); focusLater('ct' + (t.contacts.length - 1) + 'n');
  });
  $('budget-add').addEventListener('click', function () {
    var t = cur(); if (t.budget.length >= C.LIMITS.budget) return;
    t.budget.push({ name: '', amount: 0, payer: -1 }); renderBudget(); save(); focusLater('bg' + (t.budget.length - 1) + 'n');
  });

  // しおりの切り替え・新規・複製・削除
  $('trip-new').addEventListener('click', function () {
    if (data.trips.length >= C.LIMITS.trips) { alert('しおりは ' + C.LIMITS.trips + ' 件までです。使わないしおりを削除してください。'); return; }
    var t = C.emptyTrip();
    data.trips.push(t); data.active = t.id;
    save(true); renderAll(); focusLater('f-title');
  });
  $('trip-dup').addEventListener('click', function () {
    if (data.trips.length >= C.LIMITS.trips) { alert('しおりは ' + C.LIMITS.trips + ' 件までです。'); return; }
    var t = C.normalizeTrip(JSON.parse(JSON.stringify(cur())));
    t.id = C.emptyTrip().id;
    t.title = (t.title + '（コピー）').slice(0, C.LIMITS.title);
    data.trips.push(t); data.active = t.id;
    save(true); renderAll();
  });
  $('trip-del').addEventListener('click', function () {
    var t = cur();
    if (!confirm('しおり「' + (t.title || 'タイトルなし') + '」を削除しますか？ 元に戻せません。')) return;
    data.trips = data.trips.filter(function (x) { return x.id !== t.id; });
    data = C.normalizeStore(data);   // 0 件になったら空のしおりを 1 つ作る
    save(true); renderAll();
  });

  // 表紙の写真（端末の中で縮小して data URL にする。どこにも送らない）
  $('img-pick').addEventListener('click', function () { $('img-file').click(); });
  $('img-del').addEventListener('click', function () { cur().image = ''; renderImage(); save(); $('img-msg').textContent = '写真を外しました。'; });
  $('img-file').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) { $('img-msg').textContent = '画像のファイルを選んでください。'; return; }
    $('img-msg').textContent = '写真を読み込んでいます…';
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var out = '';
      for (var size = 900; size >= 300; size -= 150) {
        var s = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.naturalWidth * s)); cv.height = Math.max(1, Math.round(img.naturalHeight * s));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        out = cv.toDataURL('image/jpeg', 0.72);
        if (out.length <= 250000) break;
      }
      if (out.length > C.LIMITS.image) { $('img-msg').textContent = '写真が大きすぎて保存できませんでした。'; return; }
      cur().image = out;
      renderImage(); save();
      $('img-msg').textContent = '写真を表紙に入れました（約 ' + Math.round(out.length * 0.75 / 1024) + 'KB）。';
    };
    img.onerror = function () { URL.revokeObjectURL(url); $('img-msg').textContent = 'この画像は読み込めませんでした（HEIC など）。JPEG か PNG でお試しください。'; };
    img.src = url;
  });

  // =========================================================
  // 印刷
  // =========================================================
  function renderPrintHelp() {
    $('print-help').innerHTML = mode === 'booklet'
      ? '印刷の画面で、用紙「A4」・向き「横」・<strong>両面印刷（短辺とじ）</strong>・倍率 100%（余白なし）を選びます。紙を順に重ねて真ん中で折ると、1 ページ目から順に読める A5 の冊子になります。PDF にするときは、送信先・プリンターで「PDF に保存」を選びます。'
      : '印刷の画面で、用紙「A4」・向き「縦」・倍率 100% を選びます。PDF にするときは、送信先・プリンターで「PDF に保存」を選びます。';
  }

  // 印刷用の塊（ブロック）を作る。{ html, breakBefore, keepWithNext }
  function buildBlocks(t) {
    var B = [];
    var add = function (html, o) { B.push(Object.assign({ html: html }, o || {})); };
    var moveText = function (it) {
      if (!it.move && !it.min) return '';
      return '<div class="p-move">↓ ' + esc(it.move || '移動') + (it.min ? '　' + esc(C.formatMin(it.min)) : '') + '</div>';
    };
    // 行程
    t.days.forEach(function (day, di) {
      var s = C.daySummary(day.items);
      add('<h2 class="p-h">' + esc(dayTitle(t, di)) + '</h2>', { keepWithNext: day.items.length > 0 });
      day.items.forEach(function (it, ii) {
        var place = it.place ? (C.mapUrl(it.place) ? '<a href="' + esc(C.mapUrl(it.place)) + '">' + esc(it.place) + '</a>' : esc(it.place)) : '';
        var arrive = s.rows[ii].arrive && day.items[ii + 1] && !day.items[ii + 1].time ? '<span class="p-arr">（着 ' + esc(s.rows[ii].arrive) + ' ごろ）</span>' : '';
        add('<div class="p-item"><div class="p-time">' + esc(it.time) + '</div><div class="p-body"><div class="p-place">' + place + '</div>' +
          (it.memo ? '<div class="p-memo">' + nl2br(it.memo) + '</div>' : '') + '</div></div>' +
          (ii < day.items.length - 1 ? moveText(it).replace('</div>', arrive + '</div>') : ''));
      });
      if (!day.items.length) add('<div class="p-empty">（予定なし）</div>');
      if (s.total) add('<div class="p-total">この日の移動 ' + esc(C.formatMin(s.total)) + '</div>');
    });
    var section = function (title, rows) {
      if (!rows.length) return;
      add('<h2 class="p-h">' + esc(title) + '</h2>', { keepWithNext: true });
      rows.forEach(function (r) { if (typeof r === 'string') add(r); else add(r.html, { keepWithNext: r.keepWithNext }); });
    };
    if (t.print.packing) {
      var rows = [];
      for (var i = 0; i < t.packing.length; i += 2) {
        rows.push('<div class="p-pack">' + t.packing.slice(i, i + 2).map(function (x) {
          return '<span><span class="p-box">' + (x.done ? '✓' : '') + '</span>' + esc(x.name) + '</span>';
        }).join('') + '</div>');
      }
      section('持ち物', rows);
    }
    if (t.print.stays) {
      section('宿', t.stays.filter(function (x) { return x.name || x.addr || x.tel; }).map(function (x) {
        return '<div class="p-card"><div class="p-strong">' + esc(x.name) + (x.checkin ? '<span class="p-sub">　チェックイン ' + esc(x.checkin) + '</span>' : '') + '</div>' +
          (x.addr ? '<div>' + esc(x.addr) + '</div>' : '') + (x.tel ? '<div>電話 ' + esc(x.tel) + '</div>' : '') +
          (x.memo ? '<div class="p-memo">' + nl2br(x.memo) + '</div>' : '') + '</div>';
      }));
    }
    if (t.print.contacts) {
      section('連絡先', t.contacts.filter(function (x) { return x.name || x.tel; }).map(function (x) {
        return '<div class="p-row"><span class="p-strong">' + esc(x.name) + '</span><span>' + esc(x.tel) + '</span>' + (x.memo ? '<span class="p-sub">' + esc(x.memo) + '</span>' : '') + '</div>';
      }));
    }
    if (t.print.budget) {
      var bs = t.budget.filter(function (x) { return x.name || x.amount; });
      if (bs.length) {
        var n = t.members.length, r = C.settle(n, t.budget), sp = C.splitEven(r.total, n);
        var rows2 = bs.map(function (x) {
          return '<div class="p-row"><span>' + esc(x.name || '費用') + (x.payer >= 0 && t.members[x.payer] ? '<span class="p-sub">（' + esc(t.members[x.payer]) + ' が立て替え）</span>' : '') + '</span><span class="p-num">' + yen(x.amount) + '</span></div>';
        });
        rows2.push('<div class="p-row p-strong"><span>合計' + (n ? '（1 人あたり ' + yen(sp.per) + (sp.remainder ? '・余り ' + yen(sp.remainder) : '') + '）' : '') + '</span><span class="p-num">' + yen(r.total) + '</span></div>');
        if (n && r.transfers.length) {
          rows2.push({ html: '<div class="p-sub p-gap">精算</div>', keepWithNext: true });
          r.transfers.forEach(function (x) { rows2.push('<div class="p-row"><span>' + esc(t.members[x.from]) + ' → ' + esc(t.members[x.to]) + '</span><span class="p-num">' + yen(x.amount) + '</span></div>'); });
        }
        section('予算・割り勘', rows2);
      }
    }
    if (t.print.notes && t.notes.trim()) {
      section('メモ', t.notes.split(/\n{2,}/).map(function (para) { return '<p class="p-note">' + nl2br(para) + '</p>'; }));
    }
    return B;
  }

  function coverHtml(t) {
    var art = t.image ? '<img class="p-photo" src="' + esc(t.image) + '" alt="">' : (P.COVER_ART[t.cover] || '');
    return '<div class="p-cover">' +
      '<div class="p-cover-label">旅のしおり</div>' +
      '<h1 class="p-title">' + esc(t.title || '旅のしおり') + '</h1>' +
      (t.sub ? '<div class="p-subtitle">' + esc(t.sub) + '</div>' : '') +
      (art ? '<div class="p-art">' + art + '</div>' : '') +
      (t.start ? '<div class="p-dates">' + esc(C.rangeJa(t.start, t.end)) + (C.nightsLabel(t.start, t.end) ? '<br><span>' + esc(C.nightsLabel(t.start, t.end)) + '</span>' : '') + '</div>' : '') +
      (t.members.length ? '<div class="p-members"><span>メンバー</span>' + t.members.map(esc).join('・') + '</div>' : '') +
    '</div>';
  }

  var CREDIT = 'yorozu-craft.com/tabi-shiori で作成';

  // 論理ページ（読む順）の HTML を作る。1 ページ目は表紙
  function buildPages(t, m) {
    var blocks = buildBlocks(t);
    var box = $('measure');
    box.className = 'paper ' + (m === 'booklet' ? 'size-a5' : 'size-a4');
    box.innerHTML = '<div class="pg"><div class="pg-body" id="measure-body">' + blocks.map(function (b) { return '<div class="blk">' + b.html + '</div>'; }).join('') + '</div></div>';
    var body = $('measure-body');
    var cap = body.clientHeight;
    var heights = Array.prototype.map.call(body.children, function (el) { return el.getBoundingClientRect().height; });
    box.innerHTML = '';
    var groups = C.paginate(blocks.map(function (b, i) { return { h: heights[i], breakBefore: b.breakBefore, keepWithNext: b.keepWithNext }; }), cap);
    var pages = ['<div class="pg-body">' + coverHtml(t) + '</div>'];
    groups.forEach(function (g) {
      pages.push('<div class="pg-body">' + g.map(function (i) { return '<div class="blk">' + blocks[i].html + '</div>'; }).join('') + '</div>');
    });
    return pages;
  }

  function pageHtml(body, no, credit) {
    return '<div class="pg">' + body +
      (no > 1 ? '<div class="pg-no">' + no + '</div>' : '') +
      (credit ? '<div class="pg-credit">' + esc(CREDIT) + '</div>' : '') + '</div>';
  }

  // 印刷する紙（シート）を作る
  function buildSheets(t, m) {
    var pages = buildPages(t, m);
    var credit = t.print.credit;
    if (m === 'booklet') {
      var n = C.padTo4(pages.length);
      var creditPage = n;   // 冊子は裏表紙（最後のページ）に入れる
      var get = function (no) {
        var body = pages[no - 1] || '<div class="pg-body"></div>';
        return pageHtml(body, no <= pages.length ? no : 0, credit && no === creditPage);
      };
      return {
        pages: pages.length, total: n,
        html: C.imposeBooklet(n).map(function (s) {
          return '<div class="sheet sheet-land" data-sheet="' + s.sheet + '" data-side="' + s.side + '" data-pages="' + s.left + ',' + s.right + '">' + get(s.left) + get(s.right) + '</div>';
        }).join(''),
        sides: C.imposeBooklet(n),
      };
    }
    return {
      pages: pages.length, total: pages.length,
      html: pages.map(function (body, i) {
        return '<div class="sheet sheet-a4" data-pages="' + (i + 1) + '">' + pageHtml(body, i + 1, credit && i === pages.length - 1) + '</div>';
      }).join(''),
    };
  }

  function preparePrint() {
    var t = cur();
    $('page-size').textContent = '@page { size: A4 ' + (mode === 'booklet' ? 'landscape' : 'portrait') + '; margin: 0; }';
    var root = $('print-root');
    root.className = 'paper ' + (mode === 'booklet' ? 'size-a5' : 'size-a4');
    var r = buildSheets(t, mode);
    root.innerHTML = r.html;
    return r;
  }

  $('print').addEventListener('click', function () { preparePrint(); window.print(); });
  // ブラウザのメニューから印刷したときも、いまの内容で作り直す
  addEventListener('beforeprint', function () { preparePrint(); });

  var previewScale = function () {
    var wrap = $('preview');
    var w = wrap.clientWidth;
    wrap.querySelectorAll('.pv-sheet').forEach(function (box) {
      var sheet = box.firstElementChild;
      var sw = sheet.offsetWidth, sh = sheet.offsetHeight;
      var s = Math.min(1, (w - 2) / sw);
      sheet.style.transform = 'scale(' + s + ')';
      box.style.width = sw * s + 'px';
      box.style.height = sh * s + 'px';
    });
  };

  function renderPreview() {
    var t = cur();
    var r = buildSheets(t, mode);
    var wrap = $('preview');
    var tmp = document.createElement('div');
    tmp.innerHTML = r.html;
    var sheets = Array.prototype.slice.call(tmp.children);
    var head = mode === 'booklet'
      ? '<p class="small">' + r.pages + ' ページ → 冊子 ' + r.total + ' ページ（A4 の紙 ' + (r.total / 4) + ' 枚・両面）。紙ごとの面付けの順に並んでいます。</p>'
      : '<p class="small">A4 で ' + r.total + ' ページです。</p>';
    wrap.innerHTML = head + sheets.map(function (s) {
      var label = mode === 'booklet'
        ? s.getAttribute('data-sheet') + ' 枚目の' + s.getAttribute('data-side') + '（左 ' + s.getAttribute('data-pages').replace(',', ' ページ・右 ') + ' ページ）'
        : s.getAttribute('data-pages') + ' ページ';
      return '<figure class="pv"><div class="pv-sheet paper ' + (mode === 'booklet' ? 'size-a5' : 'size-a4') + '">' + s.outerHTML + '</div><figcaption>' + esc(label) + '</figcaption></figure>';
    }).join('');
    previewScale();
  }
  addEventListener('resize', function () { if (!$('preview').hidden) previewScale(); });

  $('preview-btn').addEventListener('click', function () {
    var p = $('preview');
    p.hidden = !p.hidden;
    this.setAttribute('aria-expanded', String(!p.hidden));
    this.textContent = p.hidden ? '印刷の見本を見る' : '印刷の見本を閉じる';
    if (!p.hidden) renderPreview(); else p.innerHTML = '';
  });

  // =========================================================
  // 共有リンク（README「ツールを追加するとき」11。入力内容は # 以降）
  // =========================================================
  function clearShare() { $('share-url').hidden = true; $('share-msg').textContent = ''; }
  $('share').addEventListener('click', function () {
    var withContacts = $('share-contacts').checked;
    var t = cur();
    if (withContacts && (t.contacts.some(function (x) { return x.tel; }) || t.stays.some(function (x) { return x.tel || x.addr; })) &&
      !confirm('電話番号・住所を含めた共有リンクを作ります。リンクを受け取った人は誰でも読めます。よろしいですか？')) return;
    C.encodeShare(t, { withContacts: withContacts }).then(function (code) {
      var url = location.href.split('#')[0] + '#s=' + code;
      if (url.length > C.SHARE_MAX) {
        clearShare();
        $('share-msg').textContent = 'しおりの内容が多いため、共有リンクが長くなりすぎます（' + url.length.toLocaleString('ja-JP') + ' 文字）。「ファイルに書き出す」でファイルを作り、そのファイルを送ってください。';
        return;
      }
      var inp = $('share-url');
      inp.value = url; inp.hidden = false;
      var done = function (ok) {
        $('share-msg').textContent = (ok ? '共有リンクをコピーしました。' : 'リンクを長押し（右クリック）してコピーしてください。') +
          'LINE やメールに貼り付けて送れます（' + url.length.toLocaleString('ja-JP') + ' 文字）。' + (t.image ? '表紙の写真は入っていません。' : '');
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { done(true); }, function () { inp.select(); done(false); });
      else { inp.select(); done(false); }
    });
  });

  // 共有リンクで開いたしおりを、自分の端末に保存する
  $('shared-save').addEventListener('click', function () {
    if (!shared) return;
    if (data.trips.length >= C.LIMITS.trips) { alert('しおりは ' + C.LIMITS.trips + ' 件までです。使わないしおりを削除してから保存してください。'); return; }
    shared.id = C.emptyTrip().id;
    // 最初の空のしおりしか無ければ、置き換える
    if (data.trips.length === 1 && isBlank(data.trips[0])) data.trips = [];
    data.trips.push(shared); data.active = shared.id;
    shared = null;
    history.replaceState(null, '', location.pathname + location.search);
    save(true); renderAll();
    showLoadMsg('このしおりを、この端末に保存しました。');
  });

  function isBlank(t) {
    return !t.title && !t.start && !t.members.length && !t.packing.length && !t.stays.length && !t.contacts.length && !t.budget.length && !t.notes &&
      t.days.every(function (d) { return !d.items.length; });
  }

  // 「自分のしおりを作る」（#new）: 共有の表示をやめて、白紙のしおりを開く
  function startNew() {
    shared = null;
    history.replaceState(null, '', location.pathname + location.search);
    var blank = data.trips.filter(isBlank)[0], msg = '白紙のしおりを開きました。';
    if (blank) data.active = blank.id;
    else if (data.trips.length < C.LIMITS.trips) { var t = C.emptyTrip(); data.trips.push(t); data.active = t.id; }
    else msg = 'しおりが ' + C.LIMITS.trips + ' 件あるため、新しく作れませんでした。使わないしおりを削除してください。';
    save(true); renderAll();
    showLoadMsg(msg);
    focusLater('f-title');
  }

  function readHash() {
    var h = location.hash;
    if (h === '#new') { startNew(); return Promise.resolve(); }
    var m = /^#s=([A-Za-z0-9_-]+)$/.exec(h);
    if (!m) return Promise.resolve();
    return C.decodeShare(m[1]).then(function (t) {
      if (!t) { showLoadMsg('共有リンクを読み込めませんでした。リンクが途中で切れていないか確かめてください。'); return; }
      shared = t;
      showLoadMsg('');
      renderAll();
      window.scrollTo(0, 0);
    });
  }
  addEventListener('hashchange', function () { readHash(); });

  // =========================================================
  // ファイルへの書き出し・読み込み（README「ツールを追加するとき」20。決定 D31）
  // data は localStorage の tabi-shiori_trips と同じ形。端末の中で作り、どこにも送信しない
  // =========================================================
  $('backup-export').addEventListener('click', function () {
    save(true);
    var json = JSON.stringify(C.buildBackup(TOOL, { trips: data }), null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = C.backupFileName(TOOL);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    $('backup-msg').textContent = 'ファイルに書き出しました（しおり ' + data.trips.length + ' 件）。機種変更のときは、このファイルを新しい端末に移して「ファイルから読み込む」を押してください。' +
      (blob.size > C.BACKUP_MAX_BYTES ? '※ファイルが 1MB を超えたため、このツールで読み込めません。写真を外したしおりで書き出し直してください。' : '');
  });
  $('backup-import').addEventListener('click', function () { $('backup-file').click(); });
  $('backup-file').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    if (file.size > C.BACKUP_MAX_BYTES) { $('backup-msg').textContent = 'ファイルが大きすぎます（1MB まで）。このツールで書き出したファイルを選んでください。'; return; }
    file.text().then(function (text) {
      var r = C.parseBackup(text, TOOL, ['trips']);
      if (!r.ok) { $('backup-msg').textContent = r.error; return; }
      var next = C.normalizeStore(r.data.trips);
      if (!confirm('今のしおり（' + data.trips.length + ' 件）を、ファイルのしおり（' + next.trips.length + ' 件）に置き換えます。よろしいですか？')) return;
      data = next; shared = null;
      history.replaceState(null, '', location.pathname + location.search);
      save(true); renderAll();
      $('backup-msg').textContent = 'ファイルから読み込みました（しおり ' + next.trips.length + ' 件）。';
    }, function () { $('backup-msg').textContent = 'ファイルを読み取れませんでした。'; });
  });

  // =========================================================
  // 起動
  // =========================================================
  renderAll();
  readHash().then(function () {
    growAll(main);
    document.documentElement.classList.remove('js-loading');
  });
})();
