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
}

fn default_size_index() -> usize {
    2
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

    let save = SaveFile {
        version: 2,
        meta: SaveMeta {
            created: now.clone(),
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
        drag_mode: false,
        last_input_time: 0.0,
    })
}
