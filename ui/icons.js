// Инлайн-SVG (Lucide), только нужные иконки — библиотека целиком не подключается.

const STROKE_WIDTH = 2;

const ICONS = {
  house:
    '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>' +
    '<path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  history:
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>' +
    '<path d="M3 3v5h5"/>' +
    '<path d="M12 7v5l4 2"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  pause:
    '<rect x="14" y="4" width="4" height="16" rx="1"/>' +
    '<rect x="6" y="4" width="4" height="16" rx="1"/>',
  square: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
  'trash-2':
    '<path d="M3 6h18"/>' +
    '<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>' +
    '<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>' +
    '<line x1="10" x2="10" y1="11" y2="17"/>' +
    '<line x1="14" x2="14" y1="11" y2="17"/>',
  'bell-ring':
    '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>' +
    '<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>' +
    '<path d="M4 2C2.8 3.7 2 5.7 2 8"/>' +
    '<path d="M22 8c0-2.3-.8-4.3-2-6"/>',
  x: '<path d="M18 6 6 18"/>' + '<path d="m6 6 12 12"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  timer: '<line x1="10" x2="14" y1="2" y2="2"/>' + '<line x1="12" x2="15" y1="14" y2="11"/>' + '<circle cx="12" cy="14" r="8"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};

/** Возвращает SVG-строку иконки Lucide по имени. */
export function icon(name, size = 24) {
  const body = ICONS[name];
  if (!body) return '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    `stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  );
}
