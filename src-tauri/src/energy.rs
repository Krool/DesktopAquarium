use crate::input::InputCounters;
use crate::rarity::roll_rarity;
use crate::save;
use crate::state::{OwnedCreature, SharedState};
use rand::seq::SliceRandom;
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter};

const ENERGY_THRESHOLD: u32 = 40;
const KEYS_PER_ENERGY: u64 = 10;
const CLICKS_PER_ENERGY: u64 = 5;
const AUDIO_SECONDS_PER_ENERGY: f64 = 5.0;
const IDLE_TIMEOUT_SECS: f64 = 900.0; // 15 minutes
const IDLE_ENERGY_INTERVAL_SECS: f64 = 30.0;
const TICK_INTERVAL_MS: u64 = 500;
const AUTOSAVE_INTERVAL_SECS: f64 = 60.0;

/// Creature pool data (loaded from JSON at startup)
#[derive(Debug, Clone, serde::Deserialize)]
#[allow(dead_code)]
pub struct CreatureDef {
    pub id: String,
    pub name: String,
    pub pool: String,
    pub rarity: String,
}

pub fn start_energy_loop(
    app: AppHandle,
    state: Arc<SharedState>,
    counters: Arc<InputCounters>,
    audio_active: Arc<std::sync::atomic::AtomicBool>,
    creatures: Vec<CreatureDef>,
) {
    std::thread::spawn(move || {
        let mut last_tick = Instant::now();
        let mut last_save = Instant::now();
        let mut audio_accumulator: f64 = 0.0;
        let mut idle_accumulator: f64 = 0.0;
        let mut last_input_seen = Instant::now();

        loop {
            std::thread::sleep(std::time::Duration::from_millis(TICK_INTERVAL_MS));
            let now = Instant::now();
            let delta = now.duration_since(last_tick).as_secs_f64();
            last_tick = now;

            let (keys, clicks) = counters.drain();
            let has_input = keys > 0 || clicks > 0;

            if has_input {
                last_input_seen = now;
            }

            let mut state_guard = state.lock().unwrap();

            // Keyboard energy
            let key_energy = (keys / KEYS_PER_ENERGY) as u32;
            if key_energy > 0 {
                state_guard.energy += key_energy;
                let e = state_guard.source_energy.entry("typing".to_string()).or_insert(0);
                *e += key_energy;
            }

            // Click energy
            let click_energy = (clicks / CLICKS_PER_ENERGY) as u32;
            if click_energy > 0 {
                state_guard.energy += click_energy;
                let e = state_guard.source_energy.entry("click".to_string()).or_insert(0);
                *e += click_energy;
            }

            // Audio energy
            if audio_active.load(std::sync::atomic::Ordering::SeqCst) {
                audio_accumulator += delta;
                while audio_accumulator >= AUDIO_SECONDS_PER_ENERGY {
                    audio_accumulator -= AUDIO_SECONDS_PER_ENERGY;
                    state_guard.energy += 1;
                    let e = state_guard.source_energy.entry("audio".to_string()).or_insert(0);
                    *e += 1;
                }
                last_input_seen = now;
            }

            // Idle fallback
            let idle_secs = now.duration_since(last_input_seen).as_secs_f64();
            if idle_secs >= IDLE_TIMEOUT_SECS {
                idle_accumulator += delta;
                while idle_accumulator >= IDLE_ENERGY_INTERVAL_SECS {
                    idle_accumulator -= IDLE_ENERGY_INTERVAL_SECS;
                    state_guard.energy += 1;
                    // Idle energy goes to typing pool by default
                    let e = state_guard.source_energy.entry("typing".to_string()).or_insert(0);
                    *e += 1;
                }
            } else {
                idle_accumulator = 0.0;
            }

            // Emit energy update
            let _ = app.emit("energy-update", serde_json::json!({
                "current": state_guard.energy,
                "threshold": ENERGY_THRESHOLD
            }));

            // Check discovery threshold
            if state_guard.energy >= ENERGY_THRESHOLD {
                state_guard.energy = 0;
                state_guard.total_discoveries += 1;

                // Determine dominant source
                let dominant = state_guard
                    .source_energy
                    .iter()
                    .max_by_key(|(_, v)| *v)
                    .map(|(k, _)| k.clone())
                    .unwrap_or_else(|| "typing".to_string());
                state_guard.dominant_source = dominant.clone();

                // Reset source energy
                for v in state_guard.source_energy.values_mut() {
                    *v = 0;
                }

                // Roll rarity
                let rarity = roll_rarity(&mut state_guard.pity);
                let rarity_str = rarity.as_str();

                // Pick creature from dominant pool + rarity
                let candidates: Vec<&CreatureDef> = creatures
                    .iter()
                    .filter(|c| c.pool == dominant && c.rarity == rarity_str)
                    .collect();

                if let Some(creature) = candidates.choose(&mut rand::thread_rng()) {
                    let creature_id = creature.id.clone();
                    let is_new = !state_guard.collection.contains_key(&creature_id);

                    let entry = state_guard
                        .collection
                        .entry(creature_id.clone())
                        .or_insert_with(|| OwnedCreature {
                            count: 0,
                            first_seen: chrono::Utc::now().to_rfc3339(),
                        });
                    entry.count += 1;

                    let _ = app.emit("discovery", serde_json::json!({
                        "creatureId": creature_id,
                        "rarity": rarity_str,
                        "isNew": is_new,
                    }));
                }
            }

            // Autosave
            if now.duration_since(last_save).as_secs_f64() >= AUTOSAVE_INTERVAL_SECS {
                let _ = save::atomic_save(&state_guard);
                last_save = now;
            }

            drop(state_guard);
        }
    });
}
