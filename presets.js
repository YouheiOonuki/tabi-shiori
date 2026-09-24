// ===========================
// 旅のしおりメーカー — 定番の持ち物と表紙の絵柄（画面と印刷で使う固定のデータ）
// ブラウザでは window.Presets
// ===========================
(function (root) {
  'use strict';

  // 持ち物の定番。追加すると、すでにある名前は足さない
  var PACKING = [
    { id: 'basic', label: '基本', items: ['財布', 'スマホ', '充電器・ケーブル', 'モバイルバッテリー', '身分証', '健康保険証', 'チケット・予約の控え', '常備薬', 'ハンカチ・ティッシュ', '折りたたみ傘', 'エコバッグ'] },
    { id: 'stay', label: '泊まり', items: ['着替え', '下着・靴下', 'パジャマ', '洗面用具', 'スキンケア', 'コンタクト・メガネ', 'ヘアゴム・ブラシ', 'ビニール袋（洗濯物用）'] },
    { id: 'kids', label: '子ども連れ', items: ['おむつ・おしりふき', '着替え（多めに）', 'おやつ・飲みもの', 'おもちゃ・絵本', '母子手帳・子どもの保険証', '抱っこひも', 'ウェットティッシュ'] },
    { id: 'abroad', label: '海外', items: ['パスポート', 'ビザ・入国の書類', '航空券（eチケット）', '海外旅行保険の証書', 'クレジットカード', '現地の通貨', '変換プラグ', 'SIM・Wi-Fi ルーター', 'ペン（入国カード用）'] },
    { id: 'onsen', label: '温泉', items: ['タオル・バスタオル', '湯上がりの着替え', '化粧水・乳液', '小銭（ロッカー用）'] },
    { id: 'beach', label: '海・プール', items: ['水着', 'ラッシュガード', 'ビーチサンダル', '日焼け止め', 'サングラス・帽子', '防水ケース', 'ゴーグル'] },
    { id: 'winter', label: '冬・雪', items: ['コート・ダウン', '手袋', 'マフラー・ネックウォーマー', 'カイロ', '滑りにくい靴', 'リップクリーム'] },
    { id: 'camp', label: 'キャンプ', items: ['テント', '寝袋', 'マット', 'ランタン・ライト', '虫よけ', 'クーラーボックス', 'ゴミ袋', '軍手'] },
  ];

  // 表紙の絵柄（SVG）。色は印刷でもきれいに出る落ち着いた色に固定
  var S = 'viewBox="0 0 240 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"';
  var COVER_ART = {
    none: '',
    mountain: '<svg ' + S + '><circle cx="186" cy="34" r="16" fill="#e8b04a"/><path d="M0 128 L62 48 L96 90 L132 36 L200 128 Z" fill="#6f8f6a"/><path d="M120 128 L170 70 L240 128 Z" fill="#8fae88"/><path d="M132 36 L145 53 L136 50 L128 58 L121 51 Z" fill="#f4f1ea"/><rect x="0" y="126" width="240" height="14" fill="#a7c3a0"/></svg>',
    sea: '<svg ' + S + '><circle cx="60" cy="40" r="18" fill="#e8b04a"/><path d="M0 78 H240 V140 H0 Z" fill="#5f93b8"/><path d="M0 92 q15 -8 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0" fill="none" stroke="#dcebf4" stroke-width="3"/><path d="M0 112 q15 -8 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0" fill="none" stroke="#dcebf4" stroke-width="3"/><path d="M150 76 L176 76 L170 84 L156 84 Z" fill="#8b4513"/><path d="M163 44 L163 76 L182 72 Z" fill="#f4f1ea" stroke="#8b4513" stroke-width="1.5"/></svg>',
    city: '<svg ' + S + '><rect x="14" y="62" width="34" height="68" fill="#8a7f9c"/><rect x="52" y="34" width="30" height="96" fill="#6d6485"/><rect x="88" y="74" width="40" height="56" fill="#a99fbb"/><path d="M146 130 V56 L160 36 L174 56 V130 Z" fill="#b5542f"/><rect x="180" y="52" width="44" height="78" fill="#8a7f9c"/><g fill="#f4e7b5"><rect x="20" y="72" width="6" height="8"/><rect x="34" y="72" width="6" height="8"/><rect x="20" y="92" width="6" height="8"/><rect x="58" y="46" width="6" height="8"/><rect x="70" y="46" width="6" height="8"/><rect x="58" y="70" width="6" height="8"/><rect x="186" y="64" width="6" height="8"/><rect x="200" y="64" width="6" height="8"/><rect x="186" y="84" width="6" height="8"/></g><rect x="0" y="128" width="240" height="12" fill="#5a5470"/></svg>',
    train: '<svg ' + S + '><rect x="0" y="118" width="240" height="4" fill="#6e604f"/><g fill="#6e604f"><rect x="10" y="122" width="6" height="10"/><rect x="50" y="122" width="6" height="10"/><rect x="90" y="122" width="6" height="10"/><rect x="130" y="122" width="6" height="10"/><rect x="170" y="122" width="6" height="10"/><rect x="210" y="122" width="6" height="10"/></g><path d="M30 110 V62 q0 -16 16 -16 H190 q26 0 34 30 l6 34 Z" fill="#3f7fb0"/><rect x="30" y="92" width="200" height="8" fill="#f4f1ea"/><g fill="#dcebf4"><rect x="46" y="60" width="22" height="18" rx="3"/><rect x="76" y="60" width="22" height="18" rx="3"/><rect x="106" y="60" width="22" height="18" rx="3"/><rect x="136" y="60" width="22" height="18" rx="3"/><path d="M168 60 H194 q12 0 18 18 H168 Z"/></g><g fill="#3a3025"><circle cx="60" cy="114" r="6"/><circle cx="100" cy="114" r="6"/><circle cx="160" cy="114" r="6"/><circle cx="200" cy="114" r="6"/></g></svg>',
    onsen: '<svg ' + S + '><ellipse cx="120" cy="116" rx="92" ry="18" fill="#c0643c"/><ellipse cx="120" cy="112" rx="78" ry="12" fill="#e9a07c"/><g fill="none" stroke="#c0643c" stroke-width="6" stroke-linecap="round"><path d="M86 92 q-12 -16 0 -32 q12 -16 0 -32"/><path d="M120 92 q-12 -16 0 -32 q12 -16 0 -32"/><path d="M154 92 q-12 -16 0 -32 q12 -16 0 -32"/></g></svg>',
  };
  var COVER_LABELS = { none: 'なし', mountain: '山', sea: '海', city: '街', train: '電車', onsen: '温泉' };

  var api = { PACKING: PACKING, COVER_ART: COVER_ART, COVER_LABELS: COVER_LABELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Presets = api;
})(this);
