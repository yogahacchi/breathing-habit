'use strict';

// ============================================================
//  Hacchi 共通ロジック
//  - 月齢計算・新月検出
//  - プログラム状態管理（localStorage）
//  - コンテンツアンロックロジック
//  - ナビゲーション
//  - 時計表示
// ============================================================

// ── 月齢計算 ──────────────────────────────────────────────
var LUNAR_CYCLE = 29.53058867;
var KNOWN_NEW_MOON = new Date(Date.UTC(2000, 0, 6, 18, 14)); // 2000-01-06 既知の新月

function getMoonAge(date) {
  var diff = (date - KNOWN_NEW_MOON) / (1000 * 60 * 60 * 24);
  return ((diff % LUNAR_CYCLE) + LUNAR_CYCLE) % LUNAR_CYCLE;
}

function moonEmoji(age) {
  if (age < 1.5)  return '🌑';
  if (age < 5.5)  return '🌒';
  if (age < 9.5)  return '🌓';
  if (age < 12.5) return '🌔';
  if (age < 16.5) return '🌕';
  if (age < 20.5) return '🌖';
  if (age < 24.5) return '🌗';
  if (age < 28)   return '🌘';
  return '🌑';
}

function getNextNewMoon(date) {
  var cycleMs = LUNAR_CYCLE * 24 * 60 * 60 * 1000;
  var diff = date - KNOWN_NEW_MOON;
  var elapsed = ((diff % cycleMs) + cycleMs) % cycleMs;
  var remaining = cycleMs - elapsed;
  return new Date(date.getTime() + remaining);
}

// 今日が新月かどうか（ローカル日付で判定）
function isTodayNewMoon() {
  var now = new Date();
  var dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var dayEnd   = new Date(dayStart.getTime() + 86400000);
  // 今日0時の直前を起点に「次の新月」を取得し、今日中に収まるか確認
  var nm = getNextNewMoon(new Date(dayStart.getTime() - 1));
  return nm >= dayStart && nm < dayEnd;
}

// ── localStorage キー ──────────────────────────────────────
var KEYS = {
  programState:   'hacchi_state',        // 'waiting' | 'program'
  startDate:      'hacchi_start',        // ISO date string (YYYY-MM-DD)
  checkIns:       'hacchi_checkins',     // JSON array of date strings
  weeklyForms:    'hacchi_forms',        // JSON object {week: {…}}
  ifThenTrigger:  'hacchi_ifthen_trig',
  ifThenAction:   'hacchi_ifthen_act',
  userName:       'hacchi_name',
  notifyEnabled:  'hacchi_notify'
};

// ── プログラム状態 ──────────────────────────────────────────
function getProgramState() {
  return localStorage.getItem(KEYS.programState) || 'waiting';
}

function setProgramState(state) {
  localStorage.setItem(KEYS.programState, state);
}

function getStartDate() {
  var s = localStorage.getItem(KEYS.startDate);
  return s ? new Date(s) : null;
}

function setStartDate(dateStr) {
  localStorage.setItem(KEYS.startDate, dateStr);
}

// プログラム開始日から何日目か（Day 1始まり）
function getDayNumber() {
  var start = getStartDate();
  if (!start) return 0;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  var diff = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  return diff + 1; // Day 1始まり
}

function getWeekNumber() {
  var day = getDayNumber();
  if (day <= 0) return 0;
  return Math.min(Math.ceil(day / 7), 8);
}

function getPhaseLabel(week) {
  if (week <= 2) return '抵抗期';
  if (week === 3) return '安定移行期';
  if (week <= 5) return '倦怠期';
  if (week === 6) return '6週間の谷';
  if (week === 7) return '安定期へ';
  return '自立準備期';
}

// ── コンテンツアンロック ──────────────────────────────────────
function isUnlocked(requiredDay) {
  if (getProgramState() !== 'program') return false;
  return getDayNumber() >= requiredDay;
}

function daysUntilUnlock(requiredDay) {
  return Math.max(0, requiredDay - getDayNumber());
}

// ── チェックイン ──────────────────────────────────────────────
function getCheckIns() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.checkIns) || '[]');
  } catch(e) { return []; }
}

function todayStr() {
  var t = new Date();
  return t.getFullYear() + '-' +
    String(t.getMonth() + 1).padStart(2, '0') + '-' +
    String(t.getDate()).padStart(2, '0');
}

function isCheckedInToday() {
  return getCheckIns().indexOf(todayStr()) !== -1;
}

function recordCheckIn() {
  var cis = getCheckIns();
  var today = todayStr();
  if (cis.indexOf(today) === -1) {
    cis.push(today);
    localStorage.setItem(KEYS.checkIns, JSON.stringify(cis));
  }
  return cis;
}

function getTotalDays() {
  return getCheckIns().length;
}

function getStreak() {
  var cis = getCheckIns().sort();
  if (!cis.length) return 0;
  var streak = 0;
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  for (var i = 0; i < 60; i++) {
    var s = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
    if (cis.indexOf(s) !== -1) {
      streak++;
    } else if (i > 0) {
      break;
    }
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// ── 週次フォーム ──────────────────────────────────────────────
function getWeeklyForms() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.weeklyForms) || '{}');
  } catch(e) { return {}; }
}

function saveWeeklyForm(weekNum, data) {
  var forms = getWeeklyForms();
  forms[weekNum] = data;
  localStorage.setItem(KEYS.weeklyForms, JSON.stringify(forms));
}

function isFormSubmitted(weekNum) {
  return !!getWeeklyForms()[weekNum];
}

