// Константы поведения интерфейса (ТЗ, п. 10). Значения — только здесь.

export const CONFIG = Object.freeze({
  // Повтор сигнала о завершении и его автоотключение
  soundRepeatMs: 6000,
  soundAutoStopMs: 60000,

  // Сигнал: файл колокольчика из пакета Kenney Interface Sounds (CC0)
  sound: Object.freeze({
    file: 'sound/confirmation_001.wav',
    volume: 0.8,
  }),

  // Лимит истории (дублирует CONST в src-tauri, там обрезка не нужна — записи пишет JS)
  historyLimit: 200,

  // Диапазоны колёсиков «часы / минуты / секунды»
  pickers: Object.freeze({
    hours: Object.freeze({ min: 0, max: 23 }),
    minutes: Object.freeze({ min: 0, max: 59 }),
    seconds: Object.freeze({ min: 0, max: 59 }),
  }),

  // Ключи хранилища (история и последние значения — в localStorage)
  storageKeys: Object.freeze({
    history: 'tick.history',
    lastDurationMs: 'tick.lastDurationMs',
    lastName: 'tick.lastName',
  }),

  // Размеры центрального кольца (SVG)
  ring: Object.freeze({
    size: 260,
    stroke: 3,
  }),

  // Длительность таймера по умолчанию, если ничего не сохранено
  defaultDurationMs: 25 * 60 * 1000,
});
