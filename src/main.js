// ASCII Reef - Overlay bootstrap + Tauri event listeners

import { initCanvas, startRenderLoop, drawString, COLS, ROWS } from "./renderer/canvas.js";
import { parseAllCreatures } from "./renderer/sprites.js";
import { ENV_COLORS } from "./renderer/colors.js";
import { renderEnvironment } from "./simulation/environment.js";
import { renderDiscovery, triggerDiscoveryBurst } from "./simulation/discovery.js";
import {
  initTank,
  updateTank,
  renderTank,
  updateCollection,
  spawnDiscoveryCreature,
  setCapBoost,
} from "./simulation/tank.js";
import creaturesData from "./data/creatures.json";

const { listen, emit } = window.__TAURI__.event;
const { invoke } = window.__TAURI__.core;

let allSprites = {};
let lastTimestamp = 0;
let isFirstRun = false;
let firstRunTextVisible = true;
let energyDisplay = { current: 0, threshold: 40 };

async function init() {
  // Parse creature sprites
  allSprites = parseAllCreatures(creaturesData);

  // Initialize canvas
  const canvas = document.getElementById("tank");
  const dims = initCanvas(canvas);

  // Request initial state from Rust backend
  try {
    const state = await invoke("get_state");
    const collection = state.collection || {};
    isFirstRun = Object.keys(collection).length === 0;
    initTank(allSprites, collection);
    energyDisplay.current = state.energy || 0;
  } catch {
    // Backend not ready yet or command not available
    isFirstRun = true;
    initTank(allSprites, {});
  }

  // Listen for drag mode toggle
  listen("drag-mode", (event) => {
    const enabled = event.payload;
    document.body.classList.toggle("drag-mode", enabled);
  });

  // Listen for energy updates
  listen("energy-update", (event) => {
    energyDisplay.current = event.payload.current;
    energyDisplay.threshold = event.payload.threshold;
  });

  // Listen for discovery events
  listen("discovery", async (event) => {
    const { creatureId, isNew } = event.payload;
    const sprite = allSprites[creatureId];
    if (!sprite) return;

    firstRunTextVisible = false;

    // Update collection from backend
    try {
      const state = await invoke("get_state");
      updateCollection(state.collection || {});
    } catch {
      // Fallback: local update
    }

    // Trigger visual effects
    triggerDiscoveryBurst(sprite.name, sprite.rarity, isNew);
    spawnDiscoveryCreature(sprite, performance.now());
    setCapBoost(performance.now());
  });

  // Close button handler
  document.getElementById("close-btn").addEventListener("click", async () => {
    try {
      await invoke("toggle_drag_mode");
    } catch {
      document.body.classList.remove("drag-mode");
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

    // 4. First-run welcome text
    if (isFirstRun && firstRunTextVisible) {
      const text = "~ waiting for signs of life ~";
      const col = Math.floor((COLS - text.length) / 2);
      const row = Math.floor(ROWS / 2);
      drawString(col, row, text, ENV_COLORS.ui);
    }

    // 5. Energy meter (small, top-left)
    const meterWidth = 10;
    const filled = Math.floor((energyDisplay.current / energyDisplay.threshold) * meterWidth);
    let meter = "[";
    for (let i = 0; i < meterWidth; i++) {
      meter += i < filled ? "|" : ".";
    }
    meter += "]";
    drawString(1, 0, meter, ENV_COLORS.ui);
  });
}

init();
