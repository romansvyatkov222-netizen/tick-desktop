// Логика главного окна. Состояние таймера живёт в Rust — сюда приходят
// только события tick/finished, отсюда уходят команды start/pause/resume/stop.

import { CONFIG } from './config.js';
import { STR } from './strings.js';
import { formatHMS, formatDateTime } from './format.js';
import { icon } from './icons.js';
import { getHistory, addHistoryEntry, clearHistory } from './history.js';

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const els = {
  ring: document.getElementById('ring'),
  countdown: document.getElementById('countdown'),
  countdownStatus: document.getElementById('countdown-status'),
  countdownWrap: document.querySelector('.countdown-wrap'),
  controls: document.getElementById('controls'),
  setupOverlay: document.getElementById('setup-overlay'),
  setupTitle: document.getElementById('setup-title'),
  setupHandle: document.getElementById('setup-handle'),
  setupStart: document.getElementById('setup-start'),
  setupCancel: document.getElementById('setup-cancel'),
  nameInput: document.getElementById('timer-name'),
  pickersWrap: document.getElementById('pickers'),
  nav: document.getElementById('nav'),
  screens: {
    home: document.getElementById('screen-home'),
    history: document.getElementById('screen-history'),
  },
  historyList: document.getElementById('history-list'),
  historyEmpty: document.getElementById('history-empty'),
  historyTitle: document.getElementById('history-title'),
  clearHistoryBtn: document.getElementById('clear-history'),
  overlay: document.getElementById('confirm-overlay'),
  confirmTitle: document.getElementById('confirm-title'),
  confirmYes: document.getElementById('confirm-yes'),
  confirmNo: document.getElementById('confirm-no'),
};

// Режим интерфейса: idle | running | paused
let mode = 'idle';
// Запущенный таймер: длительность и остаток
let durationMs = 0;
let remainingMs = 0;
// Выбранная (ещё не запущенная) длительность — показывает циферблат в покое
let pendingMs = CONFIG.defaultDurationMs;
let ringCircumference = 0;
let progressCircle = null;
const pickers = [];

/* ===== Кольцо ===== */

function buildRing() {
  const { size, stroke } = CONFIG.ring;
  const c = size / 2;
  const r = (size - stroke) / 2 - 1;
  ringCircumference = 2 * Math.PI * r;

  const svgNS = 'http://www.w3.org/2000/svg';
  els.ring.setAttribute('viewBox', `0 0 ${size} ${size}`);
  els.ring.setAttribute('width', size);
  els.ring.setAttribute('height', size);

  const track = document.createElementNS(svgNS, 'circle');
  track.setAttribute('class', 'ring-track');
  for (const [k, v] of Object.entries({ cx: c, cy: c, r })) track.setAttribute(k, v);

  progressCircle = document.createElementNS(svgNS, 'circle');
  progressCircle.setAttribute('class', 'ring-progress');
  for (const [k, v] of Object.entries({ cx: c, cy: c, r })) progressCircle.setAttribute(k, v);
  progressCircle.style.strokeDasharray = String(ringCircumference);
  progressCircle.style.strokeDashoffset = '0';
  progressCircle.setAttribute('transform', `rotate(-90 ${c} ${c})`);

  els.ring.append(track, progressCircle);
}

/** Дуга пропорциональна остатку; в покое кольцо полное. */
function renderProgress() {
  const ratio = mode === 'idle' || durationMs === 0 ? 1 : remainingMs / durationMs;
  progressCircle.style.strokeDashoffset = String(ringCircumference * (1 - Math.max(0, Math.min(1, ratio))));
}

/* ===== Колёсика-пикеры в стиле iOS (в диалоге «Поставить таймер») ===== */

