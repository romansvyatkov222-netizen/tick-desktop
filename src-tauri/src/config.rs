// Настройки поведения в Rust (ТЗ, п. 10). Размеры окон — только в tauri.conf.json.

/// Файл состояния таймера в app data dir
pub const STATE_FILE_NAME: &str = "state.json";

/// Период тиков таймера: быстрее не нужно, точность держится на метке окончания
pub const TICK_INTERVAL_MS: u64 = 500;

/// Минимальная длительность: нулевой таймер запустить нельзя
pub const MIN_DURATION_MS: u64 = 1_000;

/// Метки окон в tauri.conf.json
pub const MAIN_WINDOW: &str = "main";
pub const MODAL_WINDOW: &str = "modal";

/// Идентификатор иконки трея
pub const TRAY_ID: &str = "tick-tray";

pub const TRAY_DEFAULT_TIP: &str = "Таймер";
pub const TRAY_REMAINING_TIP: &str = "Осталось";
pub const TRAY_PAUSED_TIP: &str = "Пауза";
pub const TRAY_FINISHED_TIP: &str = "Таймер завершён";
pub const TRAY_MENU_OPEN: &str = "Открыть";
pub const TRAY_MENU_QUIT: &str = "Выход";
