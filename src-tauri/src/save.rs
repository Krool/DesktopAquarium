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
    pub energy: u32,
    #[serde(rename = "totalDiscoveries")]
    pub total_discoveries: u32,
    pub pity: crate::state::PityCounters,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveDisplay {
    pub position: (f64, f64),
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
            energy: state.energy,
            total_discoveries: state.total_discoveries,
            pity: state.pity.clone(),
        },
        display: SaveDisplay {
            position: state.position,
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

    let mut source_energy = std::collections::HashMap::new();
    source_energy.insert("typing".to_string(), 0);
    source_energy.insert("click".to_string(), 0);
    source_energy.insert("audio".to_string(), 0);

    Ok(GameState {
        collection: save.collection,
        energy: save.progression.energy,
        total_discoveries: save.progression.total_discoveries,
        pity: save.progression.pity,
        position: save.display.position,
        drag_mode: false,
        dominant_source: "typing".to_string(),
        source_energy,
        last_input_time: 0.0,
    })
}
