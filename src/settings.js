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

const DAY_NIGHT_OPTIONS = [
  { value: "computer", label: "Computer Time (Default)" },
  { value: "5min", label: "5 min day / 5 min night" },
  { value: "10min", label: "10 min day / 10 min night" },
  { value: "60min", label: "60 min day / 60 min night" },
  { value: "3hours", label: "3 hours day / 3 hours night" },
];

const CLOSE_BEHAVIOR_OPTIONS = [
  { value: "ask", label: "Ask Me Each Time" },
  { value: "hide", label: "Hide to Tray" },
  { value: "close", label: "Close App" },
];

function debounce(fn, ms) {
  let id;
  return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
}

function withConfirmation(btn, label, action) {
  let armed = false, timer = null;
  btn.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      btn.textContent = "Sure?";
      timer = setTimeout(() => { armed = false; btn.textContent = label; }, 3000);
    } else {
      clearTimeout(timer);
      armed = false;
      btn.textContent = label;
      await action();
    }
  });
}

const LS_COLOR_MODE = "ascii-reef-color-mode";
const LS_SETTINGS_TAB = "ascii-reef-settings-tab";

async function init() {
  const root = document.getElementById("settings-root");
  if (!root) return;

  let sendScores = true;
  let soundEnabled = false;
  let musicVolume = 0.08;
  let sizeIndex = 1;
  let dayNightCycle = "computer";
  let closeBehavior = "ask";
  let messageBottlesEnabled = false;
  let autostartEnabled = false;
  let windowVisible = true;
  let currentTab = localStorage.getItem(LS_SETTINGS_TAB) || "aquarium";

  root.innerHTML = `
    <div class="settings-header">
      <h1>Settings</h1>
    </div>
    <div class="settings-tab-bar">
      <button class="settings-tab" data-tab="aquarium">Aquarium</button>
      <button class="settings-tab" data-tab="system">System</button>
    </div>
    <div class="settings-tab-panel" id="settings-panel-aquarium">
      <div class="settings-section">
        <div class="settings-select">
          <label for="size-select">Aquarium Size</label>
          <select id="size-select"></select>
        </div>
        <div class="settings-hint">Changes window size immediately.</div>
      </div>
      <div class="settings-section">
        <div class="settings-select">
          <label for="day-night-cycle-select">Day/Night Cycle</label>
          <select id="day-night-cycle-select"></select>
        </div>
        <div class="settings-hint">Computer time or custom cycle length per day and per night.</div>
      </div>
      <div class="settings-section">
        <div class="settings-select">
          <label for="color-mode-select">Fish Colors</label>
          <select id="color-mode-select">
            <option value="rarity">By Rarity</option>
            <option value="natural">Natural</option>
          </select>
        </div>
        <div class="settings-hint">By Rarity uses rarity-tier palette. Natural uses real-world-inspired colors with shimmer, pulse, and iridescent effects.</div>
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
    </div>
    <div class="settings-tab-panel" id="settings-panel-system">
      <div class="settings-section">
        <div class="settings-select">
          <label for="close-behavior-select">When Clicking X</label>
          <select id="close-behavior-select"></select>
        </div>
        <div class="settings-hint">Choose whether X asks, hides to tray, or closes the app.</div>
      </div>
      <div class="settings-section">
        <label class="settings-toggle">
          <input id="autostart-toggle" type="checkbox" />
          <span>Start on Boot</span>
        </label>
        <div class="settings-hint">Launches ASCII Reef when your computer starts.</div>
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
          <input id="message-bottles-toggle" type="checkbox" />
          <span>Messages in a Bottle</span>
        </label>
        <div class="settings-hint">Receive/send global bottle notes via Firebase.</div>
      </div>
    </div>
    <div class="settings-actions-section">
      <div class="settings-actions">
        <button id="toggle-window-btn" type="button"></button>
        <button id="open-collection-btn" type="button">Open Collection</button>
        <button id="reset-position-btn" type="button">Reset Position</button>
        <button id="reset-aquarium-btn" type="button" class="danger">Reset Aquarium</button>
        <button id="quit-app-btn" type="button" class="danger">Quit App</button>
      </div>
    </div>
  `;

  // Tab switching
  const tabBtns = root.querySelectorAll(".settings-tab");
  const panels = {
    aquarium: document.getElementById("settings-panel-aquarium"),
    system: document.getElementById("settings-panel-system"),
  };

  function switchTab(tab) {
    currentTab = tab;
    localStorage.setItem(LS_SETTINGS_TAB, tab);
    tabBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
    Object.entries(panels).forEach(([key, panel]) => {
      if (panel) panel.classList.toggle("settings-tab-panel--hidden", key !== tab);
    });
  }

  tabBtns.forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
  switchTab(currentTab);

  const sendScoresToggle = document.getElementById("send-scores-toggle");
  const soundToggle = document.getElementById("sound-toggle");
  const volumeSlider = document.getElementById("volume-slider");
  const volumeValue = document.getElementById("volume-value");
  const dayNightCycleSelect = document.getElementById("day-night-cycle-select");
  const colorModeSelect = document.getElementById("color-mode-select");
  const sizeSelect = document.getElementById("size-select");
  const closeBehaviorSelect = document.getElementById("close-behavior-select");
  const messageBottlesToggle = document.getElementById("message-bottles-toggle");
  const autostartToggle = document.getElementById("autostart-toggle");
  const toggleWindowBtn = document.getElementById("toggle-window-btn");
  const openCollectionBtn = document.getElementById("open-collection-btn");
  const resetPositionBtn = document.getElementById("reset-position-btn");
  const resetAquariumBtn = document.getElementById("reset-aquarium-btn");
  const quitAppBtn = document.getElementById("quit-app-btn");

  function applyStateToUi() {
    if (sendScoresToggle) sendScoresToggle.checked = sendScores;
    if (soundToggle) soundToggle.checked = soundEnabled;
    if (volumeSlider && volumeValue) {
      volumeSlider.value = String(Math.round(musicVolume * 100));
      volumeValue.textContent = `${Math.round(musicVolume * 100)}%`;
    }
    if (colorModeSelect) colorModeSelect.value = localStorage.getItem(LS_COLOR_MODE) || "rarity";
    if (sizeSelect) sizeSelect.value = String(sizeIndex);
    if (dayNightCycleSelect) dayNightCycleSelect.value = dayNightCycle;
    if (closeBehaviorSelect) closeBehaviorSelect.value = closeBehavior;
    if (messageBottlesToggle) messageBottlesToggle.checked = messageBottlesEnabled;
    if (autostartToggle) autostartToggle.checked = autostartEnabled;
    syncToggleWindowLabel();
  }

  function syncToggleWindowLabel() {
    if (!toggleWindowBtn) return;
    toggleWindowBtn.textContent = windowVisible ? "Hide Aquarium" : "Show Aquarium";
  }

  if (sizeSelect) {
    sizeSelect.innerHTML = SIZE_LABELS.map((label, idx) =>
      `<option value="${idx}">${label}</option>`
    ).join("");
  }

  if (dayNightCycleSelect) {
    dayNightCycleSelect.innerHTML = DAY_NIGHT_OPTIONS.map((option) =>
      `<option value="${option.value}">${option.label}</option>`
    ).join("");
  }

  if (closeBehaviorSelect) {
    closeBehaviorSelect.innerHTML = CLOSE_BEHAVIOR_OPTIONS.map((option) =>
      `<option value="${option.value}">${option.label}</option>`
    ).join("");
  }

  if (sendScoresToggle) {
    sendScoresToggle.addEventListener("change", async (e) => {
      const enabled = !!e.target.checked;
      try {
        await invoke("set_send_scores", { enabled });
      } catch (e) {
        console.error("Failed to set send scores:", e);
      }
    });
  }

  if (soundToggle) {
    soundToggle.addEventListener("change", async (e) => {
      const enabled = !!e.target.checked;
      try {
        await invoke("set_sound_enabled", { enabled });
      } catch (e) {
        console.error("Failed to set sound enabled:", e);
      }
    });
  }

  if (volumeSlider && volumeValue) {
    const debouncedSetVolume = debounce(async (value) => {
      try {
        await invoke("set_music_volume", { volume: value });
      } catch (err) {
        console.error("Failed to set music volume:", err);
      }
    }, 150);
    volumeSlider.addEventListener("input", (e) => {
      const value = Number(e.target.value) / 100;
      volumeValue.textContent = `${Math.round(value * 100)}%`;
      debouncedSetVolume(value);
    });
  }

  if (sizeSelect) {
    sizeSelect.addEventListener("change", async (e) => {
      const idx = parseInt(e.target.value, 10);
      if (Number.isNaN(idx)) return;
      try {
        await invoke("set_size_index", { idx });
      } catch (e) {
        console.error("Failed to set size index:", e);
      }
    });
  }

  if (dayNightCycleSelect) {
    dayNightCycleSelect.addEventListener("change", async (e) => {
      const cycle = e.target.value;
      try {
        await invoke("set_day_night_cycle", { cycle });
      } catch (e) {
        console.error("Failed to set day/night cycle:", e);
      }
    });
  }

  if (colorModeSelect) {
    colorModeSelect.addEventListener("change", (e) => {
      localStorage.setItem(LS_COLOR_MODE, e.target.value);
    });
  }

  if (closeBehaviorSelect) {
    closeBehaviorSelect.addEventListener("change", async (e) => {
      const behavior = e.target.value;
      try {
        await invoke("set_close_behavior", { behavior });
      } catch (e) {
        console.error("Failed to set close behavior:", e);
      }
    });
  }

  if (autostartToggle) {
    autostartToggle.addEventListener("change", async (e) => {
      const enabled = !!e.target.checked;
      try {
        await invoke("set_autostart", { enabled });
      } catch (e) {
        console.error("Failed to set autostart:", e);
        autostartToggle.checked = !enabled;
      }
    });
  }

  if (messageBottlesToggle) {
    messageBottlesToggle.addEventListener("change", async (e) => {
      const enabled = !!e.target.checked;
      try {
        await invoke("set_message_bottles_preferences", { enabled, prompted: true });
      } catch (e) {
        console.error("Failed to set message bottles preferences:", e);
        messageBottlesToggle.checked = !enabled;
      }
    });
  }

  if (toggleWindowBtn) {
    toggleWindowBtn.addEventListener("click", async () => {
      const nextVisible = !windowVisible;
      try {
        await invoke("set_main_window_visibility", { show: nextVisible });
        windowVisible = nextVisible;
        syncToggleWindowLabel();
      } catch (e) {
        console.error("Failed to set window visibility:", e);
      }
    });
  }

  if (openCollectionBtn) {
    openCollectionBtn.addEventListener("click", async () => {
      try {
        await invoke("open_collection");
      } catch (e) {
        console.error("Failed to open collection:", e);
      }
    });
  }

  if (resetPositionBtn) {
    resetPositionBtn.addEventListener("click", async () => {
      try {
        await invoke("reset_window_position");
      } catch (e) {
        console.error("Failed to reset window position:", e);
      }
    });
  }

  if (resetAquariumBtn) {
    withConfirmation(resetAquariumBtn, "Reset Aquarium", async () => {
      try {
        await invoke("reset_aquarium");
      } catch (e) {
        console.error("Failed to reset aquarium:", e);
      }
    });
  }

  if (quitAppBtn) {
    withConfirmation(quitAppBtn, "Quit App", async () => {
      try {
        await invoke("quit_app");
      } catch (e) {
        console.error("Failed to quit app:", e);
      }
    });
  }

  try {
    const state = await invoke("get_state");
    sendScores = !!state.sendScores;
    soundEnabled = !!state.soundEnabled;
    musicVolume = typeof state.musicVolume === "number" ? state.musicVolume : 0.08;
    sizeIndex = typeof state.sizeIndex === "number" ? state.sizeIndex : sizeIndex;
    dayNightCycle = typeof state.dayNightCycle === "string" ? state.dayNightCycle : "computer";
    closeBehavior = typeof state.closeBehavior === "string" ? state.closeBehavior : "ask";
    messageBottlesEnabled = !!state.messageBottlesEnabled;
    autostartEnabled = !!state.autostartEnabled;
    windowVisible = state.windowVisible !== false;
    applyStateToUi();
  } catch (e) {
    console.error("Failed to load initial settings state:", e);
    applyStateToUi();
  }
}

init();
