// Общее форматирование времени для главного и модального окна.

const pad2 = (n) => String(n).padStart(2, '0');

/** «ЧЧ:ММ:СС». Остаток округляется вверх, чтобы ноль появлялся ровно в конце. */
export function formatHMS(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${pad2(Math.floor(total / 3600))}:${pad2(Math.floor(total / 60) % 60)}:${pad2(total % 60)}`;
}

/** Дата и время завершения: «21.10.2026, 14:05». */
export function formatDateTime(ms) {
  const d = new Date(ms);
  const date = d.toLocaleDateString('ru-RU');
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}
