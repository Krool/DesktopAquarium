//! Audio detection — polls whether system audio is currently playing.
//!
//! Platform implementations:
//!   Windows : WASAPI endpoint-level IAudioMeterInformation peak meter
//!   macOS   : CoreAudio kAudioDevicePropertyDeviceIsRunningSomewhere
//!   Linux   : /proc/asound PCM device status (ALSA)
//!   Other   : always false
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub fn start_audio_detection(active: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        // Windows: initialise COM once for this thread and hold it for the
        // lifetime of the thread via RAII (see ComGuard below).
        #[cfg(windows)]
        let _com = windows_impl::ComGuard::init();

        loop {
            active.store(detect_audio_playback(), Ordering::SeqCst);
            std::thread::sleep(std::time::Duration::from_secs(1));
        }
    });
}

// ── Windows ───────────────────────────────────────────────────────────────────

#[cfg(windows)]
mod windows_impl {
    /// RAII guard: initialises COM on construction, uninitialises on drop.
    pub struct ComGuard;

    impl ComGuard {
        pub fn init() -> Self {
            unsafe {
                use windows::Win32::System::Com::*;
                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            }
            Self
        }
    }

    impl Drop for ComGuard {
        fn drop(&mut self) {
            unsafe {
                windows::Win32::System::Com::CoUninitialize();
            }
        }
    }
}

#[cfg(windows)]
fn detect_audio_playback() -> bool {
    use windows::Win32::Media::Audio::Endpoints::IAudioMeterInformation;
    use windows::Win32::Media::Audio::*;
    use windows::Win32::System::Com::*;

    unsafe {
        let result = (|| -> Result<bool, windows::core::Error> {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
            // Use the endpoint-level peak meter: captures ALL audio output on this
            // device regardless of which process (including sandboxed WebView2 audio).
            let meter: IAudioMeterInformation = device.Activate(CLSCTX_ALL, None)?;
            let peak = meter.GetPeakValue()?;
            Ok(peak > 0.01)
        })();
        result.unwrap_or(false)
    }
}

// ── macOS ─────────────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
mod macos_impl {
    use std::ffi::c_void;

    #[repr(C)]
    pub struct AudioObjectPropertyAddress {
        pub m_selector: u32,
        pub m_scope: u32,
        pub m_element: u32,
    }

    // CoreAudio FourCC constants
    pub const SYSTEM_OBJECT: u32 = 1;
    pub const DEFAULT_OUTPUT_DEVICE: u32 = 0x644F_7574; // 'dOut'
    pub const IS_RUNNING_SOMEWHERE: u32 = 0x6172_756E; // 'arun'
    pub const SCOPE_GLOBAL: u32 = 0x676C_6F62; // 'glob'
    pub const ELEMENT_MAIN: u32 = 0;

    #[link(name = "CoreAudio", kind = "framework")]
    extern "C" {
        pub fn AudioObjectGetPropertyData(
            in_object_id: u32,
            in_address: *const AudioObjectPropertyAddress,
            in_qualifier_data_size: u32,
            in_qualifier_data: *const c_void,
            io_data_size: *mut u32,
            out_data: *mut c_void,
        ) -> i32;
    }
}

#[cfg(target_os = "macos")]
fn detect_audio_playback() -> bool {
    use macos_impl::*;
    use std::ffi::c_void;

    unsafe {
        // Step 1: get the default output device ID
        let mut device_id: u32 = 0;
        let mut size = std::mem::size_of::<u32>() as u32;
        let addr = AudioObjectPropertyAddress {
            m_selector: DEFAULT_OUTPUT_DEVICE,
            m_scope: SCOPE_GLOBAL,
            m_element: ELEMENT_MAIN,
        };
        let status = AudioObjectGetPropertyData(
            SYSTEM_OBJECT,
            &addr,
            0,
            std::ptr::null(),
            &mut size,
            &mut device_id as *mut u32 as *mut c_void,
        );
        if status != 0 || device_id == 0 {
            return false;
        }

        // Step 2: check whether that device is currently running anywhere
        let mut is_running: u32 = 0;
        let mut size = std::mem::size_of::<u32>() as u32;
        let addr = AudioObjectPropertyAddress {
            m_selector: IS_RUNNING_SOMEWHERE,
            m_scope: SCOPE_GLOBAL,
            m_element: ELEMENT_MAIN,
        };
        let status = AudioObjectGetPropertyData(
            device_id,
            &addr,
            0,
            std::ptr::null(),
            &mut size,
            &mut is_running as *mut u32 as *mut c_void,
        );
        status == 0 && is_running != 0
    }
}

// ── Linux ─────────────────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
fn detect_audio_playback() -> bool {
    // Walk /proc/asound/card*/pcm*/sub*/status and look for "RUNNING".
    // This covers ALSA, PulseAudio, and PipeWire (all route through ALSA
    // kernel drivers and show up in procfs).
    let asound = std::path::Path::new("/proc/asound");
    if !asound.is_dir() {
        return false;
    }
    let cards = match std::fs::read_dir(asound) {
        Ok(d) => d,
        Err(_) => return false,
    };
    for card in cards.flatten() {
        if !card.file_name().to_string_lossy().starts_with("card") {
            continue;
        }
        let pcms = match std::fs::read_dir(card.path().join("pcm")) {
            Ok(d) => d,
            Err(_) => continue,
        };
        for pcm in pcms.flatten() {
            let subs = match std::fs::read_dir(pcm.path()) {
                Ok(d) => d,
                Err(_) => continue,
            };
            for sub in subs.flatten() {
                if let Ok(content) = std::fs::read_to_string(sub.path().join("status")) {
                    if content.contains("RUNNING") {
                        return true;
                    }
                }
            }
        }
    }
    false
}

// ── Other platforms ───────────────────────────────────────────────────────────

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
fn detect_audio_playback() -> bool {
    false
}
