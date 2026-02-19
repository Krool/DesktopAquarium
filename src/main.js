// ASCII Reef - Overlay bootstrap + Tauri event listeners

import { initCanvas, startRenderLoop, drawChar, drawString, drawStringBg, drawBg, resizeCanvas, getCharDimensions, COLS, ROWS } from "./renderer/canvas.js";
import { parseAllCreatures } from "./renderer/sprites.js";
import { ENV_COLORS, RARITY_COLORS, PROGRESS_COLORS } from "./renderer/colors.js";
import { renderEnvironment, reinitEnvironment, setUnlockedAchievements } from "./simulation/environment.js";
import { renderDiscovery, triggerDiscoveryBurst, triggerAchievementToast } from "./simulation/discovery.js";
import { computeUnlocked, diffAchievements, getAchievements } from "./simulation/achievements.js";
import {
  initTank,
  updateTank,
  renderTank,
  updateCollection,
  spawnDiscoveryCreature,
  setCapBoost,
  calculateScore,
  getUniqueCount,
  clearCreatures,
} from "./simulation/tank.js";
import {
  initLeaderboard,
  submitScore,
  renderLeaderboardRank,
  getMyRank,
  setLeaderboardEnabled,
} from "./simulation/leaderboard.js";
import creaturesData from "./data/creatures.json";

const { listen } = window.__TAURI__.event;
const { invoke } = window.__TAURI__.core;

let allSprites = {};
let lastTimestamp = 0;
let isFirstRun = false;
let firstRunTextVisible = true;
let energyDisplay = { typing: 0, click: 0, audio: 0, threshold: 40 };
let lastDiscovery = null;
let currentAchievements = new Set();
let sendScoresEnabled = true;
let soundEnabled = false;
let musicVolume = 0.08;
let sizeIndex = 2;
let lastCollection = {};

const MUSIC_SRC = "/audio/soft-horizon-rising-tide.wav";
const SFX_SOURCES = {
  common: "/audio/unlock-common.wav",
  uncommon: "/audio/unlock-uncommon.wav",
  rare: "/audio/unlock-rare.wav",
  epic: "/audio/unlock-epic.wav",
  legendary: "/audio/unlock-legendary.wav",
};
const SFX_VOLUMES = {
  common: 0.04,
  uncommon: 0.05,
  rare: 0.06,
  epic: 0.07,
  legendary: 0.08,
};
let musicAudio = null;
let sfxAudio = {};

function wrapText(text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxWidth) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCenteredTextBlock(lines, startRow, color, bg) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const col = Math.floor((COLS - line.length) / 2);
    drawStringBg(col, startRow + i, line, color, bg);
  }
}

function updateAchievements(collection, showToasts) {
  const rank = getMyRank();
  const newSet = computeUnlocked(collection, creaturesData, rank, {
    sizeIndex,
    soundEnabled,
    sendScoresEnabled,
  });
  if (showToasts) {
    const newlyEarned = diffAchievements(currentAchievements, newSet);
    const allAchievements = getAchievements();
    for (const id of newlyEarned) {
      const ach = allAchievements.find((a) => a.id === id);
      if (ach) triggerAchievementToast(ach.name, ach.unlock);
    }
  }
  currentAchievements = newSet;
  setUnlockedAchievements(newSet);
}

function initAudio() {
  try {
    musicAudio = new Audio(MUSIC_SRC);
    musicAudio.loop = true;
    musicAudio.volume = musicVolume;
  } catch {
    musicAudio = null;
  }

  sfxAudio = {};
  for (const [rarity, src] of Object.entries(SFX_SOURCES)) {
    try {
      const audio = new Audio(src);
      audio.volume = SFX_VOLUMES[rarity] ?? 0.05;
      sfxAudio[rarity] = audio;
    } catch {
      // Missing audio is fine
    }
  }
}

function applySoundSettings() {
  if (!musicAudio) return;
  musicAudio.volume = musicVolume;
  if (soundEnabled) {
    musicAudio.play().catch(() => {});
  } else {
    musicAudio.pause();
    musicAudio.currentTime = 0;
  }
}

