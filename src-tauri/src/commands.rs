//! Tauri `invoke` command handlers exposed to the frontend.
//! All state mutations go through the shared Arc<Mutex<GameState>>.
use crate::state::SharedState;
use std::sync::Arc;
use tauri::{Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;

#[tauri::command]
pub fn get_state(
    app: tauri::AppHandle,
    state: State<'_, Arc<SharedState>>,
) -> Result<serde_json::Value, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
    let window_visible = app
        .get_webview_window("main")
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(true);
    Ok(serde_json::json!({
        "collection": guard.collection,
        "poolEnergy": guard.pool_energy,
        "totalDiscoveries": guard.total_discoveries,
        "pity": guard.pity,
        "position": guard.position,
        "sendScores": guard.send_scores,
        "soundEnabled": guard.sound_enabled,
        "musicVolume": guard.music_volume,
        "sizeIndex": guard.size_index,
        "dayNightCycle": guard.day_night_cycle,
        "messageBottlesEnabled": guard.message_bottles_enabled,
        "messageBottlesPrompted": guard.message_bottles_prompted,
        "closeBehavior": guard.close_behavior,
        "autostartEnabled": autostart_enabled,
        "windowVisible": window_visible,
    }))
}

#[tauri::command]
pub fn set_send_scores(
    app: tauri::AppHandle,
    enabled: bool,
    state: State<'_, Arc<SharedState>>,
) -> Result<(), String> {
    {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        guard.send_scores = enabled;
        crate::save::atomic_save(&guard)?;
    }
    let _ = app.emit("send-scores", serde_json::json!({ "enabled": enabled }));
    Ok(())
}

#[tauri::command]
pub fn set_sound_enabled(
    app: tauri::AppHandle,
    enabled: bool,
    state: State<'_, Arc<SharedState>>,
) -> Result<(), String> {
    {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        guard.sound_enabled = enabled;
        crate::save::atomic_save(&guard)?;
    }
    let _ = app.emit("sound-settings", serde_json::json!({ "enabled": enabled }));
    Ok(())
}

#[tauri::command]
pub fn set_music_volume(
    app: tauri::AppHandle,
    volume: f32,
    state: State<'_, Arc<SharedState>>,
) -> Result<(), String> {
    let clamped = volume.clamp(0.0, 1.0);
    {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        guard.music_volume = clamped;
        crate::save::atomic_save(&guard)?;
    }
    let _ = app.emit("sound-settings", serde_json::json!({ "volume": clamped }));
    Ok(())
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
    std::fs::copy(&save_path, &path).map_err(|e| format!("Failed to export: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn import_save(path: String, state: State<'_, Arc<SharedState>>) -> Result<(), String> {
    let data =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read import file: {}", e))?;

    let save: crate::save::SaveFile =
        serde_json::from_str(&data).map_err(|e| format!("Invalid save file: {}", e))?;

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
    guard.size_index = save.display.size_index;
    guard.send_scores = save.display.send_scores;
    guard.sound_enabled = save.display.sound_enabled;
    guard.music_volume = save.display.music_volume;
    guard.day_night_cycle = save.display.day_night_cycle;
    guard.message_bottles_enabled = save.display.message_bottles_enabled;
    guard.message_bottles_prompted = save.display.message_bottles_prompted;
    guard.close_behavior = save.display.close_behavior;

    crate::save::sanitize(&mut guard);
    crate::save::atomic_save(&guard)?;
    Ok(())
}

#[tauri::command]
pub fn hide_window(app: tauri::AppHandle) -> Result<(), String> {
    crate::tray::set_window_visibility(&app, false);
    Ok(())
}

#[tauri::command]
pub fn open_collection(app: tauri::AppHandle) -> Result<(), String> {
    crate::tray::open_collection_from_command(&app);
    Ok(())
}

#[tauri::command]
pub fn open_settings(app: tauri::AppHandle) -> Result<(), String> {
    crate::tray::open_settings_from_command(&app);
    Ok(())
}

#[tauri::command]
pub fn set_close_behavior(
    app: tauri::AppHandle,
    behavior: String,
    state: State<'_, Arc<SharedState>>,
) -> Result<(), String> {
    let behavior = match behavior.as_str() {
        "ask" | "hide" | "close" => behavior,
        _ => "ask".to_string(),
    };
    {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        guard.close_behavior = behavior.clone();
        crate::save::atomic_save(&guard)?;
    }
    let _ = app.emit(
        "close-behavior",
        serde_json::json!({ "behavior": behavior }),
    );
    Ok(())
}

#[tauri::command]
pub fn set_size_index(
    app: tauri::AppHandle,
    idx: usize,
    state: State<'_, Arc<SharedState>>,
) -> Result<(), String> {
    crate::tray::apply_size_index(&app, &state, idx)
}

#[tauri::command]
pub fn set_day_night_cycle(
    app: tauri::AppHandle,
    cycle: String,
    state: State<'_, Arc<SharedState>>,
) -> Result<(), String> {
    crate::tray::apply_day_night_cycle(&app, &state, cycle)
}

#[tauri::command]
pub fn set_message_bottles_preferences(
    app: tauri::AppHandle,
    enabled: bool,
    prompted: bool,
    state: State<'_, Arc<SharedState>>,
) -> Result<(), String> {
    {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        guard.message_bottles_enabled = enabled;
        if prompted {
            guard.message_bottles_prompted = true;
        }
        crate::save::atomic_save(&guard)?;
    }
    let _ = app.emit(
        "message-bottles-settings",
        serde_json::json!({ "enabled": enabled, "prompted": prompted }),
    );
    Ok(())
}

#[tauri::command]
pub fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let autolaunch = app.autolaunch();
    if enabled {
        autolaunch.enable().map_err(|e| e.to_string())?;
    } else {
        autolaunch.disable().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_main_window_visibility(app: tauri::AppHandle, show: bool) -> Result<(), String> {
    crate::tray::set_window_visibility(&app, show);
    Ok(())
}

#[tauri::command]
pub fn reset_aquarium(
    app: tauri::AppHandle,
    state: State<'_, Arc<SharedState>>,
) -> Result<(), String> {
    crate::tray::reset_aquarium_from_command(&app, &state);
    Ok(())
}

#[tauri::command]
pub fn reset_window_position(app: tauri::AppHandle) -> Result<(), String> {
    crate::tray::reset_window_position_from_command(&app);
    Ok(())
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle, state: State<'_, Arc<SharedState>>) -> Result<(), String> {
    {
        let guard = state.lock().map_err(|e| e.to_string())?;
        crate::save::atomic_save(&guard)?;
    }
    app.exit(0);
    Ok(())
}
