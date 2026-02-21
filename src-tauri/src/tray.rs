//! System tray setup, size/day-night submenus, window visibility toggle,
//! and helpers to open the collection and settings windows.
use crate::state::SharedState;
use std::sync::Arc;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};
use tauri_plugin_autostart::ManagerExt;
use once_cell::sync::OnceCell;

static WINDOW_TOGGLE_ITEM: OnceCell<MenuItem<tauri::Wry>> = OnceCell::new();
static DAY_NIGHT_CYCLE_ITEMS: OnceCell<Vec<CheckMenuItem<tauri::Wry>>> = OnceCell::new();

// Size presets: (label, cols, rows, pixel_width, pixel_height)
// charWidth ≈ 9, charHeight = 16
pub const SIZE_PRESETS: &[(&str, u32, u32, f64, f64)] = &[
    ("Small",        40, 16, 360.0, 256.0),
    ("Medium",       60, 16, 540.0, 256.0),
    ("Medium Tall",  60, 24, 540.0, 384.0),
    ("Large",        80, 16, 720.0, 256.0),
    ("Large Tall",   80, 24, 720.0, 384.0),
    ("Wide",        100, 16, 900.0, 256.0),
    ("Wide Tall",   100, 24, 900.0, 384.0),
    ("Extra Wide",  120, 24, 1080.0, 384.0),
];

pub const DAY_NIGHT_CYCLES: &[(&str, &str)] = &[
    ("computer", "Computer Time (Default)"),
    ("5min", "5 min day / 5 min night"),
    ("10min", "10 min day / 10 min night"),
    ("60min", "60 min day / 60 min night"),
    ("3hours", "3 hours day / 3 hours night"),
];

