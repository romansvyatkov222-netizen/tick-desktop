#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Точка входа: таймер на стороне Rust, трей, единый экземпляр,
// скрытие окна в трей и модальное окно поверх всех.

mod config;

use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

/// Единый источник правды о таймере: интерфейс только отображает события.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
struct TimerState {
    running: bool,
    paused: bool,
    /// Метка окончания отсчёта (мс от эпохи); конец считается от неё, а не декрементом
    end_ts: u64,
    /// Остаток, зафиксированный в момент паузы
    remaining_paused: u64,
    duration_ms: u64,
    name: Option<String>,
    /// Живёт с момента истечения времени до нажатия «ОК» в модальном окне
    finished: Option<FinishedInfo>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct FinishedInfo {
    name: Option<String>,
    duration_ms: u64,
    finished_at: u64,
}

#[derive(Serialize, Clone)]
struct TickPayload {
    remaining_ms: u64,
    paused: bool,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/** «ЧЧ:ММ:СС»; округление вверх, чтобы ноль появлялся ровно в конце. */
fn format_hms(ms: u64) -> String {
    let total = ms.div_ceil(1000);
    format!("{:02}:{:02}:{:02}", total / 3600, (total / 60) % 60, total % 60)
}

/* ===== Сохранение состояния ===== */

fn state_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join(config::STATE_FILE_NAME))
}

fn save_state(app: &AppHandle, state: &TimerState) {
    if let (Some(path), Ok(json)) = (state_path(app), serde_json::to_string(state)) {
        let _ = std::fs::write(path, json);
    }
}

/* ===== Окна и трей ===== */

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(config::MAIN_WINDOW) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn show_modal(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(config::MODAL_WINDOW) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn update_tooltip(app: &AppHandle, text: &str) {
    if let Some(tray) = app.tray_by_id(config::TRAY_ID) {
        let _ = tray.set_tooltip(Some(text.to_owned()));
    }
}

/* ===== Жизненный цикл таймера ===== */

/// Таймер истёк: фиксируем факт, показываем модальное окно поверх всех окон.
fn finish_timer(app: &AppHandle, state: &mut TimerState) {
    state.finished = Some(FinishedInfo {
        name: state.name.clone(),
        duration_ms: state.duration_ms,
        finished_at: now_ms(),
    });
    state.running = false;
    state.paused = false;
    state.end_ts = 0;
    state.remaining_paused = 0;
    save_state(app, state);
    let _ = app.emit("finished", state.finished.clone());
    show_modal(app);
    update_tooltip(app, config::TRAY_FINISHED_TIP);
}

/// Отдельный поток вместо setInterval: WebView троттлит таймеры в свёрнутом окне.
fn spawn_timer_loop(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(config::TICK_INTERVAL_MS));
        let state: State<Mutex<TimerState>> = app.state();
        let mut s = state.lock().unwrap();
        if !s.running || s.paused {
            continue;
        }
        let now = now_ms();
        if s.end_ts <= now {
            finish_timer(&app, &mut s);
            continue;
        }
        let remaining = s.end_ts - now;
        // Скрытому окну тики не нужны — оно не рисует
        let main_visible = app
            .get_webview_window(config::MAIN_WINDOW)
            .map(|w| w.is_visible().unwrap_or(false))
            .unwrap_or(false);
        if main_visible {
            let _ = app.emit("tick", TickPayload { remaining_ms: remaining, paused: false });
        }
        drop(s);
        update_tooltip(&app, &format!("{} {}", config::TRAY_REMAINING_TIP, format_hms(remaining)));
    });
}

/* ===== Команды для интерфейса ===== */

#[tauri::command]
fn get_state(state: State<'_, Mutex<TimerState>>) -> TimerState {
    state.lock().unwrap().clone()
}

#[tauri::command]
fn get_finished(state: State<'_, Mutex<TimerState>>) -> Option<FinishedInfo> {
    state.lock().unwrap().finished.clone()
}

#[tauri::command]
fn start_timer(
    app: AppHandle,
    state: State<'_, Mutex<TimerState>>,
    name: Option<String>,
    duration_ms: u64,
) {
    if duration_ms < config::MIN_DURATION_MS {
        return;
    }
    let mut s = state.lock().unwrap();
    s.running = true;
    s.paused = false;
    s.end_ts = now_ms() + duration_ms;
    s.remaining_paused = 0;
    s.duration_ms = duration_ms;
    s.name = name.map(|n| n.trim().to_owned()).filter(|n| !n.is_empty());
    s.finished = None;
    save_state(&app, &s);
    update_tooltip(&app, &format!("{} {}", config::TRAY_REMAINING_TIP, format_hms(duration_ms)));
}

