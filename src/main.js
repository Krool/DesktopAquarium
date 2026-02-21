// ASCII Reef - Overlay bootstrap + Tauri event listeners

import { initCanvas, startRenderLoop, drawChar, drawString, drawStringBg, drawBg, resizeCanvas, setDayNightCycle, getCharDimensions, COLS, ROWS } from "./renderer/canvas.js";
import { parseAllCreatures } from "./renderer/sprites.js";
import { ENV_COLORS, RARITY_COLORS, PROGRESS_COLORS } from "./renderer/colors.js";
import { consumeMessageBottle, forceSpawnMessageBottle, getMajorDecorationAtGrid, getMessageBottleAtGrid, renderEnvironment, reinitEnvironment, setMessageBottleReceiveEnabled, setMessageBottlesEnabled, setUnlockedAchievements } from "./simulation/environment.js";
import { renderDiscovery, triggerDiscoveryBurst, triggerAchievementToast } from "./simulation/discovery.js";
import { addGlobalBottleMessage, getRandomGlobalBottleMessage, hasAnyGlobalBottleMessages, initMessageBottles, trashGlobalBottleMessage } from "./simulation/messageBottles.js";
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
  getMyRank,
  setLeaderboardEnabled,
} from "./simulation/leaderboard.js";
import creaturesData from "./data/creatures.json";

const { listen } = window.__TAURI__.event;
const { invoke } = window.__TAURI__.core;
const { getCurrentWindow } = window.__TAURI__.window;

const appWindow = getCurrentWindow();

// Must match SIZE_PRESETS in src-tauri/src/tray.rs
const SIZE_PRESETS = [
  [40, 16], // Small
  [60, 16], // Medium
  [60, 24], // Medium Tall
  [80, 16], // Large
  [80, 24], // Large Tall
  [100, 16], // Wide
  [100, 24], // Wide Tall
  [120, 24], // Extra Wide
];

let allSprites = {};
let lastTimestamp = 0;
let isFirstRun = false;
let tutorialVisible = true;
let energyDisplay = { typing: 0, click: 0, audio: 0, threshold: 40 };
let lastDiscovery = null;
let currentAchievements = new Set();
let sendScoresEnabled = true;
let soundEnabled = false;
let musicVolume = 0.08;
let sizeIndex = 1;
let dayNightCycle = "computer";
let lastCollection = {};
let closeBehavior = "ask";
let messageBottlesEnabled = false;
let messageBottlesPrompted = false;
let messageBottleBusy = false;
let helpBtnEl = null;
let stateAppliedOnce = false;

function syncMessageBottleSpawnState() {
  setMessageBottlesEnabled(messageBottlesEnabled || !messageBottlesPrompted);
}

async function refreshMessageBottleReceiveState() {
  if (!messageBottlesEnabled) {
    setMessageBottleReceiveEnabled(false);
    return;
  }
  if (!initMessageBottles()) {
    setMessageBottleReceiveEnabled(false);
    return;
  }
  try {
    const hasAny = await hasAnyGlobalBottleMessages();
    setMessageBottleReceiveEnabled(hasAny);
  } catch {
    setMessageBottleReceiveEnabled(false);
  }
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName?.toLowerCase?.();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return !!target.isContentEditable;
}

let fishLabelToast = null;
let hoverLabelToast = null;

const CLICK_DRAG_THRESHOLD = 6;
const CLICK_MAX_DURATION_MS = 250;
const LABEL_DURATION_MS = 1800;

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
  const color = RARITY_COLORS[creature.rarity] || ENV_COLORS.ui;
  showWorldLabel(creature.sprite.name, creature.col, creature.row - 1, color);
}

function showWorldLabel(text, col, row, color = ENV_COLORS.ui) {
  fishLabelToast = {
    text,
    color,
    row: clamp(row, 1, ROWS - 3),
    col: clamp(col, 1, Math.max(1, COLS - text.length - 1)),
    expiresAt: performance.now() + LABEL_DURATION_MS,
  };
}

