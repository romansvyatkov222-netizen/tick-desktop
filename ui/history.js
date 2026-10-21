// Хранилище истории — localStorage, общий для главного окна и модального.

import { CONFIG } from './config.js';

/** Список завершённых запусков, новые сверху. */
export function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.storageKeys.history)) ?? [];
  } catch {
    return [];
  }
}

/** Добавляет запись в начало и обрезает список по лимиту. */
export function addHistoryEntry(entry) {
  const list = getHistory();
  list.unshift(entry);
  localStorage.setItem(
    CONFIG.storageKeys.history,
    JSON.stringify(list.slice(0, CONFIG.historyLimit)),
  );
}

export function clearHistory() {
  localStorage.removeItem(CONFIG.storageKeys.history);
}
