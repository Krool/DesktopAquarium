use crate::state::SharedState;
use std::sync::Arc;
use tauri::{Manager, State};

#[tauri::command]
pub fn get_state(state: State<'_, Arc<SharedState>>) -> Result<serde_json::Value, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "collection": guard.collection,
        "poolEnergy": guard.pool_energy,
        "totalDiscoveries": guard.total_discoveries,
        "pity": guard.pity,
        "position": guard.position,
    }))
}

#[tauri::command]
pub fn toggle_drag_mode(
    app: tauri::AppHandle,
    state: State<'_, Arc<SharedState>>,
) -> Result<(), String> {
    crate::tray::toggle_drag_mode(&app, &state);
    Ok(())
}

#[tauri::command]
pub fn export_save(path: String, state: State<'_, Arc<SharedState>>) -> Result<(), String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    crate::save::atomic_save(&guard)?;

    let save_path = crate::save::save_path();
    std::fs::copy(&save_path, &path)
        .map_err(|e| format!("Failed to export: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn import_save(
    path: String,
    state: State<'_, Arc<SharedState>>,
) -> Result<(), String> {
    let data = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read import file: {}", e))?;

    let save: crate::save::SaveFile = serde_json::from_str(&data)
        .map_err(|e| format!("Invalid save file: {}", e))?;

    let mut guard = state.lock().map_err(|e| e.to_string())?;
    guard.collection = save.collection;
    guard.pool_energy = if save.progression.pool_energy.is_empty() {
        let legacy = save.progression.energy.unwrap_or(0);
        let mut m = std::collections::HashMap::new();
        m.insert("typing".to_string(), legacy);
        m.insert("click".to_string(), 0);
        m.insert("audio".to_string(), 0);
        m
    } else {
        save.progression.pool_energy
    };
    guard.total_discoveries = save.progression.total_discoveries;
    guard.pity = save.progression.pity;
    guard.position = save.display.position;

    crate::save::atomic_save(&guard)?;
    Ok(())
}

#[tauri::command]
pub fn hide_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_collection(app: tauri::AppHandle) -> Result<(), String> {
    crate::tray::open_collection_from_command(&app);
    Ok(())
}
