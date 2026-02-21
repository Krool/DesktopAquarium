use crate::input::InputCounters;
use crate::rarity::roll_rarity;
use crate::save;
use crate::state::{OwnedCreature, SharedState};
use rand::seq::SliceRandom;
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter};

const ENERGY_THRESHOLD: u32 = 40;
const KEYS_PER_ENERGY: u64 = 5;
const CLICKS_PER_ENERGY: u64 = 3;
const AUDIO_SECONDS_PER_ENERGY: f64 = 8.0;
const IDLE_TIMEOUT_SECS: f64 = 900.0; // 15 minutes
const IDLE_ENERGY_INTERVAL_SECS: f64 = 30.0;
const TICK_INTERVAL_MS: u64 = 500;
const AUTOSAVE_INTERVAL_SECS: f64 = 60.0;

/// Creature pool data (loaded from JSON at startup)
#[derive(Debug, Clone, serde::Deserialize)]
pub struct CreatureDef {
    pub id: String,
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

            // --- Collect all updates under the lock, then emit/save outside it ---
            struct TickResult {
                typing_e: u32,
                click_e: u32,
                audio_e: u32,
                discoveries: Vec<(String, String, bool)>, // (creature_id, rarity, is_new)
                need_autosave: bool,
            }

            let result = {
                let mut state_guard = state.lock().unwrap();

                // Keyboard energy → typing pool
                let key_energy = (keys / KEYS_PER_ENERGY) as u32;
                if key_energy > 0 {
                    let e = state_guard.pool_energy.entry("typing".to_string()).or_insert(0);
                    *e += key_energy;
                }

                // Click energy → click pool
                let click_energy = (clicks / CLICKS_PER_ENERGY) as u32;
                if click_energy > 0 {
                    let e = state_guard.pool_energy.entry("click".to_string()).or_insert(0);
                    *e += click_energy;
                }

                // Audio energy → audio pool
                if audio_active.load(std::sync::atomic::Ordering::SeqCst) {
                    audio_accumulator += delta;
                    while audio_accumulator >= AUDIO_SECONDS_PER_ENERGY {
                        audio_accumulator -= AUDIO_SECONDS_PER_ENERGY;
                        let e = state_guard.pool_energy.entry("audio".to_string()).or_insert(0);
                        *e += 1;
                    }
                    last_input_seen = now;
                }

                // Idle fallback → typing pool
                let idle_secs = now.duration_since(last_input_seen).as_secs_f64();
                if idle_secs >= IDLE_TIMEOUT_SECS {
                    idle_accumulator += delta;
                    while idle_accumulator >= IDLE_ENERGY_INTERVAL_SECS {
                        idle_accumulator -= IDLE_ENERGY_INTERVAL_SECS;
                        let e = state_guard.pool_energy.entry("typing".to_string()).or_insert(0);
                        *e += 1;
                    }
                } else {
                    idle_accumulator = 0.0;
                }

                let typing_e = *state_guard.pool_energy.get("typing").unwrap_or(&0);
                let click_e = *state_guard.pool_energy.get("click").unwrap_or(&0);
                let audio_e = *state_guard.pool_energy.get("audio").unwrap_or(&0);

                // Check each pool for discovery
                let mut discoveries = Vec::new();
                let pools = ["typing", "click", "audio"];
                for pool_name in &pools {
                    let pool_val = *state_guard.pool_energy.get(*pool_name).unwrap_or(&0);
                    if pool_val >= ENERGY_THRESHOLD {
                        state_guard.pool_energy.insert(pool_name.to_string(), 0);
                        state_guard.total_discoveries += 1;

                        let rarity = roll_rarity(&mut state_guard.pity);
                        let rarity_str = rarity.as_str();

                        let candidates: Vec<&CreatureDef> = creatures
                            .iter()
                            .filter(|c| c.pool == *pool_name && c.rarity == rarity_str)
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
                            discoveries.push((creature_id, rarity_str.to_string(), is_new));
                        }
                    }
                }

                let need_autosave = now.duration_since(last_save).as_secs_f64() >= AUTOSAVE_INTERVAL_SECS;

                // Save inside the lock only if needed (discoveries or autosave)
                if !discoveries.is_empty() || need_autosave {
                    let _ = save::atomic_save(&state_guard);
                    // state_guard dropped here
                }

                TickResult { typing_e, click_e, audio_e, discoveries, need_autosave }
                // lock released here
            };

            // --- Emit events outside the lock ---
            let _ = app.emit("energy-update", serde_json::json!({
                "typing": result.typing_e,
                "click": result.click_e,
                "audio": result.audio_e,
                "threshold": ENERGY_THRESHOLD
            }));

            for (creature_id, rarity_str, is_new) in result.discoveries {
                let _ = app.emit("discovery", serde_json::json!({
                    "creatureId": creature_id,
                    "rarity": rarity_str,
                    "isNew": is_new,
                }));
            }

            if result.need_autosave {
                last_save = now;
            }
        }
    });
}
