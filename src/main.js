// ASCII Reef - Overlay bootstrap + Tauri event listeners

import { initCanvas, startRenderLoop, drawString, drawStringBg, drawBg, resizeCanvas, getCharDimensions, COLS, ROWS } from "./renderer/canvas.js";
import { parseAllCreatures } from "./renderer/sprites.js";
import { ENV_COLORS, RARITY_COLORS } from "./renderer/colors.js";
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

function updateAchievements(collection, showToasts) {
  const rank = getMyRank();
  const newSet = computeUnlocked(collection, creaturesData, rank);
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

async function init() {
  // Parse creature sprites
  allSprites = parseAllCreatures(creaturesData);

  // Initialize canvas
  const canvas = document.getElementById("tank");
  initCanvas(canvas);

  // Initialize leaderboard
  initLeaderboard();

  // Request initial state from Rust backend
  try {
    const state = await invoke("get_state");
    const collection = state.collection || {};
    isFirstRun = Object.keys(collection).length === 0;
    initTank(allSprites, collection);
    if (state.poolEnergy) {
      energyDisplay.typing = state.poolEnergy.typing || 0;
      energyDisplay.click = state.poolEnergy.click || 0;
      energyDisplay.audio = state.poolEnergy.audio || 0;
    }

    // Compute initial achievements (no toasts on load)
    updateAchievements(collection, false);

    // Submit initial score to leaderboard
    if (Object.keys(collection).length > 0) {
      const score = calculateScore();
      const unique = getUniqueCount();
      submitScore(score, unique);
    }
  } catch {
    isFirstRun = true;
    initTank(allSprites, {});
    updateAchievements({}, false);
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

    // Check for new achievements (show toasts)
    updateAchievements(col, true);

    // Trigger visual effects
    triggerDiscoveryBurst(sprite.name, sprite.rarity, isNew);
    spawnDiscoveryCreature(sprite, performance.now());
    setCapBoost(performance.now());

    // Submit updated score to leaderboard
    const score = calculateScore();
    const unique = getUniqueCount();
    submitScore(score, unique);
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
      const col = Math.floor((COLS - text.length) / 2);
      const row = Math.floor(ROWS / 2);
      drawStringBg(col, row, text, ENV_COLORS.ui, uiBg);
    }

    // 6. Three energy bars (top-left, scaled down on smaller aquariums)
    const barWidth = COLS <= 45 ? 4 : COLS <= 65 ? 6 : 8;
    const barGap = COLS <= 45 ? 1 : 2;
    const bars = [
      { label: "T", value: energyDisplay.typing },
      { label: "C", value: energyDisplay.click },
      { label: "A", value: energyDisplay.audio },
    ];

    let barCol = 1;
    for (const bar of bars) {
      const filled = Math.floor((bar.value / energyDisplay.threshold) * barWidth);
      let meter = bar.label + "[";
      for (let i = 0; i < barWidth; i++) {
        meter += i < filled ? "|" : ".";
      }
      meter += "]";
      drawStringBg(barCol, 0, meter, ENV_COLORS.ui, uiBg);
      barCol += meter.length + barGap;
    }

    // 7. Last discovery: sprite preview + name
    if (lastDiscovery) {
      const color = RARITY_COLORS[lastDiscovery.rarity] || ENV_COLORS.ui;
      let col = 42;
      if (lastDiscovery.sprite) {
        drawStringBg(col, 0, lastDiscovery.sprite, color, uiBg);
        col += lastDiscovery.sprite.length + 1;
      }
      drawStringBg(col, 0, lastDiscovery.name, color, uiBg);
    }
  });
}

init();