#[tauri::command]
fn pause_timer(app: AppHandle, state: State<'_, Mutex<TimerState>>) {
    let mut s = state.lock().unwrap();
    if s.running && !s.paused {
        s.remaining_paused = s.end_ts.saturating_sub(now_ms());
        s.paused = true;
        save_state(&app, &s);
        update_tooltip(
            &app,
            &format!("{} {}", config::TRAY_PAUSED_TIP, format_hms(s.remaining_paused)),
        );
    }
}

#[tauri::command]
fn resume_timer(app: AppHandle, state: State<'_, Mutex<TimerState>>) {
    let mut s = state.lock().unwrap();
    if s.running && s.paused {
        // Считаем от метки окончания: пауза не накапливает дрейф
        s.end_ts = now_ms() + s.remaining_paused;
        s.paused = false;
        save_state(&app, &s);
    }
}

#[tauri::command]
fn stop_timer(app: AppHandle, state: State<'_, Mutex<TimerState>>) {
    let mut s = state.lock().unwrap();
    s.running = false;
    s.paused = false;
    s.end_ts = 0;
    s.remaining_paused = 0;
    s.name = None;
    save_state(&app, &s);
    update_tooltip(&app, config::TRAY_DEFAULT_TIP);
}

/// Нажали «ОК»: сброс завершённого состояния; запись в историю делает интерфейс.
#[tauri::command]
fn dismiss_finished(app: AppHandle, state: State<'_, Mutex<TimerState>>) {
    let mut s = state.lock().unwrap();
    s.finished = None;
    save_state(&app, &s);
    update_tooltip(&app, config::TRAY_DEFAULT_TIP);
}

#[tauri::command]
fn hide_modal(app: AppHandle) {
    if let Some(window) = app.get_webview_window(config::MODAL_WINDOW) {
        let _ = window.hide();
    }
}

/* ===== Сборка приложения ===== */

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", config::TRAY_MENU_OPEN, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", config::TRAY_MENU_QUIT, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    let icon = app
        .default_window_icon()
        .expect("иконка приложения должна быть в bundle.icon")
        .clone();

    TrayIconBuilder::with_id(config::TRAY_ID)
        .icon(icon)
        .tooltip(config::TRAY_DEFAULT_TIP)
        .menu(&menu)
        // Левый клик показывает окно, меню — только по правому
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn main() {
    let context = tauri::generate_context!();
    // Состояние должно быть зарегистрировано ДО создания окон: в release-сборке
    // вебвью успевает вызвать get_state раньше setup(), и без этого команда
    // падает с "state not managed" — фронтенд остаётся без тиков.
    let initial_state = std::env::var_os("APPDATA")
        .map(|p| std::path::PathBuf::from(p).join(context.config().identifier.clone()))
        .and_then(|d| std::fs::read_to_string(d.join(config::STATE_FILE_NAME)).ok())
        .and_then(|s| serde_json::from_str::<TimerState>(&s).ok())
        .unwrap_or_default();

    tauri::Builder::default()
        .manage(Mutex::new(initial_state))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Повторный запуск не создаёт второй процесс, а показывает окно
            show_main(app);
        }))
        .setup(|app| {
            let handle = app.handle().clone();
            let managed = app.state::<Mutex<TimerState>>();
            let mut state = managed.lock().unwrap();

            // Таймер истёк, пока приложение было закрыто — сразу показываем окно
            if state.running && !state.paused && state.end_ts <= now_ms() {
                finish_timer(&handle, &mut state);
            } else if state.running && !state.paused {
                update_tooltip(
                    &handle,
                    &format!("{} {}", config::TRAY_REMAINING_TIP, format_hms(state.end_ts - now_ms())),
                );
            }
            drop(state);

            build_tray(app)?;
            spawn_timer_loop(handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Крестик не завершает приложение: окно прячется, таймер продолжает идти
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            get_finished,
            start_timer,
            pause_timer,
            resume_timer,
            stop_timer,
            dismiss_finished,
            hide_modal
        ])
        .run(context)
        .expect("ошибка запуска приложения");
}
