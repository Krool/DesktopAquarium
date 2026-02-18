// ASCII Reef - Overlay bootstrap + Tauri event listeners

import { initCanvas, startRenderLoop, drawStringBg, resizeCanvas, getCharDimensions, COLS, ROWS } from "./renderer/canvas.js";
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
  getCreatureAtGrid,
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
const { getCurrentWindow } = window.__TAURI__.window;

const appWindow = getCurrentWindow();

let allSprites = {};
let lastTimestamp = 0;
let isFirstRun = false;
let firstRunTextVisible = true;
let energyDisplay = { typing: 0, click: 0, audio: 0, threshold: 40 };
let lastDiscovery = null;
let currentAchievements = new Set();
let fishLabelToast = null;

const CLICK_DRAG_THRESHOLD = 6;
const CLICK_MAX_DURATION_MS = 250;
const LABEL_DURATION_MS = 1800;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getGridPositionFromPointer(event) {
  const overlay = event.currentTarget;
  const rect = overlay.getBoundingClientRect();
  const { charWidth, charHeight } = getCharDimensions();
  const relativeX = event.clientX - rect.left;
  const relativeY = event.clientY - rect.top;
  return {
    col: Math.floor(relativeX / charWidth),
    row: Math.floor(relativeY / charHeight),
  };
}

function isCollectionProgressCell(col, row) {
  const rockRow = ROWS - 2;
  return row === rockRow && col >= COLS - 8;
}

function showFishLabel(creature) {
  const text = creature.sprite.name;
  const color = RARITY_COLORS[creature.rarity] || ENV_COLORS.ui;
  const row = clamp(creature.row - 1, 1, ROWS - 3);
  const col = clamp(creature.col, 1, Math.max(1, COLS - text.length - 1));
  fishLabelToast = {
    text,
    color,
    row,
    col,
    expiresAt: performance.now() + LABEL_DURATION_MS,
  };
}

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

  const dragOverlay = document.getElementById("drag-overlay");
  let pointerState = null;

  dragOverlay.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;

    const gridPos = getGridPositionFromPointer(event);
    pointerState = {
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
      didDrag: false,
      gridPos,
    };
  });

  dragOverlay.addEventListener("mousemove", (event) => {
    if (!pointerState || pointerState.didDrag) return;

    const distance = Math.hypot(event.clientX - pointerState.startX, event.clientY - pointerState.startY);
    if (distance < CLICK_DRAG_THRESHOLD) return;

    pointerState.didDrag = true;
    appWindow.startDragging().catch(() => {
      // no-op fallback
    });
  });

  dragOverlay.addEventListener("mouseup", (event) => {
    if (event.button !== 0 || !pointerState) return;

    const elapsed = performance.now() - pointerState.startedAt;
    if (!pointerState.didDrag && elapsed <= CLICK_MAX_DURATION_MS) {
      const { col, row } = pointerState.gridPos;
      if (isCollectionProgressCell(col, row)) {
        invoke("open_collection");
      } else {
        const creature = getCreatureAtGrid(col, row);
        if (creature) {
          showFishLabel(creature);
        }
      }
    }

    pointerState = null;
  });

  dragOverlay.addEventListener("mouseleave", () => {
    if (pointerState && !pointerState.didDrag) {
      pointerState = null;
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

    // 6. Three energy bars (top-left, stacked horizontally)
    const barWidth = 8;
    const bars = [
      { label: "T", value: energyDisplay.typing, col: 1 },
      { label: "C", value: energyDisplay.click, col: 15 },
      { label: "A", value: energyDisplay.audio, col: 29 },
    ];
    for (const bar of bars) {
      const filled = Math.floor((bar.value / energyDisplay.threshold) * barWidth);
      let meter = bar.label + "[";
      for (let i = 0; i < barWidth; i++) {
        meter += i < filled ? "|" : ".";
      }
      meter += "]";
      drawStringBg(bar.col, 0, meter, ENV_COLORS.ui, uiBg);
    }

    // 7. Fish label toast on quick click
    if (fishLabelToast && timestamp <= fishLabelToast.expiresAt) {
      drawStringBg(fishLabelToast.col, fishLabelToast.row, fishLabelToast.text, fishLabelToast.color, uiBg);
    } else {
      fishLabelToast = null;
    }

    // 8. Last discovery: sprite preview + name
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
