use crate::state::SharedState;
use std::sync::Arc;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};
use tauri_plugin_autostart::ManagerExt;

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

pub fn setup_tray(app: &AppHandle, state: Arc<SharedState>) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let collection_item = MenuItem::with_id(app, "collection", "Collection", true, None::<&str>)?;

    // Get current size index from state
    let current_size = {
        let guard = state.lock().unwrap();
        guard.size_index
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

    // Autostart toggle
    let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart_item = CheckMenuItem::with_id(app, "autostart", "Start on Boot", true, autostart_enabled, None::<&str>)?;

    let reset_item = MenuItem::with_id(app, "reset_aquarium", "Reset Aquarium", true, None::<&str>)?;
    let reset_pos_item = MenuItem::with_id(app, "reset_position", "Reset Position", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[
        &show_item,
        &collection_item,
        &size_submenu,
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
                "show" => {
                    show_window(app);
                }
                "collection" => {
                    open_collection_window(app);
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
                                let (_, cols, rows, w, h) = SIZE_PRESETS[idx];

                                // Update checkmarks: uncheck all, check selected
                                for (i, item) in size_items.iter().enumerate() {
                                    let _ = item.set_checked(i == idx);
                                }

                                // Save selection
                                {
                                    let mut guard = state.lock().unwrap();
                                    guard.size_index = idx;
                                    let _ = crate::save::atomic_save(&guard);
                                }

                                resize_tank(app, cols, rows, w, h);
                            }
                        }
                    }
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { button, .. } = event {
                if button == tauri::tray::MouseButton::Left {
                    let app = tray.app_handle();
                    show_window(app);
                }
            }
        })
        .build(app)?;

    Ok(())
}

pub fn toggle_drag_mode(app: &AppHandle, _state: &Arc<SharedState>) {
    show_window(app);
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn resize_tank(app: &AppHandle, cols: u32, rows: u32, width: f64, height: f64) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_size(tauri::LogicalSize::new(width, height));
        let _ = app.emit("resize-tank", serde_json::json!({ "cols": cols, "rows": rows }));
    }
}

fn reset_aquarium(app: &AppHandle, state: &Arc<SharedState>) {
    {
        let mut guard = state.lock().unwrap();
        guard.collection.clear();
        guard.energy = 0;
        guard.total_discoveries = 0;
        guard.pity = crate::state::PityCounters::default();
        guard.dominant_source = "typing".to_string();
        for val in guard.source_energy.values_mut() {
            *val = 0;
        }
        let _ = crate::save::atomic_save(&guard);
    }
    let _ = app.emit("reset-aquarium", ());
}

fn open_collection_window(app: &AppHandle) {
    if app.get_webview_window("collection").is_some() {
        return;
    }

    let _window = tauri::WebviewWindowBuilder::new(
        app,
        "collection",
        tauri::WebviewUrl::App("collection.html".into()),
    )
    .title("ASCII Reef - Collection")
    .inner_size(600.0, 500.0)
    .resizable(true)
    .build();
}

fn reset_window_position(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_position(tauri::PhysicalPosition::new(100, 100));
        let _ = window.show();
    }
}