function createPicker(container, { min, max }) {
  const scroller = document.createElement('div');
  scroller.className = 'picker';
  const list = document.createElement('ul');
  for (let v = min; v <= max; v++) {
    const li = document.createElement('li');
    li.textContent = String(v).padStart(2, '0');
    list.appendChild(li);
  }
  scroller.appendChild(list);
  container.appendChild(scroller);

  const itemH = list.children[0].getBoundingClientRect().height || 36;
  const state = { index: min, itemH, items: [...list.children] };

  const paint = () => {
    state.items.forEach((li, i) => {
      const distance = Math.abs(i - state.index);
      li.classList.toggle('center', distance === 0);
      li.classList.toggle('near', distance === 1);
    });
  };

  // Мгновенно догоняем точную позицию после остановки прокрутки —
  // иначе колонки могут «замереть» на промежуточных сотых пикселя и разъехаться
  let snapTimer = null;
  const enforceSnap = () => {
    const target = state.index * itemH;
    if (Math.abs(scroller.scrollTop - target) > 0.5) {
      scroller.scrollTo({ top: target, behavior: 'instant' });
    }
  };

  const onScrolled = () => {
    state.index = Math.max(min, Math.min(max, Math.round(scroller.scrollTop / itemH)));
    paint();
    onPendingChange();
    clearTimeout(snapTimer);
    snapTimer = setTimeout(enforceSnap, 80);
  };

  // Прокрутка колесом отключена: только перетаскивание и клик по значению
  scroller.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  scroller.addEventListener('scroll', onScrolled);
  // Перетаскивание мышью
  scroller.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    scroller.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startScroll = scroller.scrollTop;
    scroller.classList.add('dragging');
    const onMove = (ev) => {
      scroller.scrollTop = startScroll - (ev.clientY - startY);
    };
    const onUp = () => {
      scroller.classList.remove('dragging');
      scroller.removeEventListener('pointermove', onMove);
      scroller.removeEventListener('pointerup', onUp);
      // Дотягиваем до ближайшего значения
      scroller.scrollTo({ top: state.index * itemH, behavior: 'smooth' });
    };
    scroller.addEventListener('pointermove', onMove);
    scroller.addEventListener('pointerup', onUp);
  });
  // Клик по значению — выбрать его
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    const idx = state.items.indexOf(li);
    scroller.scrollTo({ top: idx * itemH, behavior: 'smooth' });
  });

  return {
    setValue(v) {
      const idx = Math.max(min, Math.min(max, Math.round(v)));
      state.index = idx;
      // Прокрутку задаём только когда контейнер реально прокручивается:
      // в скрытом диалоге она зажимается в ноль и сбрасывает выбор
      if (scroller.scrollHeight > itemH) {
        scroller.scrollTop = idx * itemH;
      }
      paint();
    },
    getValue: () => state.index,
  };
}

function buildPickers() {
  pickers.push(
    createPicker(els.pickersWrap, CONFIG.pickers.hours),
    createPicker(els.pickersWrap, CONFIG.pickers.minutes),
    createPicker(els.pickersWrap, CONFIG.pickers.seconds),
  );
}

function pickersDurationMs() {
  const [h, m, s] = pickers.map((p) => p.getValue());
  return (h * 3600 + m * 60 + s) * 1000;
}

function setPickerDuration(ms) {
  const total = Math.floor(ms / 1000);
  pickers[0].setValue(Math.floor(total / 3600));
  pickers[1].setValue(Math.floor(total / 60) % 60);
  pickers[2].setValue(total % 60);
}

/* ===== Режимы и кнопки ===== */

function lastDurationMs() {
  const saved = Number(localStorage.getItem(CONFIG.storageKeys.lastDurationMs));
  return Number.isFinite(saved) && saved > 0 ? saved : CONFIG.defaultDurationMs;
}

function setMode(next) {
  mode = next;
  document.body.classList.remove('mode-idle', 'mode-running', 'mode-paused');
  document.body.classList.add(`mode-${next}`);
  els.countdownWrap.classList.toggle('muted', next === 'idle');
  els.countdownStatus.textContent = next === 'paused' ? STR.pausedLabel : '';
  renderControls();
  renderProgress();
}
function restoreIdle() {
  pendingMs = lastDurationMs();
  setPickerDuration(pendingMs);
  renderReset();
  setMode('idle');
}

function renderReset() {
  els.countdown.textContent = formatHMS(pendingMs);
}

