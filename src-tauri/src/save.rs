use crate::state::GameState;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveFile {
    pub version: u32,
    pub meta: SaveMeta,
    #[serde(default)]
    pub collection: std::collections::HashMap<String, crate::state::OwnedCreature>,
    pub progression: SaveProgression,
    pub display: SaveDisplay,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveMeta {
    pub created: String,
    #[serde(rename = "lastSaved")]
    pub last_saved: String,
    #[serde(rename = "appVersion")]
    pub app_version: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveProgression {
    #[serde(default)]
    pub pool_energy: std::collections::HashMap<String, u32>,
    /// Legacy field for backward compat on load
    #[serde(default, skip_serializing)]
    pub energy: Option<u32>,
    #[serde(default, rename = "totalDiscoveries")]
    pub total_discoveries: u32,
    #[serde(default)]
    pub pity: crate::state::PityCounters,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveDisplay {
    #[serde(default = "default_position")]
    pub position: (f64, f64),
    #[serde(default = "default_size_index")]
    pub size_index: usize,
    #[serde(default = "default_send_scores")]
    pub send_scores: bool,
    #[serde(default = "default_sound_enabled")]
    pub sound_enabled: bool,
    #[serde(default = "default_music_volume")]
    pub music_volume: f32,
    #[serde(default = "default_day_night_cycle")]
    pub day_night_cycle: String,
    #[serde(default = "default_message_bottles_enabled")]
    pub message_bottles_enabled: bool,
    #[serde(default = "default_message_bottles_prompted")]
    pub message_bottles_prompted: bool,
    #[serde(default = "default_close_behavior")]
    pub close_behavior: String,
    #[serde(default)]
    pub hidden_creatures: Vec<String>,
}

fn default_size_index() -> usize {
    1
}

fn default_position() -> (f64, f64) {
    (0.0, 0.0)
}

fn default_send_scores() -> bool {
    true
}

fn default_sound_enabled() -> bool {
    false
}

fn default_music_volume() -> f32 {
    0.08
}

fn default_day_night_cycle() -> String {
    "computer".to_string()
}

fn default_message_bottles_enabled() -> bool {
    false
}

fn default_message_bottles_prompted() -> bool {
    false
}

fn default_close_behavior() -> String {
    "ask".to_string()
}

pub fn save_dir() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("ascii-reef")
}

pub fn save_path() -> PathBuf {
    save_dir().join("save.reef")
}

fn backup_path() -> PathBuf {
    save_dir().join("save.reef.bak")
}

fn tmp_path() -> PathBuf {
    save_dir().join("save.reef.tmp")
}

pub fn atomic_save(state: &GameState) -> Result<(), String> {
    let dir = save_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create save dir: {}", e))?;

    let now = chrono::Utc::now().to_rfc3339();

    // Preserve the original creation timestamp from the existing save file
    let created = fs::read_to_string(save_path())
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v["meta"]["created"].as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| now.clone());

    let save = SaveFile {
        version: 2,
        meta: SaveMeta {
            created,
            last_saved: now,
            app_version: env!("CARGO_PKG_VERSION").to_string(),
        },
        collection: state.collection.clone(),
        progression: SaveProgression {
            pool_energy: state.pool_energy.clone(),
            energy: None,
            total_discoveries: state.total_discoveries,
            pity: state.pity.clone(),
        },
        display: SaveDisplay {
            position: state.position,
            size_index: state.size_index,
            send_scores: state.send_scores,
            sound_enabled: state.sound_enabled,
            music_volume: state.music_volume,
            day_night_cycle: state.day_night_cycle.clone(),
            message_bottles_enabled: state.message_bottles_enabled,
            message_bottles_prompted: state.message_bottles_prompted,
            close_behavior: state.close_behavior.clone(),
            hidden_creatures: state.hidden_creatures.clone(),
        },
    };

    let json =
        serde_json::to_string_pretty(&save).map_err(|e| format!("Failed to serialize: {}", e))?;

    let tmp = tmp_path();
    let main = save_path();
    let bak = backup_path();

    // Write to tmp
    fs::write(&tmp, &json).map_err(|e| format!("Failed to write tmp: {}", e))?;

    // Backup existing save
    if main.exists() {
        let _ = fs::copy(&main, &bak);
    }

    // Rename tmp to main
    fs::rename(&tmp, &main).map_err(|e| format!("Failed to rename: {}", e))?;

    Ok(())
}

/// Clamp and validate all fields of a freshly-loaded or freshly-imported
/// GameState. Logs a warning and resets any field that is out of range or
/// contains an unrecognised value. Called after both `load()` and
/// `import_save` to guard against hand-edited or corrupted save files.
pub fn sanitize(state: &mut GameState) {
    // music_volume must be in [0.0, 1.0]
    if !state.music_volume.is_finite() || !(0.0..=1.0).contains(&state.music_volume) {
        eprintln!(
            "Save: music_volume {:?} out of range, resetting to default",
            state.music_volume
        );
        state.music_volume = 0.08;
    }

    // size_index must map to a known preset
    if state.size_index >= crate::tray::SIZE_PRESETS.len() {
        eprintln!(
            "Save: size_index {} out of range (max {}), resetting to default",
            state.size_index,
            crate::tray::SIZE_PRESETS.len() - 1
        );
        state.size_index = 1;
    }

    // pool_energy: remove unknown pool keys, then ensure all required ones exist
    state
        .pool_energy
        .retain(|k, _| matches!(k.as_str(), "typing" | "click" | "audio"));
    for pool in ["typing", "click", "audio"] {
        state.pool_energy.entry(pool.to_string()).or_insert(0);
    }
    // Cap individual pool values to prevent a corrupted save from instantly
    // triggering a cascade of discoveries on first load
    const MAX_POOL_ENERGY: u32 = 1_000;
    for (pool, val) in state.pool_energy.iter_mut() {
        if *val > MAX_POOL_ENERGY {
            eprintln!(
                "Save: pool_energy[{}] = {} exceeds cap, clamping to {}",
                pool, val, MAX_POOL_ENERGY
            );
            *val = MAX_POOL_ENERGY;
        }
    }

    // day_night_cycle must be one of the known modes
    if !matches!(
        state.day_night_cycle.as_str(),
        "computer" | "5min" | "10min" | "60min" | "3hours"
    ) {
        eprintln!(
            "Save: unknown day_night_cycle {:?}, resetting to default",
            state.day_night_cycle
        );
        state.day_night_cycle = "computer".to_string();
    }

    // close_behavior must be one of the known values
    if !matches!(state.close_behavior.as_str(), "ask" | "hide" | "close") {
        eprintln!(
            "Save: unknown close_behavior {:?}, resetting to default",
            state.close_behavior
        );
        state.close_behavior = "ask".to_string();
    }

    // position must be finite (no NaN/Inf from corrupted saves)
    if !state.position.0.is_finite() || !state.position.1.is_finite() {
        state.position = (0.0, 0.0);
    }
}

pub fn load() -> Result<GameState, String> {
    let main = save_path();
    let bak = backup_path();

    let data = if main.exists() {
        fs::read_to_string(&main).map_err(|e| format!("Failed to read save: {}", e))?
    } else if bak.exists() {
        eprintln!("Main save not found, loading backup");
        fs::read_to_string(&bak).map_err(|e| format!("Failed to read backup: {}", e))?
    } else {
        return Ok(GameState::default());
    };

    let save: SaveFile =
        serde_json::from_str(&data).map_err(|e| format!("Failed to parse save: {}", e))?;

    // Restore pool_energy, with backward compat for old saves
    let pool_energy = if save.progression.pool_energy.is_empty() {
        // Old save format: put legacy energy into typing pool
        let legacy = save.progression.energy.unwrap_or(0);
        let mut m = std::collections::HashMap::new();
        m.insert("typing".to_string(), legacy);
        m.insert("click".to_string(), 0);
        m.insert("audio".to_string(), 0);
        m
    } else {
        save.progression.pool_energy
    };

    let mut state = GameState {
        collection: save.collection,
        pool_energy,
        total_discoveries: save.progression.total_discoveries,
        pity: save.progression.pity,
        position: save.display.position,
        size_index: save.display.size_index,
        send_scores: save.display.send_scores,
        sound_enabled: save.display.sound_enabled,
        music_volume: save.display.music_volume,
        day_night_cycle: save.display.day_night_cycle,
        message_bottles_enabled: save.display.message_bottles_enabled,
        message_bottles_prompted: save.display.message_bottles_prompted,
        close_behavior: save.display.close_behavior,
        hidden_creatures: save.display.hidden_creatures,
    };
    sanitize(&mut state);
    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::GameState;

    fn make_state() -> GameState {
        GameState::default()
    }

    // --- sanitize: valid inputs are unchanged ---

    #[test]
    fn sanitize_valid_state_unchanged() {
        let mut s = make_state();
        s.music_volume = 0.5;
        s.size_index = 2;
        s.day_night_cycle = "10min".to_string();
        s.close_behavior = "hide".to_string();
        s.position = (100.0, 200.0);
        s.pool_energy.insert("typing".to_string(), 20);
        s.pool_energy.insert("click".to_string(), 10);
        s.pool_energy.insert("audio".to_string(), 5);

        sanitize(&mut s);

        assert_eq!(s.music_volume, 0.5);
        assert_eq!(s.size_index, 2);
        assert_eq!(s.day_night_cycle, "10min");
        assert_eq!(s.close_behavior, "hide");
        assert_eq!(s.position, (100.0, 200.0));
        assert_eq!(*s.pool_energy.get("typing").unwrap(), 20);
    }

    #[test]
    fn sanitize_all_valid_day_night_cycles() {
        for cycle in &["computer", "5min", "10min", "60min", "3hours"] {
            let mut s = make_state();
            s.day_night_cycle = cycle.to_string();
            sanitize(&mut s);
            assert_eq!(
                s.day_night_cycle, *cycle,
                "valid cycle '{cycle}' should not be changed"
            );
        }
    }

    #[test]
    fn sanitize_all_valid_close_behaviors() {
        for behavior in &["ask", "hide", "close"] {
            let mut s = make_state();
            s.close_behavior = behavior.to_string();
            sanitize(&mut s);
            assert_eq!(
                s.close_behavior, *behavior,
                "valid behavior '{behavior}' should not be changed"
            );
        }
    }

    // --- sanitize: music_volume ---

    #[test]
    fn sanitize_music_volume_nan_resets() {
        let mut s = make_state();
        s.music_volume = f32::NAN;
        sanitize(&mut s);
        assert_eq!(s.music_volume, 0.08);
    }

    #[test]
    fn sanitize_music_volume_negative_resets() {
        let mut s = make_state();
        s.music_volume = -0.5;
        sanitize(&mut s);
        assert_eq!(s.music_volume, 0.08);
    }

    #[test]
    fn sanitize_music_volume_above_one_resets() {
        let mut s = make_state();
        s.music_volume = 1.5;
        sanitize(&mut s);
        assert_eq!(s.music_volume, 0.08);
    }

    #[test]
    fn sanitize_music_volume_boundary_values_kept() {
        let mut s = make_state();
        s.music_volume = 0.0;
        sanitize(&mut s);
        assert_eq!(s.music_volume, 0.0);

        s.music_volume = 1.0;
        sanitize(&mut s);
        assert_eq!(s.music_volume, 1.0);
    }

    // --- sanitize: size_index ---

    #[test]
    fn sanitize_size_index_out_of_range_resets() {
        let mut s = make_state();
        s.size_index = 9999;
        sanitize(&mut s);
        assert_eq!(s.size_index, 1);
    }

    // --- sanitize: pool_energy ---

    #[test]
    fn sanitize_unknown_pool_keys_removed() {
        let mut s = make_state();
        s.pool_energy.insert("hacking".to_string(), 50);
        sanitize(&mut s);
        assert!(
            !s.pool_energy.contains_key("hacking"),
            "unknown key 'hacking' should be removed"
        );
        assert!(s.pool_energy.contains_key("typing"));
        assert!(s.pool_energy.contains_key("click"));
        assert!(s.pool_energy.contains_key("audio"));
    }

    #[test]
    fn sanitize_missing_pool_keys_inserted_as_zero() {
        let mut s = make_state();
        s.pool_energy.clear();
        sanitize(&mut s);
        assert_eq!(*s.pool_energy.get("typing").unwrap(), 0);
        assert_eq!(*s.pool_energy.get("click").unwrap(), 0);
        assert_eq!(*s.pool_energy.get("audio").unwrap(), 0);
    }

    #[test]
    fn sanitize_pool_energy_excessive_value_capped() {
        let mut s = make_state();
        s.pool_energy.insert("typing".to_string(), u32::MAX);
        sanitize(&mut s);
        assert_eq!(*s.pool_energy.get("typing").unwrap(), 1_000);
    }

    #[test]
    fn sanitize_pool_energy_at_cap_unchanged() {
        let mut s = make_state();
        s.pool_energy.insert("click".to_string(), 1_000);
        sanitize(&mut s);
        assert_eq!(*s.pool_energy.get("click").unwrap(), 1_000);
    }

    // --- sanitize: day_night_cycle ---

    #[test]
    fn sanitize_unknown_day_night_cycle_resets() {
        let mut s = make_state();
        s.day_night_cycle = "24hours".to_string();
        sanitize(&mut s);
        assert_eq!(s.day_night_cycle, "computer");
    }

    // --- sanitize: close_behavior ---

    #[test]
    fn sanitize_unknown_close_behavior_resets() {
        let mut s = make_state();
        s.close_behavior = "explode".to_string();
        sanitize(&mut s);
        assert_eq!(s.close_behavior, "ask");
    }

    // --- sanitize: position ---

    #[test]
    fn sanitize_nan_position_resets() {
        let mut s = make_state();
        s.position = (f64::NAN, 100.0);
        sanitize(&mut s);
        assert_eq!(s.position, (0.0, 0.0));
    }

    #[test]
    fn sanitize_infinite_position_resets() {
        let mut s = make_state();
        s.position = (f64::INFINITY, 0.0);
        sanitize(&mut s);
        assert_eq!(s.position, (0.0, 0.0));
    }

    #[test]
    fn sanitize_negative_position_kept() {
        // Negative screen coordinates are valid (multi-monitor setups)
        let mut s = make_state();
        s.position = (-500.0, -200.0);
        sanitize(&mut s);
        assert_eq!(s.position, (-500.0, -200.0));
    }
}
