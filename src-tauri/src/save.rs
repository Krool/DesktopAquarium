use crate::state::GameState;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveFile {
    pub version: u32,
    pub meta: SaveMeta,
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
    #[serde(rename = "totalDiscoveries")]
    pub total_discoveries: u32,
    pub pity: crate::state::PityCounters,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveDisplay {
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
}

fn default_size_index() -> usize {
    1
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
            app_version: "0.1.0".to_string(),
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
        },
    };

    let json = serde_json::to_string_pretty(&save)
        .map_err(|e| format!("Failed to serialize: {}", e))?;

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

    Ok(GameState {
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
    })
}