pub fn setup_tray(app: &AppHandle, state: Arc<SharedState>) -> Result<(), Box<dyn std::error::Error>> {
    let window_visible = is_window_visible(app);
    let window_toggle_label = if window_visible { "Hide Window" } else { "Show Window" };
    let window_toggle_item = MenuItem::with_id(app, "toggle_window", window_toggle_label, true, None::<&str>)?;
    let _ = WINDOW_TOGGLE_ITEM.set(window_toggle_item.clone());
    let collection_item = MenuItem::with_id(app, "collection", "Collection", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;

    // Get current size index from state
    let (current_size, send_scores_enabled, sound_enabled, current_cycle, message_bottles_enabled) = {
        let guard = state.lock().unwrap();
        (
            guard.size_index,
            guard.send_scores,
            guard.sound_enabled,
            guard.day_night_cycle.clone(),
            guard.message_bottles_enabled,
        )
    };

    // Size submenu with check marks
    let mut size_items: Vec<CheckMenuItem<tauri::Wry>> = Vec::new();
    for (i, (label, _, _, _, _)) in SIZE_PRESETS.iter().enumerate() {
        let id = format!("size_{}", i);
        let checked = i == current_size;
        let item = CheckMenuItem::with_id(app, &id, *label, true, checked, None::<&str>)?;
        size_items.push(item);
    }
    let size_refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = size_items.iter().map(|i| i as &dyn tauri::menu::IsMenuItem<tauri::Wry>).collect();
    let size_submenu = Submenu::with_items(app, "Size", true, &size_refs)?;

    let mut cycle_items: Vec<CheckMenuItem<tauri::Wry>> = Vec::new();
    for (mode, label) in DAY_NIGHT_CYCLES.iter() {
        let id = format!("cycle_{}", mode);
        let checked = *mode == current_cycle;
        let item = CheckMenuItem::with_id(app, &id, *label, true, checked, None::<&str>)?;
        cycle_items.push(item);
    }
    let _ = DAY_NIGHT_CYCLE_ITEMS.set(cycle_items.clone());
    let cycle_refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = cycle_items.iter().map(|i| i as &dyn tauri::menu::IsMenuItem<tauri::Wry>).collect();
    let cycle_submenu = Submenu::with_items(app, "Day/Night Cycle", true, &cycle_refs)?;

    // Autostart toggle
    let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart_item = CheckMenuItem::with_id(app, "autostart", "Start on Boot", true, autostart_enabled, None::<&str>)?;

    // Send Scores toggle
    let send_scores_item = CheckMenuItem::with_id(app, "send_scores", "Send Scores", true, send_scores_enabled, None::<&str>)?;
    // Sound toggle
    let sound_item = CheckMenuItem::with_id(app, "sound_enabled", "Sound", true, sound_enabled, None::<&str>)?;
    let message_bottles_item = CheckMenuItem::with_id(
        app,
        "message_bottles_enabled",
        "Messages in a Bottle",
        true,
        message_bottles_enabled,
        None::<&str>,
    )?;

    let reset_item = MenuItem::with_id(app, "reset_aquarium", "Reset Aquarium", true, None::<&str>)?;
    let reset_pos_item = MenuItem::with_id(app, "reset_position", "Reset Position", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[
        &window_toggle_item,
        &collection_item,
        &settings_item,
        &size_submenu,
        &cycle_submenu,
        &send_scores_item,
        &sound_item,
        &message_bottles_item,
        &autostart_item,
        &reset_item,
        &reset_pos_item,
        &quit_item,
    ])?;

    let icon = app.default_window_icon().cloned()
        .ok_or("No default icon")?;

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .tooltip("ASCII Reef")
        .menu(&menu)
        .on_menu_event(move |app, event| {
            let id = event.id.as_ref();
            match id {
                "toggle_window" => {
                    toggle_window_visibility(app);
                }
                "collection" => {
                    let app = app.clone();
                    std::thread::spawn(move || open_collection_window(&app));
                }
                "settings" => {
                    let app = app.clone();
                    std::thread::spawn(move || open_settings_window(&app));
                }
                "send_scores" => {
                    let enabled = {
                        let mut guard = state.lock().unwrap();
                        guard.send_scores = !guard.send_scores;
                        let _ = crate::save::atomic_save(&guard);
                        guard.send_scores
                    };
                    let _ = send_scores_item.set_checked(enabled);
                    let _ = app.emit("send-scores", serde_json::json!({ "enabled": enabled }));
                }
                "sound_enabled" => {
                    let enabled = {
                        let mut guard = state.lock().unwrap();
                        guard.sound_enabled = !guard.sound_enabled;
                        let _ = crate::save::atomic_save(&guard);
                        guard.sound_enabled
                    };
                    let _ = sound_item.set_checked(enabled);
                    let _ = app.emit("sound-settings", serde_json::json!({ "enabled": enabled }));
                }
                "message_bottles_enabled" => {
                    let enabled = {
                        let mut guard = state.lock().unwrap();
                        guard.message_bottles_enabled = !guard.message_bottles_enabled;
                        guard.message_bottles_prompted = true;
                        let _ = crate::save::atomic_save(&guard);
                        guard.message_bottles_enabled
                    };
                    let _ = message_bottles_item.set_checked(enabled);
                    let _ = app.emit(
                        "message-bottles-settings",
                        serde_json::json!({ "enabled": enabled, "prompted": true }),
                    );
                }
                "autostart" => {
                    let autolaunch = app.autolaunch();
                    let enabled = autolaunch.is_enabled().unwrap_or(false);
                    if enabled {
                        let _ = autolaunch.disable();
                    } else {
                        let _ = autolaunch.enable();
                    }
                }
                "reset_aquarium" => {
                    reset_aquarium(app, &state);
                }
                "reset_position" => {
                    reset_window_position(app);
                }
                "quit" => {
                    let guard = state.lock().unwrap();
                    let _ = crate::save::atomic_save(&guard);
                    drop(guard);
                    app.exit(0);
                }
                _ => {
                    // Check for size_ prefix
                    if let Some(idx_str) = id.strip_prefix("size_") {
                        if let Ok(idx) = idx_str.parse::<usize>() {
                            if idx < SIZE_PRESETS.len() {
                                // Update checkmarks: uncheck all, check selected
                                for (i, item) in size_items.iter().enumerate() {
                                    let _ = item.set_checked(i == idx);
                                }

                                let _ = apply_size_index(app, &state, idx);
                            }
                        }
                        return;
                    }

                    if let Some(mode) = id.strip_prefix("cycle_") {
                        if DAY_NIGHT_CYCLES.iter().any(|(m, _)| *m == mode) {
                            for (i, (item_mode, _)) in DAY_NIGHT_CYCLES.iter().enumerate() {
                                let _ = cycle_items[i].set_checked(*item_mode == mode);
                            }
                            let _ = apply_day_night_cycle(app, &state, mode.to_string());
                        }
                    }
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { button, .. } = event {
                if button == tauri::tray::MouseButton::Left {
                    let app = tray.app_handle();
                    set_window_visibility(app, true);
                }
            }
        })
        .build(app)?;

    Ok(())
}

pub fn toggle_drag_mode(app: &AppHandle, _state: &Arc<SharedState>) {
    set_window_visibility(app, true);
}

fn is_window_visible(app: &AppHandle) -> bool {
    if let Some(window) = app.get_webview_window("main") {
        return window.is_visible().unwrap_or(true);
    }
    true
}

fn update_window_toggle_label(is_visible: bool) {
    if let Some(item) = WINDOW_TOGGLE_ITEM.get() {
        let _ = item.set_text(if is_visible { "Hide Window" } else { "Show Window" });
    }
}

pub fn set_window_visibility(app: &AppHandle, show: bool) {
    if let Some(window) = app.get_webview_window("main") {
        if show {
            let _ = window.show();
            let _ = window.set_focus();
        } else {
            let _ = window.hide();
        }
    }
    update_window_toggle_label(show);
}

fn toggle_window_visibility(app: &AppHandle) {
    let visible = is_window_visible(app);
    set_window_visibility(app, !visible);
}

fn resize_tank(app: &AppHandle, cols: u32, rows: u32, width: f64, height: f64) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_size(tauri::LogicalSize::new(width, height));
        let _ = app.emit("resize-tank", serde_json::json!({ "cols": cols, "rows": rows }));
    }
}

pub fn apply_size_index(app: &AppHandle, state: &Arc<SharedState>, idx: usize) -> Result<(), String> {
    if idx >= SIZE_PRESETS.len() {
        return Err("Invalid size preset".to_string());
    }
    let (_, cols, rows, w, h) = SIZE_PRESETS[idx];
    {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        guard.size_index = idx;
        crate::save::atomic_save(&guard)?;
    }
    resize_tank(app, cols, rows, w, h);
    let _ = app.emit("size-index", serde_json::json!({ "index": idx }));
    Ok(())
}

fn reset_aquarium(app: &AppHandle, state: &Arc<SharedState>) {
    {
        let mut guard = state.lock().unwrap();
        guard.collection.clear();
        for val in guard.pool_energy.values_mut() {
            *val = 0;
        }
        guard.total_discoveries = 0;
        guard.pity = crate::state::PityCounters::default();
        let _ = crate::save::atomic_save(&guard);
    }
    let _ = app.emit("reset-aquarium", ());
}

pub fn open_collection_from_command(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || open_collection_window(&app));
}

