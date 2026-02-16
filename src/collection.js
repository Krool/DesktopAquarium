// Collection window bootstrap

import { RARITY_COLORS, SCORE_VALUES } from "./renderer/colors.js";
import creaturesData from "./data/creatures.json";

const { invoke } = window.__TAURI__.core;

const POOLS = ["typing", "click", "audio"];
const POOL_NAMES = { typing: "Typing Pool", click: "Click Pool", audio: "Audio Pool" };
const RARITY_ORDER = ["legendary", "epic", "rare", "uncommon", "common"];

async function init() {
  const root = document.getElementById("collection-root");

  let collection = {};
  let totalDiscoveries = 0;

  try {
    const state = await invoke("get_state");
    collection = state.collection || {};
    totalDiscoveries = state.totalDiscoveries || 0;
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
    <div class="progress">${uniqueCount}/75 Creatures Discovered</div>
  `;
  root.appendChild(header);

  // Pool sections
  for (const pool of POOLS) {
    const section = document.createElement("div");
    section.className = "pool-section";

    const title = document.createElement("h2");
    title.className = "pool-title";
    title.textContent = POOL_NAMES[pool];
    section.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "creature-grid";

    // Sort creatures by rarity within pool
    const poolCreatures = creaturesData
      .filter((c) => c.pool === pool)
      .sort(
        (a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity)
      );

    for (const creature of poolCreatures) {
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

    section.appendChild(grid);
    root.appendChild(section);
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

init();