function getUiHoverHintAtGrid(col, row) {
  if (isCollectionProgressCell(col, row)) return "Collection Progress";

  if (getMessageBottleAtGrid(col, row)) return "Message Bottle";

  if (row === 0) {
    const barWidth = COLS <= 45 ? 4 : COLS <= 65 ? 6 : 8;
    const barGap = COLS <= 45 ? 1 : 2;
    const bars = [
      { name: "Typing Energy" },
      { name: "Click Energy" },
      { name: "Audio Energy" },
    ];
    const barLen = barWidth + 3;
    let nextCol = 1;
    for (const bar of bars) {
      if (nextCol + barLen > COLS - 1) break;
      if (col >= nextCol && col < nextCol + barLen) return bar.name;
      nextCol += barLen + barGap;
    }
  }

  return null;
}

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

function drawCallout(text, textCol, textRow, arrowCol, arrowRow, arrowChar, color, bg) {
  if (text) {
    drawStringBg(textCol, textRow, text, color, bg);
  }
  if (typeof arrowCol === "number" && typeof arrowRow === "number" && arrowChar) {
    drawChar(arrowCol, arrowRow, arrowChar, color);
  }
}

function getMessageBottleOverlay() {
  return document.getElementById("message-bottle-overlay");
}

function closeMessageBottleModal() {
  const overlay = getMessageBottleOverlay();
  if (!overlay) return;
  overlay.classList.add("hidden");
  overlay.innerHTML = "";
}

function showMessageBottleModal(contentHtml, bindHandlers) {
  const overlay = getMessageBottleOverlay();
  if (!overlay) return;
  overlay.innerHTML = `<div class="paper-modal">${contentHtml}</div>`;
  overlay.classList.remove("hidden");
  bindHandlers?.(overlay);
}

async function ensureMessageBottleOptIn() {
  if (messageBottlesPrompted) return messageBottlesEnabled;
  const accepted = window.confirm(
    "Enable Messages in a Bottle?\n\nYou may occasionally read or send a global message shared through Firebase."
  );
  messageBottlesPrompted = true;
  messageBottlesEnabled = accepted;
  syncMessageBottleSpawnState();
  await refreshMessageBottleReceiveState();
  try {
    await invoke("set_message_bottles_preferences", {
      enabled: accepted,
      prompted: true,
    });
  } catch {
    // Fallback
  }
  return accepted;
}

function showInfoMessageBottleModal(title, text) {
  showMessageBottleModal(
    `
      <h2>${title}</h2>
      <div class="paper-message-text">${text}</div>
      <div class="paper-actions">
        <button id="bottle-info-ok" type="button">OK</button>
      </div>
    `,
    (overlay) => {
      overlay.querySelector("#bottle-info-ok")?.addEventListener("click", () => {
        closeMessageBottleModal();
      });
    }
  );
}

async function handleComposeBottle() {
  showMessageBottleModal(
    `
      <h2>Write A Message</h2>
      <textarea id="bottle-compose-input" maxlength="280" placeholder="Type a short note to send along..."></textarea>
      <div class="paper-actions">
        <button id="bottle-compose-cancel" type="button">Cancel</button>
        <button id="bottle-compose-send" type="button">Send Along</button>
      </div>
    `,
    (overlay) => {
      overlay.querySelector("#bottle-compose-cancel")?.addEventListener("click", () => {
        closeMessageBottleModal();
      });
      overlay.querySelector("#bottle-compose-send")?.addEventListener("click", async () => {
        const input = overlay.querySelector("#bottle-compose-input");
        const message = (input?.value || "").trim();
        if (!message) return;
        try {
          await addGlobalBottleMessage(message);
          setMessageBottleReceiveEnabled(true);
          closeMessageBottleModal();
        } catch (err) {
          const detail = err?.code || err?.message || "unknown_error";
          showInfoMessageBottleModal("Unable To Send", `Firebase error: ${detail}`);
        }
      });
    }
  );
}