function playUnlockSfx(rarity) {
  if (!soundEnabled) return;
  const audio = sfxAudio[rarity];
  if (!audio) return;
  try {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {
    // ignore
  }
}

async function init() {
  // Parse creature sprites
  allSprites = parseAllCreatures(creaturesData);

  // Initialize canvas
  const canvas = document.getElementById("tank");
  initCanvas(canvas);

  initAudio();

  // Request initial state from Rust backend
  try {
    const state = await invoke("get_state");
    const collection = state.collection || {};
    isFirstRun = Object.keys(collection).length === 0;
    lastCollection = collection;
    if (typeof state.sendScores === "boolean") {
      sendScoresEnabled = state.sendScores;
      setLeaderboardEnabled(sendScoresEnabled);
    }
    if (typeof state.soundEnabled === "boolean") {
      soundEnabled = state.soundEnabled;
    }
    if (typeof state.musicVolume === "number") {
      musicVolume = state.musicVolume;
    }
    if (typeof state.sizeIndex === "number") {
      sizeIndex = state.sizeIndex;
    }
    if (sendScoresEnabled) {
      initLeaderboard();
    }
    applySoundSettings();
    initTank(allSprites, collection);
    if (state.poolEnergy) {
      energyDisplay.typing = state.poolEnergy.typing || 0;
      energyDisplay.click = state.poolEnergy.click || 0;
      energyDisplay.audio = state.poolEnergy.audio || 0;
    }

    // Compute initial achievements (no toasts on load)
    updateAchievements(collection, false);

    // Submit initial score to leaderboard
    if (sendScoresEnabled && Object.keys(collection).length > 0) {
      const score = calculateScore();
      const unique = getUniqueCount();
      submitScore(score, unique);
    }
  } catch {
    isFirstRun = true;
    initTank(allSprites, {});
    lastCollection = {};
    updateAchievements({}, false);
    if (sendScoresEnabled) {
      initLeaderboard();
    }
    applySoundSettings();
  }

  // Listen for energy updates
  listen("energy-update", (event) => {
    energyDisplay.typing = event.payload.typing;
    energyDisplay.click = event.payload.click;
    energyDisplay.audio = event.payload.audio;
    energyDisplay.threshold = event.payload.threshold;
  });

  // Listen for discovery events
  listen("discovery", async (event) => {
    const { creatureId, isNew } = event.payload;
    const sprite = allSprites[creatureId];
    if (!sprite) return;

    firstRunTextVisible = false;
    lastDiscovery = {
      name: sprite.name,
      rarity: sprite.rarity,
      sprite: sprite.height === 1 ? sprite.frames[0][0] : "",
    };

    // Update collection from backend
    let col = {};
    try {
      const state = await invoke("get_state");
      col = state.collection || {};
      updateCollection(col);
    } catch {
      // Fallback
    }
    lastCollection = col;

    // Check for new achievements (show toasts)
    updateAchievements(col, true);

    // Trigger visual effects
    triggerDiscoveryBurst(sprite.name, sprite.rarity, isNew);
    spawnDiscoveryCreature(sprite, performance.now());
    setCapBoost(performance.now());

    if (isNew) {
      playUnlockSfx(sprite.rarity);
    }

    // Submit updated score to leaderboard
    if (sendScoresEnabled) {
      const score = calculateScore();
      const unique = getUniqueCount();
      submitScore(score, unique);
    }
  });

  // Listen for send-scores toggle from tray
  listen("send-scores", (event) => {
    sendScoresEnabled = !!event.payload.enabled;
    setLeaderboardEnabled(sendScoresEnabled);
    updateAchievements(lastCollection, false);
    if (sendScoresEnabled) {
      initLeaderboard();
      const score = calculateScore();
      const unique = getUniqueCount();
      submitScore(score, unique);
    }
  });

  listen("sound-settings", (event) => {
    if (typeof event.payload.enabled === "boolean") {
      soundEnabled = event.payload.enabled;
      updateAchievements(lastCollection, false);
    }
    if (typeof event.payload.volume === "number") {
      musicVolume = event.payload.volume;
    }
    applySoundSettings();
  });

  listen("size-index", (event) => {
    if (typeof event.payload.index === "number") {
      sizeIndex = event.payload.index;
      updateAchievements(lastCollection, false);
    }
  });

  // Listen for tank resize events from tray menu
  listen("resize-tank", (event) => {
    const { cols, rows } = event.payload;
    resizeCanvas(cols, rows);
    reinitEnvironment();
    clearCreatures();
  });

  // Listen for reset-aquarium event from tray menu
  listen("reset-aquarium", async () => {
    let col = {};
    try {
      const state = await invoke("get_state");
      col = state.collection || {};
      updateCollection(col);
    } catch {
      // Fallback
    }
    lastCollection = col;
    updateAchievements(col, false);
    clearCreatures();
    isFirstRun = true;
    firstRunTextVisible = true;
  });

  // Close button hides window to tray
  document.getElementById("close-btn").addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      await invoke("hide_window");
    } catch {
      // Fallback
    }
  });

  // Click on progress count (bottom-right) opens collection window
  document.getElementById("drag-overlay").addEventListener("mousedown", (e) => {
    const { charWidth, charHeight } = getCharDimensions();
    const gridCol = Math.floor(e.offsetX / charWidth);
    const gridRow = Math.floor(e.offsetY / charHeight);
    const rockRow = ROWS - 2;
    // Progress text is at the right side of the rock row
    if (gridRow === rockRow && gridCol >= COLS - 8) {
      e.stopPropagation();
      e.preventDefault();
      invoke("open_collection");
    }
  });

  // Start render loop
  startRenderLoop((timestamp) => {
    const delta = lastTimestamp === 0 ? 0 : (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    // 1. Environment (drawn first, background layer)
    renderEnvironment(timestamp);

    // 2. Tank creatures
    updateTank(timestamp, delta);
    renderTank(timestamp);

    // 3. Discovery effects (on top)
    renderDiscovery(timestamp);

    // 4. Leaderboard rank display
    renderLeaderboardRank(timestamp);

    const uiBg = "rgba(0, 0, 0, 0.5)";

    // 5. First-run welcome text
    if (isFirstRun && firstRunTextVisible) {
      const text = "Passively unlock fish every time you Click, Tap, or Listen to anything. Nothing is logged. Score is sent with no identifying information.";
      const minCols = 50;
      const minRows = 12;
      if (COLS >= minCols && ROWS >= minRows) {
        const maxWidth = Math.min(COLS - 4, 80);
        const lines = wrapText(text, maxWidth);
        const maxLines = Math.min(4, ROWS - 6);
        const visible = lines.slice(0, maxLines);
        const startRow = Math.floor(ROWS / 2) - Math.floor(visible.length / 2);
        drawCenteredTextBlock(visible, startRow, ENV_COLORS.ui, uiBg);
      }
    }

    const topRightReserved = 4; // leave room for [X]

    // 6. Three energy bars (top-left, stacked horizontally)
    const barWidth = 8;
    const bars = [
      { label: "T", value: energyDisplay.typing, key: "typing" },
      { label: "C", value: energyDisplay.click, key: "click" },
      { label: "A", value: energyDisplay.audio, key: "audio" },
    ];
    const barLen = barWidth + 3;
    let nextCol = 1;
    for (const bar of bars) {
      if (nextCol + barLen > COLS - 1) break;
      const filled = Math.floor((bar.value / energyDisplay.threshold) * barWidth);
      const colors = PROGRESS_COLORS[bar.key] || PROGRESS_COLORS.typing;
      drawBg(nextCol, 0, barLen, 1, uiBg);
      drawChar(nextCol, 0, bar.label, colors.outline);
      drawChar(nextCol + 1, 0, "[", colors.outline);
      drawChar(nextCol + barLen - 1, 0, "]", colors.outline);
      for (let i = 0; i < barWidth; i++) {
        const glyph = i < filled ? "|" : ".";
        const color = i < filled ? colors.fill : colors.empty;
        drawChar(nextCol + 2 + i, 0, glyph, color);
      }
      nextCol += barLen + 2;
    }

    // 7. Last discovery: sprite preview + name
    if (lastDiscovery) {
      const color = RARITY_COLORS[lastDiscovery.rarity] || ENV_COLORS.ui;
      const spriteText = lastDiscovery.sprite ? `${lastDiscovery.sprite} ` : "";
      const nameText = lastDiscovery.name;
      const block = `${spriteText}${nameText}`;
      const blockLen = block.length;
      const minCol = nextCol;
      if (blockLen < COLS - minCol - topRightReserved - 1) {
        const col = Math.max(minCol, COLS - blockLen - topRightReserved - 1);
        if (lastDiscovery.sprite) {
          drawStringBg(col, 0, lastDiscovery.sprite, color, uiBg);
          drawStringBg(col + lastDiscovery.sprite.length + 1, 0, lastDiscovery.name, color, uiBg);
        } else {
          drawStringBg(col, 0, lastDiscovery.name, color, uiBg);
        }
      }
    }
  });
}

init();
