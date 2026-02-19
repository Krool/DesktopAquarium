// Collection window bootstrap

import { RARITY_COLORS, SCORE_VALUES } from "./renderer/colors.js";
import creaturesData from "./data/creatures.json";
import { computeUnlocked, getAchievements } from "./simulation/achievements.js";

const { invoke } = window.__TAURI__.core;
const { getCurrentWindow } = window.__TAURI__.window;

const RARITY_ORDER = ["legendary", "epic", "rare", "uncommon", "common"];

async function init() {
  const root = document.getElementById("collection-root");
  const closeBtn = document.getElementById("collection-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      try {
        getCurrentWindow().close();
      } catch {
        // Fallback
      }
    });
  }

  let collection = {};
  let totalDiscoveries = 0;
  let sendScoresEnabled = true;
  let soundEnabled = false;
  let sizeIndex = 2;

  try {
    const state = await invoke("get_state");
    collection = state.collection || {};
    totalDiscoveries = state.totalDiscoveries || 0;
    if (typeof state.sendScores === "boolean") {
      sendScoresEnabled = state.sendScores;
    }
    if (typeof state.soundEnabled === "boolean") {
      soundEnabled = state.soundEnabled;
    }
    if (typeof state.sizeIndex === "number") {
      sizeIndex = state.sizeIndex;
    }
  } catch {
    // Backend not available
  }

  // Calculate score
  let score = 0;
  let uniqueCount = 0;
  for (const [id, data] of Object.entries(collection)) {
    const creature = creaturesData.find((c) => c.id === id);
    if (creature) {
      score += (SCORE_VALUES[creature.rarity] || 0) * data.count;
      uniqueCount++;
    }
  }

  // Header
  const header = document.createElement("div");
  header.className = "collection-header";
  header.innerHTML = `
    <h1>ASCII Reef Collection</h1>
    <div class="score">Score: ${score.toLocaleString()}</div>
    <div class="progress">${uniqueCount}/105 Creatures Discovered</div>
  `;
  root.appendChild(header);

  // Achievements section
  const storedRank = localStorage.getItem("ascii-reef-rank");
  const leaderboardRank = sendScoresEnabled && storedRank ? parseInt(storedRank, 10) : null;
  const unlocked = computeUnlocked(collection, creaturesData, leaderboardRank, {
    sizeIndex,
    soundEnabled,
    sendScoresEnabled,
  });
  const allAchievements = getAchievements().filter((a) => {
    return sendScoresEnabled || a.id !== "top_10";
  });
  const unlockedCount = unlocked.size;

  const achSection = document.createElement("div");
  achSection.className = "achievements-section";
  achSection.innerHTML = `<h2>Achievements (${unlockedCount}/${allAchievements.length})</h2>`;

  const achGrid = document.createElement("div");
  achGrid.className = "achievement-grid";

  for (const ach of allAchievements) {
    const isUnlocked = unlocked.has(ach.id);
    const card = document.createElement("div");
    card.className = "achievement-card" + (isUnlocked ? " unlocked" : " locked");

    if (isUnlocked) {
      card.innerHTML = `
        <div class="ach-icon">*</div>
        <div class="ach-name">${escapeHtml(ach.name)}</div>
        <div class="ach-desc">${escapeHtml(ach.description)}</div>
        <div class="ach-unlock">${escapeHtml(ach.unlock)}</div>
      `;
    } else {
      card.innerHTML = `
        <div class="ach-icon">?</div>
        <div class="ach-name">???</div>
        <div class="ach-desc">${escapeHtml(ach.description)}</div>
      `;
    }

    achGrid.appendChild(card);
  }

  achSection.appendChild(achGrid);
  root.appendChild(achSection);

  // Single sorted list: owned first, then by rarity, then by count
  const sorted = [...creaturesData].sort((a, b) => {
    const aOwned = collection[a.id] ? 1 : 0;
    const bOwned = collection[b.id] ? 1 : 0;
    if (aOwned !== bOwned) return bOwned - aOwned;
    const rarityDiff = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
    if (rarityDiff !== 0) return rarityDiff;
    const aCount = collection[a.id]?.count || 0;
    const bCount = collection[b.id]?.count || 0;
    return bCount - aCount;
  });

  const grid = document.createElement("div");
  grid.className = "creature-grid";

  for (const creature of sorted) {
    const card = document.createElement("div");
    const owned = collection[creature.id];
    card.className = "creature-card" + (owned ? "" : " unknown");

    if (owned) {
      const color = RARITY_COLORS[creature.rarity];
      const spriteText = creature.frames[0].join("\n");
      card.innerHTML = `
        <div class="sprite" style="color: ${color}">${escapeHtml(spriteText)}</div>
        <div class="name" style="color: ${color}">${escapeHtml(creature.name)}</div>
        <div class="count">x${owned.count}</div>
      `;
    } else {
      card.innerHTML = `<div class="name">???</div>`;
    }

    grid.appendChild(card);
  }

  root.appendChild(grid);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

init();
