use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OwnedCreature {
    pub count: u32,
    #[serde(rename = "firstSeen")]
    pub first_seen: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PityCounters {
    pub legendary: u32,
    pub epic: u32,
    pub rare: u32,
    pub uncommon: u32,
}

impl Default for PityCounters {
    fn default() -> Self {
        Self {
            legendary: 0,
            epic: 0,
            rare: 0,
            uncommon: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameState {
    pub collection: HashMap<String, OwnedCreature>,
    pub energy: u32,
    pub total_discoveries: u32,
    pub pity: PityCounters,
    pub position: (f64, f64),
    pub drag_mode: bool,
    /// Which input source has contributed the most energy since last discovery
    pub dominant_source: String,
    /// Per-source energy since last discovery
    pub source_energy: HashMap<String, u32>,
    /// Last time idle fallback was checked
    pub last_input_time: f64,
    /// Selected size preset index
    #[serde(default = "default_size_index")]
    pub size_index: usize,
}

fn default_size_index() -> usize {
    2 // "Medium Tall" (60x24) = current default
}

impl Default for GameState {
    fn default() -> Self {
        let mut source_energy = HashMap::new();
        source_energy.insert("typing".to_string(), 0);
        source_energy.insert("click".to_string(), 0);
        source_energy.insert("audio".to_string(), 0);

        Self {
            collection: HashMap::new(),
            energy: 0,
            total_discoveries: 0,
            pity: PityCounters::default(),
            position: (0.0, 0.0),
            drag_mode: false,
            dominant_source: "typing".to_string(),
            source_energy,
            last_input_time: 0.0,
            size_index: default_size_index(),
        }
    }
}

pub type SharedState = Mutex<GameState>;