async function handleReceiveBottle() {
  let received = null;
  try {
    received = await getRandomGlobalBottleMessage();
  } catch {
    received = null;
  }
  if (!received) {
    setMessageBottleReceiveEnabled(false);
    showInfoMessageBottleModal("Empty Bottle", "No shared messages found right now.");
    return;
  }

  const escaped = received.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  showMessageBottleModal(
    `
      <h2>Message Received</h2>
      <div class="paper-message-text">${escaped}</div>
      <div class="paper-actions">
        <button id="bottle-send-along" type="button">Send Along</button>
        <button id="bottle-trash" class="danger" type="button">Trash Message</button>
      </div>
    `,
    (overlay) => {
      overlay.querySelector("#bottle-send-along")?.addEventListener("click", async () => {
        // Re-insert with a fresh timestamp so it recirculates to other players,
        // then remove the original to avoid duplicates accumulating.
        try {
          await addGlobalBottleMessage(received.text);
          await trashGlobalBottleMessage(received.id);
        } catch {
          // If re-add fails the original remains in the db — still fine.
        }
        closeMessageBottleModal();
      });
      overlay.querySelector("#bottle-trash")?.addEventListener("click", async () => {
        try {
          await trashGlobalBottleMessage(received.id);
        } catch {
          // ignore delete errors
        }
        await refreshMessageBottleReceiveState();
        closeMessageBottleModal();
      });
    }
  );
}

