use crate::state::SharedState;
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

pub fn setup_tray(app: &AppHandle, state: Arc<SharedState>) -> Result<(), Box<dyn std::error::Error>> {
    let drag_mode_item = MenuItem::with_id(app, "drag_mode", "Drag Mode", true, None::<&str>)?;
    let collection_item = MenuItem::with_id(app, "collection", "Collection", true, None::<&str>)?;
    let reset_item = MenuItem::with_id(app, "reset_position", "Reset Position", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&drag_mode_item, &collection_item, &reset_item, &quit_item])?;

    // Use the app icon - load PNG via image crate embedded in tauri
    let icon = app.default_window_icon().cloned()
        .ok_or("No default icon")?;

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .tooltip("ASCII Reef")
        .menu(&menu)
        .on_menu_event(move |app, event| {
            match event.id.as_ref() {
                "drag_mode" => {
                    toggle_drag_mode(app, &state);
                }
                "collection" => {
                    open_collection_window(app);
                }
                "reset_position" => {
                    reset_window_position(app);
                }
                "quit" => {
                    // Save before quit
                    let guard = state.lock().unwrap();
                    let _ = crate::save::atomic_save(&guard);
                    drop(guard);
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { button, .. } = event {
                if button == tauri::tray::MouseButton::Left {
                    // Left-click toggles drag mode
                    let app = tray.app_handle();
                    // We need state access here - emit an event the main handler can catch
                    let _ = app.emit("tray-left-click", ());
                }
            }
        })
        .build(app)?;

    Ok(())
}

pub fn toggle_drag_mode(app: &AppHandle, state: &Arc<SharedState>) {
    let mut guard = state.lock().unwrap();
    guard.drag_mode = !guard.drag_mode;
    let enabled = guard.drag_mode;
    drop(guard);

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_ignore_cursor_events(!enabled);
        let _ = app.emit("drag-mode", enabled);
    }
}

fn open_collection_window(app: &AppHandle) {
    // Check if already open
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
    }
}
