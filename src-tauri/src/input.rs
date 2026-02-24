//! Global input listener using rdev. Counts keystrokes and mouse clicks
//! via AtomicU64 counters that the energy loop drains every 500 ms.
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;

pub struct InputCounters {
    pub keystrokes: AtomicU64,
    pub clicks: AtomicU64,
}

impl InputCounters {
    pub fn new() -> Self {
        Self {
            keystrokes: AtomicU64::new(0),
            clicks: AtomicU64::new(0),
        }
    }

    /// Drain and reset counters, returning (keystrokes, clicks)
    pub fn drain(&self) -> (u64, u64) {
        let keys = self.keystrokes.swap(0, Ordering::SeqCst);
        let clicks = self.clicks.swap(0, Ordering::SeqCst);
        (keys, clicks)
    }
}

pub fn start_input_listener(counters: Arc<InputCounters>) {
    thread::spawn(move || {
        // Restart the listener if it crashes — rdev::listen blocks forever
        // on success, so any return (error or unexpected exit) warrants a retry.
        loop {
            let counters = counters.clone();
            let callback = move |event: rdev::Event| match event.event_type {
                rdev::EventType::KeyPress(_) => {
                    counters.keystrokes.fetch_add(1, Ordering::SeqCst);
                }
                rdev::EventType::ButtonPress(_) => {
                    counters.clicks.fetch_add(1, Ordering::SeqCst);
                }
                // Each scroll notch counts toward click energy
                rdev::EventType::Wheel { .. } => {
                    counters.clicks.fetch_add(1, Ordering::SeqCst);
                }
                _ => {}
            };

            if let Err(e) = rdev::listen(callback) {
                eprintln!("Input listener error: {:?}, restarting in 5s", e);
            } else {
                eprintln!("Input listener exited unexpectedly, restarting in 5s");
            }
            thread::sleep(std::time::Duration::from_secs(5));
        }
    });
}