pub fn apply_day_night_cycle(app: &AppHandle, state: &Arc<SharedState>, cycle: String) -> Result<(), String> {
    let cycle = match cycle.as_str() {
        "computer" | "5min" | "10min" | "60min" | "3hours" => cycle,
        _ => "computer".to_string(),
    };
    {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        guard.day_night_cycle = cycle.clone();
        crate::save::atomic_save(&guard)?;
    }
    update_day_night_cycle_checks(&cycle);
    let _ = app.emit("day-night-cycle", serde_json::json!({ "cycle": cycle }));
    Ok(())
}

fn update_day_night_cycle_checks(selected_mode: &str) {
    if let Some(items) = DAY_NIGHT_CYCLE_ITEMS.get() {
        for (i, (mode, _)) in DAY_NIGHT_CYCLES.iter().enumerate() {
            let _ = items[i].set_checked(*mode == selected_mode);
        }
    }
}

pub fn reset_aquarium_from_command(app: &AppHandle, state: &Arc<SharedState>) {
    reset_aquarium(app, state);
}

pub fn open_settings_from_command(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || open_settings_window(&app));
}

fn open_collection_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("collection") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    if let Ok(window) = tauri::WebviewWindowBuilder::new(
        app,
        "collection",
        tauri::WebviewUrl::App("collection.html".into()),
    )
    .title("ASCII Reef - Collection")
    .inner_size(600.0, 500.0)
    .decorations(true)
    .resizable(true)
    .devtools(cfg!(debug_assertions))
    .build()
    {
        let _ = window.set_focus();
    }
}

fn open_settings_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let _window = tauri::WebviewWindowBuilder::new(
        app,
        "settings",
        tauri::WebviewUrl::App("settings.html".into()),
    )
    .title("ASCII Reef - Settings")
    .inner_size(520.0, 840.0)
    .resizable(true)
    .decorations(true)
    .build();
}

fn reset_window_position(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_position(tauri::PhysicalPosition::new(100, 100));
        let _ = window.show();
    }
}

pub fn reset_window_position_from_command(app: &AppHandle) {
    reset_window_position(app);
}
