use crate::state::SharedState;
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

pub fn setup_tray(app: &AppHandle, state: Arc<SharedState>) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let collection_item = MenuItem::with_id(app, "collection", "Collection", true, None::<&str>)?;
    let reset_item = MenuItem::with_id(app, "reset_position", "Reset Position", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_item, &collection_item, &reset_item, &quit_item])?;

    let icon = app.default_window_icon().cloned()
        .ok_or("No default icon")?;

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .tooltip("ASCII Reef")
        .menu(&menu)
        .on_menu_event(move |app, event| {
            match event.id.as_ref() {
                "show" => {
                    show_window(app);
                }
                "collection" => {
                    open_collection_window(app);
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
                _ => {}
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
    // No longer used but kept for command compatibility
    show_window(app);
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
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