async function handleMessageBottleClick(gridCol, gridRow) {
  if (messageBottleBusy) return false;
  const hit = getMessageBottleAtGrid(gridCol, gridRow);
  if (!hit) return false;
  const consumed = consumeMessageBottle(hit.id);
  if (!consumed) return true;

  messageBottleBusy = true;
  try {
    const allowed = await ensureMessageBottleOptIn();
    if (!allowed) return true;
    if (!initMessageBottles()) {
      showInfoMessageBottleModal("Feature Offline", "Firebase is unavailable right now.");
      return true;
    }
    if (consumed.mode === "compose") {
      await handleComposeBottle();
      return true;
    }
    await handleReceiveBottle();
    return true;
  } finally {
    messageBottleBusy = false;
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

function setFirstRunState(collection) {
  const empty = Object.keys(collection || {}).length === 0;
  isFirstRun = empty;
  tutorialVisible = empty;
  updateHelpButtonState();
}

function updateHelpButtonState() {
  if (!helpBtnEl) return;
  if (tutorialVisible) {
    helpBtnEl.classList.add("active");
  } else {
    helpBtnEl.classList.remove("active");
  }
}

async function init() {
  // Parse creature sprites
  allSprites = parseAllCreatures(creaturesData);

  // Initialize canvas
  const canvas = document.getElementById("tank");
  initCanvas(canvas);

  initAudio();

  function applyState(state, { initial }) {
    const collection = state.collection || {};
    lastCollection = collection;
    setFirstRunState(collection);

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
    if (typeof state.closeBehavior === "string") {
      closeBehavior = state.closeBehavior;
    }
    if (typeof state.sizeIndex === "number") {
      sizeIndex = state.sizeIndex;
      const preset = SIZE_PRESETS[sizeIndex];
      if (preset) {
        resizeCanvas(preset[0], preset[1]);
        reinitEnvironment();
      }
    }
    if (typeof state.dayNightCycle === "string") {
      dayNightCycle = state.dayNightCycle;
      setDayNightCycle(dayNightCycle);
    }
    if (typeof state.messageBottlesEnabled === "boolean") {
      messageBottlesEnabled = state.messageBottlesEnabled;
    }
    if (typeof state.messageBottlesPrompted === "boolean") {
      messageBottlesPrompted = state.messageBottlesPrompted;
    }
    syncMessageBottleSpawnState();
    refreshMessageBottleReceiveState();

    if (sendScoresEnabled) {
      initLeaderboard();
    }
    applySoundSettings();

    if (initial) {
      initTank(allSprites, collection);
    } else {
      updateCollection(collection);
      clearCreatures();
    }

    if (state.poolEnergy) {
      energyDisplay.typing = state.poolEnergy.typing || 0;
      energyDisplay.click = state.poolEnergy.click || 0;
      energyDisplay.audio = state.poolEnergy.audio || 0;
    }

    updateAchievements(collection, false);

    if (sendScoresEnabled && Object.keys(collection).length > 0) {
      const score = calculateScore();
      const unique = getUniqueCount();
      submitScore(score, unique);
    }

    stateAppliedOnce = true;
  }

  async function fetchStateWithRetry(attemptsLeft) {
    try {
      const state = await invoke("get_state");
      applyState(state, { initial: !stateAppliedOnce });
      return true;
    } catch {
      if (attemptsLeft <= 0) return false;
      setTimeout(() => {
        fetchStateWithRetry(attemptsLeft - 1);
      }, 500);
      return false;
    }
  }

  // Request initial state from Rust backend
  const gotState = await fetchStateWithRetry(3);
  if (!gotState) {
    // Keep existing state without forcing first-run if backend is slow.
    initTank(allSprites, lastCollection || {});
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

    tutorialVisible = false;
    updateHelpButtonState();
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
    setFirstRunState(col);

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

  listen("day-night-cycle", (event) => {
    if (typeof event.payload.cycle === "string") {
      dayNightCycle = event.payload.cycle;
      setDayNightCycle(dayNightCycle);
    }
  });

  listen("close-behavior", (event) => {
    if (typeof event.payload.behavior === "string") {
      closeBehavior = event.payload.behavior;
    }
  });

  listen("message-bottles-settings", (event) => {
    if (typeof event.payload.enabled === "boolean") {
      messageBottlesEnabled = event.payload.enabled;
    }
    if (event.payload.prompted === true) {
      messageBottlesPrompted = true;
    }
    syncMessageBottleSpawnState();
    refreshMessageBottleReceiveState();
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
    setFirstRunState(col);
  });

  async function performCloseAction(behavior) {
    if (behavior === "close") {
      try {
        await invoke("quit_app");
      } catch {
        try {
          appWindow.close();
        } catch {
          // Fallback
        }
      }
      return;
    }
    try {
      await invoke("hide_window");
    } catch {
      // Fallback
    }
  }

  async function promptCloseBehavior() {
    const message = "When you press the X, should ASCII Reef close completely or hide and keep earning progress?";
    try {
      const dialog = window.__TAURI__?.dialog;
      if (dialog?.confirm) {
        const shouldClose = await dialog.confirm(message, {
          title: "Close Behavior",
          okLabel: "Close App",
          cancelLabel: "Hide & Keep Progress",
        });
        return shouldClose ? "close" : "hide";
      }
    } catch {
      // Fall back to browser confirm
    }

    const shouldClose = window.confirm(`${message}\n\nOK = Close App\nCancel = Hide & Keep Progress`);
    return shouldClose ? "close" : "hide";
  }

  // Close button hides window to tray or closes based on preference
  document.getElementById("close-btn").addEventListener("click", async (e) => {
    e.stopPropagation();
    if (closeBehavior === "ask") {
      const choice = await promptCloseBehavior();
      closeBehavior = choice;
      try {
        await invoke("set_close_behavior", { behavior: choice });
      } catch {
        // Fallback
      }
      await performCloseAction(choice);
      return;
    }

    await performCloseAction(closeBehavior);
  });

  const dragOverlay = document.getElementById("drag-overlay");
  let pointerState = null;
  let hoverGridPos = null;

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
    hoverGridPos = getGridPositionFromPointer(event);
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
        handleMessageBottleClick(col, row).then((handled) => {
          if (handled) return;
          const creature = getCreatureAtGrid(col, row);
          if (creature) {
            showFishLabel(creature);
            return;
          }
          const decoration = getMajorDecorationAtGrid(col, row);
          if (decoration) {
            showWorldLabel(decoration.name, decoration.col, decoration.row, ENV_COLORS.ui);
          }
        });
      }
    }

    pointerState = null;
  });

  dragOverlay.addEventListener("mouseleave", () => {
    hoverGridPos = null;
    hoverLabelToast = null;
    if (pointerState && !pointerState.didDrag) {
      pointerState = null;
    }
  });

  const bottleOverlay = getMessageBottleOverlay();
  if (bottleOverlay) {
    bottleOverlay.addEventListener("click", (event) => {
      if (event.target === bottleOverlay) {
        closeMessageBottleModal();
      }
    });
  }

  // Hidden debug hotkey: apostrophe spawns a bottle immediately.
  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (isTypingTarget(event.target)) return;
    if (event.key !== "'") return;
    forceSpawnMessageBottle();
  });

  // Optional collection button (top-right)
  const collectionBtn = document.getElementById("collection-btn");
  if (collectionBtn) {
    let collectionOpening = false;
    collectionBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (collectionOpening) return;

      collectionOpening = true;
      try {
        await invoke("open_collection");
      } catch {
        // Fallback
      } finally {
        collectionOpening = false;
      }
    });
  }

  // Optional settings button (top-right)
  const settingsBtn = document.getElementById("settings-btn");
  if (settingsBtn) {
    let settingsOpening = false;
    settingsBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (settingsOpening) return;

      settingsOpening = true;
      try {
        await invoke("open_settings");
      } catch {
        // Fallback
      } finally {
        settingsOpening = false;
      }
    });
  }

  // Optional help button (top-right)
  helpBtnEl = document.getElementById("help-btn");
  if (helpBtnEl) {
    helpBtnEl.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      tutorialVisible = !tutorialVisible;
      updateHelpButtonState();
    });
    updateHelpButtonState();
  }

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

    const uiBg = "rgba(0, 0, 0, 0.5)";

    const topRightReserved = 34; // leave room for [Collection] + [Settings] + [?] + [X]

    // 5. First-run welcome + callouts
    if (tutorialVisible) {
      const maxWidth = Math.min(COLS - 4, 80);
      const calloutColor = "rgba(220, 235, 255, 0.6)";

      // Small layouts: compact tutorial only
      if (COLS < 50 || ROWS < 12) {
        const compact = [
          "ASCII Reef",
          "Type, click, or audio = fish",
        ];
        const wrapped = compact.flatMap((line) => wrapText(line, Math.max(10, maxWidth)));
        const startRow = Math.max(1, Math.floor(ROWS / 2) - Math.floor(wrapped.length / 2));
        drawCenteredTextBlock(wrapped, startRow, ENV_COLORS.ui, uiBg);
      } else {
        const introLines = [
          "Welcome to ASCII Reef.",
          "You unlock fish by typing, clicking, or playing audio.",
          "Nothing personal is stored. Scores are anonymous.",
        ];
        const wrapped = introLines.flatMap((line) => wrapText(line, maxWidth));
        const startRow = Math.max(2, Math.floor(ROWS / 2) - Math.floor(wrapped.length / 2) - 1);
        const introEnd = startRow + wrapped.length - 1;
        drawCenteredTextBlock(wrapped, startRow, ENV_COLORS.ui, uiBg);

        const isRowFree = (row) => row > 0 && (row < startRow || row > introEnd);
        const allowAllCallouts = COLS >= 60 && ROWS >= 16;
        const allowTopCallouts = COLS >= 60 && ROWS >= 14;
        const useCompactCallouts = COLS < 70 || ROWS < 18;

        // Energy bars (top-left)
        if (allowTopCallouts && isRowFree(2) && isRowFree(3)) {
          const energyLine1 = "T typing, C clicks, A audio";
          const energyLine2 = useCompactCallouts
            ? "Fill bars to unlock fish"
            : "Fill the bars to unlock fish faster";
          const energyArrowCol = Math.min(COLS - 2, energyLine1.length + 1);
          drawCallout(energyLine1, 1, 2, energyArrowCol, 1, "^", calloutColor, uiBg);
          drawCallout(energyLine2, 1, 3, null, null, null, calloutColor, uiBg);
        }

        // Collection/Settings buttons (top-right)
        if (allowTopCallouts && isRowFree(2) && isRowFree(3)) {
          const menuLine1 = useCompactCallouts
            ? "Collection: species + counts"
            : "Collection: every species, rarity, and counts";
          const menuLine2 = useCompactCallouts
            ? "Settings: audio, size, scores"
            : "Settings: audio, size, score sharing";
          const menuCol = Math.max(1, COLS - menuLine1.length - 1);
          const menuArrowCol = Math.max(1, COLS - Math.max(6, topRightReserved - 2));
          drawCallout(menuLine1, menuCol, 2, menuArrowCol, 1, "^", calloutColor, uiBg);
          drawCallout(menuLine2, Math.max(1, COLS - menuLine2.length - 1), 3, null, null, null, calloutColor, uiBg);
        }

        // Close button (top-right)
        if (allowAllCallouts && isRowFree(6)) {
          const closeText = useCompactCallouts
            ? "Close: hide or quit"
            : "Close: hide or quit (you choose on first click)";
          const closeCol = Math.max(1, COLS - closeText.length - 1);
          drawCallout(closeText, closeCol, 6, COLS - 2, 1, "^", calloutColor, uiBg);
        }

        // Score (bottom-left on rock line)
        const scoreRow = ROWS - 3;
        if (allowAllCallouts && isRowFree(scoreRow)) {
          const scoreLine1 = useCompactCallouts
            ? "Score: value + rank"
            : "Score: total fish value + global rank";
          const scoreLine2 = useCompactCallouts
            ? "Toggle scores in Settings"
            : "Disable scores in Settings anytime";
          drawCallout(scoreLine1, 1, scoreRow, 6, ROWS - 2, "^", calloutColor, uiBg);
          if (isRowFree(scoreRow - 1)) {
            drawCallout(scoreLine2, 1, scoreRow - 1, null, null, null, calloutColor, uiBg);
          }
        }

        // Collection progress (bottom-right on rock line)
        const progressRow = ROWS - 3;
        if (allowAllCallouts && isRowFree(progressRow)) {
          const progressText = useCompactCallouts
            ? "Progress: owned/total"
            : "Collection progress: owned/total";
          const progressCol = Math.max(1, COLS - progressText.length - 1);
          drawCallout(progressText, progressCol, progressRow, COLS - 4, ROWS - 2, "^", calloutColor, uiBg);
        }

        // Click fish hint (center)
        if (allowAllCallouts) {
          const clickText = "Click a fish for its name";
          const clickRow = Math.min(ROWS - 5, introEnd + 2);
          if (isRowFree(clickRow)) {
            drawCallout(
              clickText,
              Math.max(1, Math.floor((COLS - clickText.length) / 2)),
              clickRow,
              Math.floor(COLS / 2),
              Math.min(ROWS - 4, clickRow + 1),
              "v",
              calloutColor,
              uiBg
            );
          }
        }
      }
    }

    // 6. Three energy bars (top-left, scaled down on smaller aquariums)
    const barWidth = COLS <= 45 ? 4 : COLS <= 65 ? 6 : 8;
    const barGap = COLS <= 45 ? 1 : 2;
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
      nextCol += barLen + barGap;
    }

    // 7. Fish label toast on quick click
    if (fishLabelToast && timestamp <= fishLabelToast.expiresAt) {
      drawStringBg(fishLabelToast.col, fishLabelToast.row, fishLabelToast.text, fishLabelToast.color, uiBg);
    } else {
      fishLabelToast = null;
    }

    // 8. Hover hint for UI regions
    if (hoverGridPos && !pointerState) {
      const hoverText = getUiHoverHintAtGrid(hoverGridPos.col, hoverGridPos.row);
      if (hoverText) {
        hoverLabelToast = {
          text: hoverText,
          color: ENV_COLORS.ui,
          row: clamp(hoverGridPos.row - 1, 1, ROWS - 3),
          col: clamp(hoverGridPos.col, 1, Math.max(1, COLS - hoverText.length - 1)),
          expiresAt: timestamp + 120,
        };
      } else {
        hoverLabelToast = null;
      }
    }
    if (hoverLabelToast && timestamp <= hoverLabelToast.expiresAt && !fishLabelToast) {
      drawStringBg(hoverLabelToast.col, hoverLabelToast.row, hoverLabelToast.text, hoverLabelToast.color, uiBg);
    } else if (hoverLabelToast && timestamp > hoverLabelToast.expiresAt) {
      hoverLabelToast = null;
    }

    // 9. Last discovery: sprite preview + name
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
