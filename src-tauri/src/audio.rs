use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// Start audio detection polling on a dedicated thread.
/// Sets `active` to true when system audio is playing.
pub fn start_audio_detection(active: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        loop {
            let is_playing = detect_audio_playback();
            active.store(is_playing, Ordering::SeqCst);
            std::thread::sleep(std::time::Duration::from_secs(1));
        }
    });
}

#[cfg(windows)]
fn detect_audio_playback() -> bool {
    use windows::Win32::Media::Audio::*;
    use windows::Win32::System::Com::*;

    unsafe {
        // Initialize COM for this thread
        let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
        if hr.is_err() {
            // Already initialized or error — try anyway
        }

        let result = (|| -> Result<bool, windows::core::Error> {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;

            let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;

            let manager: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None)?;

            let session_enum = manager.GetSessionEnumerator()?;
            let count = session_enum.GetCount()?;

            for i in 0..count {
                if let Ok(session) = session_enum.GetSession(i) {
                    if let Ok(state) = session.GetState() {
                        if state == AudioSessionStateActive {
                            return Ok(true);
                        }
                    }
                }
            }

            Ok(false)
        })();

        CoUninitialize();

        result.unwrap_or(false)
    }
}

#[cfg(not(windows))]
fn detect_audio_playback() -> bool {
    // macOS implementation would use CoreAudio
    // For now, return false on non-Windows
    false
}