// ── デイリーメッセージ ────────────────────────────────────────
function getTodayMessage() {
  if (typeof DAILY_MESSAGES === 'undefined') return '';
  var day = getDayNumber();
  if (day < 1 || day > 56) return '';
  return DAILY_MESSAGES[day] || '';
}

// ── If-Thenルール ────────────────────────────────────────────
function getIfThen() {
  return {
    trigger: localStorage.getItem(KEYS.ifThenTrigger) || '',
    action:  localStorage.getItem(KEYS.ifThenAction)  || ''
  };
}

function saveIfThen(trigger, action) {
  localStorage.setItem(KEYS.ifThenTrigger, trigger);
  localStorage.setItem(KEYS.ifThenAction, action);
}

// ── ナビゲーション ────────────────────────────────────────────
function navigate(page) {
  window.location.href = page;
}

function initNav(activeId) {
  // activeId: 'home' | 'practice' | 'record' | 'settings'

  // 練習選択モーダルをDOMに追加（まだなければ）
  if (!document.getElementById('practice-chooser-modal')) {
    var modalHtml = '<div class="modal-bg" id="practice-chooser-modal" style="align-items:flex-end;">' +
      '<div class="modal-sheet" style="width:100%;max-width:480px;padding-bottom:28px;">' +
        '<div class="modal-handle"></div>' +
        '<div style="font-size:13px;font-weight:500;color:var(--ink);margin-bottom:16px;text-align:center;">練習メニュー</div>' +
        '<div style="display:flex;flex-direction:column;gap:10px;">' +
          '<div onclick="navigate(\'metronome.html\')" style="background:var(--sand);border-radius:14px;padding:16px 18px;display:flex;align-items:center;gap:14px;cursor:pointer;">' +
            '<div style="width:44px;height:44px;border-radius:12px;background:var(--teal-l);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">⏱</div>' +
            '<div>' +
              '<div style="font-size:13px;font-weight:500;color:var(--ink);margin-bottom:2px;">メトロノーム</div>' +
              '<div style="font-size:10px;color:var(--ink3);">呼吸のリズムをつくる</div>' +
            '</div>' +
            '<div style="margin-left:auto;font-size:16px;color:var(--ink3);">›</div>' +
          '</div>' +
          '<div onclick="navigate(\'library.html\')" style="background:var(--sand);border-radius:14px;padding:16px 18px;display:flex;align-items:center;gap:14px;cursor:pointer;">' +
            '<div style="width:44px;height:44px;border-radius:12px;background:var(--teal-l);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">📖</div>' +
            '<div>' +
              '<div style="font-size:13px;font-weight:500;color:var(--ink);margin-bottom:2px;">呼吸法ライブラリ</div>' +
              '<div style="font-size:10px;color:var(--ink3);">ワーク・図解を見る</div>' +
            '</div>' +
            '<div style="margin-left:auto;font-size:16px;color:var(--ink3);">›</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('practice-chooser-modal').addEventListener('click', function(e) {
      if (e.target === this) this.classList.remove('show');
    });
  }

  var items = document.querySelectorAll('.nav-item');
  items.forEach(function(item) {
    var icon = item.querySelector('.nav-icon');
    var lbl  = item.querySelector('.nav-lbl');
    var id   = item.dataset.nav;
    if (icon) icon.classList.toggle('active', id === activeId);
    if (lbl)  lbl.classList.toggle('active', id === activeId);
    item.addEventListener('click', function() {
      if (id === 'practice') {
        document.getElementById('practice-chooser-modal').classList.add('show');
        return;
      }
      var pages = {
        home:     getProgramState() === 'program' ? 'home.html' : 'waiting.html',
        record:   'dashboard.html',
        settings: 'settings.html'
      };
      if (pages[id]) navigate(pages[id]);
    });
  });
}

// ── 時計表示 ────────────────────────────────────────────────
function startClock(elId) {
  var el = document.getElementById(elId);
  if (!el) return;
  function tick() {
    var t = new Date();
    el.textContent =
      String(t.getHours()).padStart(2, '0') + ':' +
      String(t.getMinutes()).padStart(2, '0');
  }
  tick();
  setInterval(tick, 10000);
}

// ── 新月到来チェック（ページロード時に実行） ───────────────────
function checkNewMoonTransition() {
  if (getProgramState() === 'waiting' && isTodayNewMoon()) {
    // 新月の日 → プログラム開始日を今日に設定
    setStartDate(todayStr());
    setProgramState('program');
    return true;
  }
  return false;
}

// ── カウントダウン更新 ──────────────────────────────────────
function updateCountdown(daysId, hoursId, minsId) {
  var nm = getNextNewMoon(new Date());
  var diff = nm - new Date();
  if (diff < 0) diff = 0;
  var days  = Math.floor(diff / (1000 * 60 * 60 * 24));
  var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  var mins  = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  var dEl = document.getElementById(daysId);
  var hEl = document.getElementById(hoursId);
  var mEl = document.getElementById(minsId);
  if (dEl) dEl.textContent = days;
  if (hEl) hEl.textContent = String(hours).padStart(2, '0');
  if (mEl) mEl.textContent = String(mins).padStart(2, '0');
}

// ── 月の満ち欠けトラック ──────────────────────────────────
function buildMoonTrack(containerId) {
  var el = document.getElementById(containerId);
  if (!el) return;
  var age = getMoonAge(new Date());
  var segs = 30;
  var cur = Math.round(age / 29.53 * segs);
  el.innerHTML = '';
  for (var i = 0; i < segs; i++) {
    var s = document.createElement('div');
    s.className = 'moon-seg' + (i < cur ? ' past' : i === cur ? ' current' : '');
    el.appendChild(s);
  }
}
