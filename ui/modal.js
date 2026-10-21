// Логика модального окна «Таймер завершён». Показывается поверх всех окон,
// играет сигнал до нажатия на подтверждение (или до автоотключения звука).

import { STR } from './strings.js';
import { formatHMS } from './format.js';
import { icon } from './icons.js';
import { startAlarm, stopAlarm } from './sound.js';
import { addHistoryEntry } from './history.js';

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const els = {
  icon: document.getElementById('modal-icon'),
  title: document.getElementById('modal-title'),
  name: document.getElementById('modal-name'),
  duration: document.getElementById('modal-duration'),
  ok: document.getElementById('modal-ok'),
};

let pending = null;
// Защита от двойной обработки: данные приходят и опросом get_finished, и событием
let lastFinishedAt = 0;

/** Показ информации о завершённом таймере и запуск сигнала. */
function show(info) {
  if (!info || info.finished_at === lastFinishedAt) return;
  lastFinishedAt = info.finished_at;
  pending = info;
  els.name.textContent = info.name || STR.noName;
  els.name.classList.toggle('muted', !info.name);
  els.duration.textContent = formatHMS(info.duration_ms);
  startAlarm();
}

/** Подтверждение: запись в историю «Завершён» и возврат главного экрана в ожидание. */
async function finalize() {
  stopAlarm();
  if (pending) {
    addHistoryEntry({
      name: pending.name || '',
      durationMs: pending.duration_ms,
      endedAt: pending.finished_at,
      status: 'finished',
    });
    pending = null;
    await invoke('dismiss_finished');
  }
  await invoke('hide_modal');
}

async function init() {
  els.icon.innerHTML = icon('bell-ring', 40);
  els.title.textContent = STR.modalTitle;
  els.ok.innerHTML = icon('check', 26);
  els.ok.setAttribute('aria-label', STR.ok);

  els.ok.addEventListener('click', finalize);

  await listen('finished', (e) => show(e.payload));
  // Окно могло быть открыто до того, как событие дошло: спрашиваем Rust напрямую
  show(await invoke('get_finished'));

  // Окно спрятано (крестик/Alt+F4) — звук не нужен
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAlarm();
  });
}

init();
