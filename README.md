# Tick — таймер для Windows

Обратный таймер с названием в стиле liquid glass (Tauri 2, без фреймворков).

## Структура

```
ui/                  — интерфейс (чистые HTML/CSS/JS ES-модули)
  index.html         — главное окно: колёсика, кольцо, шторка, вкладки
  modal.html         — модальное окно «Таймер завершён»
  app.js / modal.js  — логика окон
  tokens.css         — все цвета, радиусы, длительности (CSS-переменные)
  glass.css          — один класс .glass для всех стеклянных поверхностей
  styles.css         — компоненты и layout (значения — только из токенов)
  config.js          — константы поведения (звук, лимиты, диапазоны, ключи)
  strings.js         — все тексты интерфейса
  format.js          — «ЧЧ:ММ:СС» и дата/время
  history.js         — история (localStorage, до 200 записей)
  sound.js           — сигнал через Web Audio API, без файлов
  icons.js           — инлайн-SVG (Lucide), только нужные иконки
  icons/*.svg        — те же иконки отдельными файлами

src-tauri/
  src/
    main.rs            — таймер на стороне Rust, события tick/finished, трей,
                         скрытие в трей по крестику, модальное окно поверх всех
    config.rs          — константы Rust (файл состояния, интервал тика, тексты трея)
  tauri.conf.json    — размеры и темы окон, withGlobalTauri, bundle.active: false
  capabilities/      — права (core:default)
  icons/icon.ico     — иконка приложения и трея
```

Состояние таймера: единый источник правды — Rust (JSON в app data dir).
История: localStorage (общий для обоих окон).

## Запуск в dev-режиме

```
cargo tauri dev
```

## Сборка одного portable .exe без установщиков

```
cargo tauri build --no-bundle
```

Готовый файл: `src-tauri/target/release/tick.exe` (установщики отключены —
`bundle.active: false`, поэтому `.msi`/`.nsis` не создаются).

### Оптимизация размера

Уже настроено в `Cargo.toml` (`[profile.release]`): `opt-level="z"`,
`lto=true`, `strip=true`, `panic="abort"`, `codegen-units=1`.
Фронтенд без зависимостей — API Tauri подключаются через `withGlobalTauri`,
иконки Lucide инлайнятся выборочно, звук генерируется Web Audio API.