/** Обратный отсчёт живёт на своём значении (обновляется событиями tick). */
function renderCountdown() {
  els.countdown.textContent = formatHMS(remainingMs);
  renderProgress();
}

const iconButtons = {
  idle: () => [
    {
      icon: 'play',
      cls: 'btn-round glass',
      action: startLast,
      disabled: () => pendingMs <= 0,
      title: STR.start,
    },
    {
      icon: 'timer',
      cls: 'btn-round glass',
      action: openSetup,
      title: STR.setTimer,
    },
  ],
  running: () => [
    { icon: 'pause', cls: 'btn-round glass', action: pauseTimer, title: STR.pause },
    { icon: 'square', cls: 'btn-round glass muted-icon', action: stopTimer, title: STR.stop },
  ],
  paused: () => [
    { icon: 'play', cls: 'btn-round glass', action: resumeTimer, title: STR.resume },
    { icon: 'square', cls: 'btn-round glass muted-icon', action: stopTimer, title: STR.stop },
  ],
};

function renderControls() {
  els.controls.replaceChildren();
  for (const spec of iconButtons[mode]()) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = spec.cls;
    btn.setAttribute('aria-label', spec.title ?? '');
    btn.innerHTML = icon(spec.icon, 22);
    btn.disabled = spec.disabled ? spec.disabled() : false;
    btn.addEventListener('click', spec.action);
    els.controls.appendChild(btn);
  }
}

/* ===== Диалог «Поставить таймер» ===== */

function openSetup() {
  els.nameInput.value = localStorage.getItem(CONFIG.storageKeys.lastName) ?? '';
  els.setupTitle.textContent = STR.setTimer;
  els.setupStart.textContent = STR.start;
  els.setupCancel.textContent = STR.cancel;
  // Сначала показываем диалог и форсируем пересчёт layout: в скрытом
  // контейнере пикеры нулевой высоты, и значения зажимаются в ноль
  els.setupOverlay.hidden = false;
  els.pickersWrap.getBoundingClientRect();
  setPickerDuration(pendingMs);
  onPendingChange();
  els.nameInput.focus();
}

function closeSetup() {
  els.setupOverlay.hidden = true;
}

function onPendingChange() {
  pendingMs = pickersDurationMs();
  els.setupStart.disabled = pendingMs <= 0;
  if (mode === 'idle') renderReset();
}

async function startTimer(ms) {
  if (ms <= 0) return;
  const name = els.nameInput.value.trim();
  localStorage.setItem(CONFIG.storageKeys.lastDurationMs, String(ms));
  localStorage.setItem(CONFIG.storageKeys.lastName, name);
  closeSetup();
  durationMs = ms;
  remainingMs = ms;
  await invoke('start_timer', { name: name || null, durationMs: ms });
  renderCountdown();
  setMode('running');
}

/** Пуск с последней длительности прямо с циферблата. */
function startLast() {
  if (mode !== 'idle') return;
  startTimer(pendingMs || lastDurationMs());
}

/* ===== Команды Rust ===== */

async function pauseTimer() {
  await invoke('pause_timer');
  setMode('paused');
}

async function resumeTimer() {
  await invoke('resume_timer');
  setMode('running');
}

/** Ручная остановка: запись в историю со статусом «Остановлен вручную». */
async function stopTimer() {
  const endTime = Date.now();
  await invoke('stop_timer');
  addHistoryEntry({
    // Название — из последнего использованного (Rust сбрасывает его при остановке)
    name: localStorage.getItem(CONFIG.storageKeys.lastName) ?? '',
    durationMs,
    endedAt: endTime,
    status: 'stopped',
  });
  restoreIdle();
}

/** Применяем сохранённое состояние Rust (в т.ч. после перезапуска приложения). */
function applyState(s) {
  if (s.finished || !s.running) {
    restoreIdle();
    return;
  }
  durationMs = s.duration_ms;
  localStorage.setItem(CONFIG.storageKeys.lastName, s.name ?? '');
  if (s.paused) {
    remainingMs = s.remaining_paused;
    renderCountdown();
    setMode('paused');
  } else {
    remainingMs = Math.max(0, s.end_ts - Date.now());
    renderCountdown();
    setMode('running');
  }
}

