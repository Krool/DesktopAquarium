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
    pub pool_energy: HashMap<String, u32>,
    pub total_discoveries: u32,
    pub pity: PityCounters,
    pub position: (f64, f64),
    pub drag_mode: bool,
    /// Last time idle fallback was checked
    pub last_input_time: f64,
    /// Selected size preset index
    #[serde(default = "default_size_index")]
    pub size_index: usize,
    /// Whether leaderboard score submission is enabled
    #[serde(default = "default_send_scores")]
    pub send_scores: bool,
    /// Whether ambient music is enabled
    #[serde(default = "default_sound_enabled")]
    pub sound_enabled: bool,
    /// Music volume (0.0 - 1.0)
    #[serde(default = "default_music_volume")]
    pub music_volume: f32,
}

fn default_size_index() -> usize {
    2 // "Medium Tall" (60x24) = current default
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

fn default_pool_energy() -> HashMap<String, u32> {
    let mut m = HashMap::new();
    m.insert("typing".to_string(), 0);
    m.insert("click".to_string(), 0);
    m.insert("audio".to_string(), 0);
    m
}

impl Default for GameState {
    fn default() -> Self {
        Self {
            collection: HashMap::new(),
            pool_energy: default_pool_energy(),
            total_discoveries: 0,
            pity: PityCounters::default(),
            position: (0.0, 0.0),
            drag_mode: false,
            last_input_time: 0.0,
            size_index: default_size_index(),
            send_scores: default_send_scores(),
            sound_enabled: default_sound_enabled(),
            music_volume: default_music_volume(),
        }
    }
}

pub type SharedState = Mutex<GameState>;
