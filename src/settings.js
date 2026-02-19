// Settings window bootstrap

const { invoke } = window.__TAURI__.core;
const { getCurrentWindow } = window.__TAURI__.window;

const SIZE_LABELS = [
  "Small",
  "Medium",
  "Medium Tall",
  "Large",
  "Large Tall",
  "Wide",
  "Wide Tall",
  "Extra Wide",
];

async function init() {
  const root = document.getElementById("settings-root");
  if (!root) return;

  let sendScores = true;
  let soundEnabled = false;
  let musicVolume = 0.08;
  let sizeIndex = 2;

  try {
    const state = await invoke("get_state");
    sendScores = !!state.sendScores;
    soundEnabled = !!state.soundEnabled;
    musicVolume = typeof state.musicVolume === "number" ? state.musicVolume : 0.08;
    sizeIndex = typeof state.sizeIndex === "number" ? state.sizeIndex : 2;
  } catch {
    // Backend not available
  }

  root.innerHTML = `
    <div class="settings-header">
      <h1>Settings</h1>
      <div id="settings-close" title="Close">x</div>
    </div>
    <div class="settings-section">
      <label class="settings-toggle">
        <input id="send-scores-toggle" type="checkbox" />
        <span>Send Scores</span>
      </label>
      <div class="settings-hint">Send anonymous scores to the global leaderboard.</div>
    </div>
    <div class="settings-section">
      <label class="settings-toggle">
        <input id="sound-toggle" type="checkbox" />
        <span>Sound</span>
      </label>
      <div class="settings-hint">Ambient music loop.</div>
      <div class="settings-slider">
        <div class="settings-slider-label">Volume</div>
        <input id="volume-slider" type="range" min="0" max="100" step="1" />
        <div id="volume-value" class="settings-slider-value"></div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-select">
        <label for="size-select">Aquarium Size</label>
        <select id="size-select"></select>
      </div>
      <div class="settings-hint">Changes window size immediately.</div>
    </div>
  `;

  const closeBtn = document.getElementById("settings-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      try {
        getCurrentWindow().close();
      } catch {
        // Fallback
      }
    });
  }

  const sendScoresToggle = document.getElementById("send-scores-toggle");
  const soundToggle = document.getElementById("sound-toggle");
  const volumeSlider = document.getElementById("volume-slider");
  const volumeValue = document.getElementById("volume-value");
  const sizeSelect = document.getElementById("size-select");

  if (sendScoresToggle) {
    sendScoresToggle.checked = sendScores;
    sendScoresToggle.addEventListener("change", async (e) => {
      const enabled = !!e.target.checked;
      try {
        await invoke("set_send_scores", { enabled });
      } catch {
        // Fallback
      }
    });
  }

  if (soundToggle) {
    soundToggle.checked = soundEnabled;
    soundToggle.addEventListener("change", async (e) => {
      const enabled = !!e.target.checked;
      try {
        await invoke("set_sound_enabled", { enabled });
      } catch {
        // Fallback
      }
    });
  }

  if (volumeSlider && volumeValue) {
    volumeSlider.value = String(Math.round(musicVolume * 100));
    volumeValue.textContent = `${Math.round(musicVolume * 100)}%`;
    volumeSlider.addEventListener("input", async (e) => {
      const value = Number(e.target.value) / 100;
      volumeValue.textContent = `${Math.round(value * 100)}%`;
      try {
        await invoke("set_music_volume", { volume: value });
      } catch {
        // Fallback
      }
    });
  }

  if (sizeSelect) {
    sizeSelect.innerHTML = SIZE_LABELS.map((label, idx) => {
      const selected = idx === sizeIndex ? "selected" : "";
      return `<option value="${idx}" ${selected}>${label}</option>`;
    }).join("");
    sizeSelect.addEventListener("change", async (e) => {
      const idx = parseInt(e.target.value, 10);
      if (Number.isNaN(idx)) return;
      try {
        await invoke("set_size_index", { idx });
      } catch {
        // Fallback
      }
    });
  }
}

init();