/* ===== Отрисовка отсчёта и события ===== */

function onTick(e) {
  if (mode !== 'running') return;
  remainingMs = e.payload.remaining_ms;
  renderCountdown();
}

function onFinished() {
  // Модальное окно уже показано Rust; главный экран возвращается к ожиданию
  restoreIdle();
}

/* ===== История ===== */

function historyCard(item) {
  const card = document.createElement('div');
  card.className = 'card glass';
  card.innerHTML = `
    <div class="card-top">
      <div class="card-name"></div>
      <div class="badge ${item.status === 'finished' ? 'finished' : ''}"></div>
    </div>
    <div class="card-bottom">
      <div class="card-duration">${formatHMS(item.durationMs)}</div>
      <div class="card-date">${formatDateTime(item.endedAt)}</div>
    </div>`;
  card.querySelector('.card-name').textContent = item.name || STR.noName;
  card.querySelector('.badge').textContent =
    item.status === 'finished' ? STR.statusFinished : STR.statusStopped;
  return card;
}

function renderHistory() {
  const list = getHistory();
  els.historyEmpty.hidden = list.length > 0;
  els.historyList.hidden = list.length === 0;
  els.clearHistoryBtn.hidden = list.length === 0;
  els.historyList.replaceChildren(...list.map(historyCard));
}

/* ===== Вкладки и подтверждение очистки ===== */

function switchTab(name) {
  els.screens.home.classList.toggle('active', name === 'home');
  els.screens.history.classList.toggle('active', name === 'history');
  els.nav.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.screen === name);
  });
  if (name === 'history') renderHistory();
}

function buildNav() {
  const tabs = [
    { key: 'home', label: STR.tabs.home, icon: 'house' },
    { key: 'history', label: STR.tabs.history, icon: 'history' },
  ];
  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `nav-btn${tab.key === 'home' ? ' active' : ''}`;
    btn.dataset.screen = tab.key;
    btn.innerHTML = `${icon(tab.icon, 24)}<span class="label">${tab.label}</span>`;
    btn.addEventListener('click', () => switchTab(tab.key));
    els.nav.appendChild(btn);
  }
}

function closeConfirm() {
  els.overlay.hidden = true;
}

function initConfirm() {
  els.clearHistoryBtn.addEventListener('click', () => {
    els.confirmTitle.textContent = STR.confirmTitle;
    els.confirmYes.textContent = STR.confirmYes;
    els.confirmNo.textContent = STR.confirmNo;
    els.overlay.hidden = false;
  });
  els.confirmNo.addEventListener('click', closeConfirm);
  els.overlay.addEventListener('click', (e) => {
    if (e.target === els.overlay) closeConfirm();
  });
  els.confirmYes.addEventListener('click', () => {
    clearHistory();
    closeConfirm();
    renderHistory();
  });
}

/* ===== Запуск ===== */

async function init() {
  buildRing();
  buildPickers();
  buildNav();
  initConfirm();

  els.nameInput.placeholder = STR.namePlaceholder;
  els.historyTitle.textContent = STR.tabs.history;
  els.clearHistoryBtn.innerHTML = `${icon('trash-2', 15)}<span>${STR.clearHistory}</span>`;
  els.setupHandle.innerHTML = icon('chevron-down', 16);
  els.historyEmpty.innerHTML = `${icon('history', 40)}<span>${STR.emptyHistory}</span>`;

  els.setupCancel.addEventListener('click', closeSetup);
  els.setupStart.addEventListener('click', () => startTimer(pickersDurationMs()));
  els.setupOverlay.addEventListener('click', (e) => {
    if (e.target === els.setupOverlay) closeSetup();
  });

  restoreIdle();
  applyState(await invoke('get_state'));
  onPendingChange();

  await listen('tick', onTick);
  await listen('finished', onFinished);

  // Свёрнутое/скрытое окно не перерисовывает анимации
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('suspended', document.hidden);
  });
}

init();
