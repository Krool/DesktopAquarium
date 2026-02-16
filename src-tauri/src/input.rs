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
        let counters = counters.clone();
        let callback = move |event: rdev::Event| {
            match event.event_type {
                rdev::EventType::KeyPress(_) => {
                    counters.keystrokes.fetch_add(1, Ordering::SeqCst);
                }
                rdev::EventType::ButtonPress(_) => {
                    counters.clicks.fetch_add(1, Ordering::SeqCst);
                }
                _ => {}
            }
        };

        // rdev::listen blocks the thread
        if let Err(e) = rdev::listen(callback) {
            eprintln!("Input listener error: {:?}", e);
        }
    });
}
