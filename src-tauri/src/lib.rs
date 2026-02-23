//! ASCII Reef — Tauri app entry point.
//! Initialises shared state, spawns the input/audio/energy threads,
//! sets up the system tray, and wires Tauri window events.
mod audio;
mod commands;
mod energy;
mod input;
mod rarity;
mod save;
mod state;
mod tray;

use input::InputCounters;
use state::{GameState, SharedState};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tauri::{Listener, Manager};

/// Load creature definitions from the bundled JSON
fn load_creature_defs() -> Vec<energy::CreatureDef> {
    let json = include_str!("../../src/data/creatures.json");
    serde_json::from_str(json).expect("Failed to parse creatures.json")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load saved state or create fresh (log any load error)
    let game_state = match save::load() {
        Ok(state) => state,
        Err(err) => {
            eprintln!(
                "Failed to load save file, falling back to defaults: {}",
                err
            );
            GameState::default()
        }
    };
    let shared_state = Arc::new(Mutex::new(game_state) as SharedState);

    // Input counters (atomic, shared with rdev listener thread)
    let input_counters = Arc::new(InputCounters::new());

    // Audio detection flag
    let audio_active = Arc::new(AtomicBool::new(false));

    // Load creature definitions
    let creatures = load_creature_defs();

    let state_for_builder = shared_state.clone();
    let counters_for_setup = input_counters.clone();
    let audio_for_setup = audio_active.clone();
    let creatures_for_setup = creatures.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(shared_state.clone())
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::toggle_drag_mode,
            commands::export_save,
            commands::import_save,
            commands::hide_window,
            commands::open_collection,
            commands::open_settings,
            commands::set_close_behavior,
            commands::set_send_scores,
            commands::set_sound_enabled,
            commands::set_music_volume,
            commands::set_size_index,
            commands::set_day_night_cycle,
            commands::set_message_bottles_preferences,
            commands::set_autostart,
            commands::set_main_window_visibility,
            commands::reset_aquarium,
            commands::reset_window_position,
            commands::quit_app,
            commands::set_hidden_creatures,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();

            // Remove WS_MAXIMIZEBOX to prevent Windows 11 snap layout button
            #[cfg(target_os = "windows")]
            if let Some(window) = app.get_webview_window("main") {
                use raw_window_handle::HasWindowHandle;
                if let Ok(handle) = window.window_handle() {
                    if let raw_window_handle::RawWindowHandle::Win32(win32) = handle.as_ref() {
                        use windows::Win32::UI::WindowsAndMessaging::*;
                        let hwnd = windows::Win32::Foundation::HWND(win32.hwnd.get() as *mut _);
                        unsafe {
                            let style = GetWindowLongW(hwnd, GWL_STYLE);
                            SetWindowLongW(hwnd, GWL_STYLE, style & !(WS_MAXIMIZEBOX.0 as i32));
                        }
                    }
                }
            }

            // Enable autostart by default on first run
            {
                use tauri_plugin_autostart::ManagerExt;
                let autolaunch = app.autolaunch();
                if !autolaunch.is_enabled().unwrap_or(false) {
                    let _ = autolaunch.enable();
                }
            }

            // Apply saved size and position
            {
                let guard = state_for_builder.lock().unwrap_or_else(|p| p.into_inner());
                let idx = guard.size_index;
                let saved_pos = guard.position;
                if idx < tray::SIZE_PRESETS.len() {
                    let (_, cols, rows, w, h) = tray::SIZE_PRESETS[idx];
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.set_size(tauri::LogicalSize::new(w, h));
                        // Restore saved position (skip if default 0,0 — first run)
                        if saved_pos.0 != 0.0 || saved_pos.1 != 0.0 {
                            let _ = window.set_position(tauri::PhysicalPosition::new(
                                saved_pos.0 as i32,
                                saved_pos.1 as i32,
                            ));
                        }
                    }
                    // Emit resize event after a short delay so frontend is ready
                    let handle_for_resize = handle.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        use tauri::Emitter;
                        let _ = handle_for_resize.emit(
                            "resize-tank",
                            serde_json::json!({ "cols": cols, "rows": rows }),
                        );
                    });
                }
            }

            // Setup system tray
            if let Err(e) = tray::setup_tray(&handle, state_for_builder.clone()) {
                eprintln!("Failed to setup tray: {}", e);
            }

            // Handle tray left-click events
            let state_for_tray = state_for_builder.clone();
            let handle_for_tray = handle.clone();
            app.listen("tray-left-click", move |_| {
                tray::toggle_drag_mode(&handle_for_tray, &state_for_tray);
            });

            // Start input listener
            input::start_input_listener(counters_for_setup.clone());

            // Start audio detection
            audio::start_audio_detection(audio_for_setup.clone());

            // Start energy loop
            energy::start_energy_loop(
                handle.clone(),
                state_for_builder.clone(),
                counters_for_setup,
                audio_for_setup,
                creatures_for_setup,
            );

            // Track position changes and save on close
            let state_for_close = state_for_builder.clone();
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| match event {
                    tauri::WindowEvent::Moved(pos) => {
                        if let Ok(mut guard) = state_for_close.lock() {
                            guard.position = (pos.x as f64, pos.y as f64);
                        }
                    }
                    tauri::WindowEvent::Destroyed => {
                        if let Ok(guard) = state_for_close.lock() {
                            let _ = save::atomic_save(&guard);
                        }
                    }
                    _ => {}
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
