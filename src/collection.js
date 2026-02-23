// Collection window — Fish tab and Achievements tab with per-item hide toggle.

import { RARITY_COLORS, SCORE_VALUES } from "./renderer/colors.js";
import creaturesData from "./data/creatures.json";
import { computeUnlocked, getAchievements } from "./simulation/achievements.js";

const { invoke } = window.__TAURI__.core;
const { getCurrentWindow } = window.__TAURI__.window;

const RARITY_ORDER = ["legendary", "epic", "rare", "uncommon", "common"];

const LS_TAB         = "ascii-reef-coll-tab";
const LS_HIDDEN_FISH = "ascii-reef-coll-hidden-fish";
const LS_HIDDEN_ACH  = "ascii-reef-coll-hidden-ach";

function loadHiddenSet(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); }
  catch (e) { console.error("Failed to load hidden set:", key, e); return new Set(); }
}

function saveHiddenSet(key, set) {
  try { localStorage.setItem(key, JSON.stringify([...set])); }
  catch (e) { console.error("Failed to save hidden set:", key, e); }
}

/** Render sprite: replace ! with spaces, then HTML-escape. */
function spriteHtml(frames) {
  return escapeHtml(frames[0].map(line => line.replace(/!/g, " ")).join("\n"));
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function init() {
  const closeBtn = document.getElementById("collection-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      try { getCurrentWindow().close(); }
      catch (e) { console.error("collection close failed:", e); }
    });
  }

  let collection = {}, sendScoresEnabled = true, soundEnabled = false, sizeIndex = null;
  try {
    const state = await invoke("get_state");
    collection = state.collection || {};
    if (typeof state.sendScores === "boolean")  sendScoresEnabled = state.sendScores;
    if (typeof state.soundEnabled === "boolean") soundEnabled = state.soundEnabled;
    if (typeof state.sizeIndex === "number")    sizeIndex = state.sizeIndex;
  } catch (e) {
    console.error("Failed to load state for collection:", e);
  }

  // Score + unique count
  let score = 0, uniqueCount = 0;
  for (const [id, data] of Object.entries(collection)) {
    const creature = creaturesData.find(c => c.id === id);
    if (creature) { score += (SCORE_VALUES[creature.rarity] || 0) * data.count; uniqueCount++; }
  }

  // Achievements
  const storedRank = localStorage.getItem("ascii-reef-rank");
  const leaderboardRank = sendScoresEnabled && storedRank ? parseInt(storedRank, 10) : null;
  const unlocked = computeUnlocked(collection, creaturesData, leaderboardRank, {
    sizeIndex, soundEnabled, sendScoresEnabled,
  });
  const allAchievements = getAchievements().filter(a => sendScoresEnabled || a.id !== "top_10");

  // Persistent hidden sets
  const hiddenFish = loadHiddenSet(LS_HIDDEN_FISH);
  const hiddenAch  = loadHiddenSet(LS_HIDDEN_ACH);
  let showHidden = false;
  let currentTab = localStorage.getItem(LS_TAB) || "fish";

  // Sort: owned first, then by rarity, then by count
  const sorted = [...creaturesData].sort((a, b) => {
    const aOwned = collection[a.id] ? 1 : 0;
    const bOwned = collection[b.id] ? 1 : 0;
    if (aOwned !== bOwned) return bOwned - aOwned;
    const rd = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
    if (rd !== 0) return rd;
    return (collection[b.id]?.count || 0) - (collection[a.id]?.count || 0);
  });

  // ── Build skeleton ──────────────────────────────────────────────────────────
  const root = document.getElementById("collection-root");
  root.innerHTML = `
    <div class="coll-header">
      <h1>ASCII Reef Collection</h1>
      <div class="coll-stats">
        <span>Score: ${score.toLocaleString()}</span>
        <span>${uniqueCount} / 105 discovered</span>
        <span>${unlocked.size} / ${allAchievements.length} achievements</span>
      </div>
    </div>
    <div class="coll-tab-bar" id="coll-tab-bar">
      <button class="coll-tab${currentTab === "fish" ? " active" : ""}" data-tab="fish">
        Fish (${uniqueCount}/105)
      </button>
      <button class="coll-tab${currentTab === "achievements" ? " active" : ""}" data-tab="achievements">
        Achievements (${unlocked.size}/${allAchievements.length})
      </button>
      <span class="coll-hidden-toggle" id="coll-hidden-toggle"></span>
    </div>
    <div class="coll-tab-panel${currentTab === "fish"         ? "" : " coll-tab-panel--hidden"}" id="tab-fish"></div>
    <div class="coll-tab-panel${currentTab === "achievements" ? "" : " coll-tab-panel--hidden"}" id="tab-achievements"></div>
  `;

  const fishPanel    = document.getElementById("tab-fish");
  const achPanel     = document.getElementById("tab-achievements");
  const hiddenToggle = document.getElementById("coll-hidden-toggle");
  const tabBar       = document.getElementById("coll-tab-bar");

  // ── Hidden-count toggle label ───────────────────────────────────────────────
  function updateHiddenToggle() {
    const set = currentTab === "achievements" ? hiddenAch : hiddenFish;
    if (set.size === 0) {
      hiddenToggle.textContent = "";
      hiddenToggle.style.cursor = "default";
    } else {
      hiddenToggle.textContent = showHidden ? `hide ${set.size}` : `${set.size} hidden`;
      hiddenToggle.style.cursor = "pointer";
    }
  }

  // ── Fish tab ────────────────────────────────────────────────────────────────
  function renderFish() {
    fishPanel.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "coll-creature-grid";

    for (const creature of sorted) {
      const owned    = collection[creature.id];
      const isHidden = hiddenFish.has(creature.id);

      if (!owned) {
        const card = document.createElement("div");
        card.className = "coll-card coll-card--unknown";
        card.innerHTML = `<div class="coll-unknown-label">???</div>`;
        grid.appendChild(card);
        continue;
      }

      if (isHidden && !showHidden) continue;

      const color = RARITY_COLORS[creature.rarity];
      const card  = document.createElement("div");
      card.className = "coll-card coll-card--found" + (isHidden ? " coll-card--dim" : "");
      card.innerHTML = `
        <button class="coll-toggle-btn" title="${isHidden ? "Show" : "Hide"}">${isHidden ? "+" : "×"}</button>
        <pre class="coll-sprite" style="color:${color}">${spriteHtml(creature.frames)}</pre>
        <div class="coll-card-name" style="color:${color}">${escapeHtml(creature.name)}</div>
        <div class="coll-card-meta">${creature.rarity} · x${owned.count}</div>
      `;

      card.querySelector(".coll-toggle-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        if (isHidden) hiddenFish.delete(creature.id);
        else          hiddenFish.add(creature.id);
        saveHiddenSet(LS_HIDDEN_FISH, hiddenFish);
        renderFish();
        updateHiddenToggle();
      });

      grid.appendChild(card);
    }

    fishPanel.appendChild(grid);
  }

  // ── Achievements tab ────────────────────────────────────────────────────────
  function renderAchievements() {
    achPanel.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "coll-ach-grid";

    for (const ach of allAchievements) {
      const isUnlocked = unlocked.has(ach.id);
      const isHidden   = isUnlocked && hiddenAch.has(ach.id);

      if (isHidden && !showHidden) continue;

      const card = document.createElement("div");
      card.className = "coll-card coll-ach-card"
        + (!isUnlocked ? " coll-card--locked" : "")
        + (isHidden    ? " coll-card--dim"    : "");

      if (isUnlocked) {
        card.innerHTML = `
          <button class="coll-toggle-btn" title="${isHidden ? "Show" : "Hide"}">${isHidden ? "+" : "×"}</button>
          <div class="coll-ach-icon">★</div>
          <div class="coll-ach-name">${escapeHtml(ach.name)}</div>
          <div class="coll-ach-desc">${escapeHtml(ach.description)}</div>
          <div class="coll-ach-unlock">${escapeHtml(ach.unlock)}</div>
        `;
        card.querySelector(".coll-toggle-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          if (isHidden) hiddenAch.delete(ach.id);
          else          hiddenAch.add(ach.id);
          saveHiddenSet(LS_HIDDEN_ACH, hiddenAch);
          renderAchievements();
          updateHiddenToggle();
        });
      } else {
        card.innerHTML = `
          <div class="coll-ach-icon">?</div>
          <div class="coll-ach-name">???</div>
          <div class="coll-ach-desc">${escapeHtml(ach.description)}</div>
        `;
      }

      grid.appendChild(card);
    }

    achPanel.appendChild(grid);
  }

  // ── Tab switching ───────────────────────────────────────────────────────────
  tabBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".coll-tab");
    if (!btn || btn.dataset.tab === currentTab) return;
    currentTab = btn.dataset.tab;
    localStorage.setItem(LS_TAB, currentTab);
    tabBar.querySelectorAll(".coll-tab").forEach(b => b.classList.toggle("active", b === btn));
    fishPanel.classList.toggle("coll-tab-panel--hidden", currentTab !== "fish");
    achPanel.classList.toggle("coll-tab-panel--hidden",  currentTab !== "achievements");
    showHidden = false;
    // Re-render the now-active panel so its visual state matches showHidden=false.
    if (currentTab === "fish") renderFish();
    else renderAchievements();
    updateHiddenToggle();
  });

  // ── Show/hide hidden items toggle ───────────────────────────────────────────
  hiddenToggle.addEventListener("click", () => {
    const set = currentTab === "achievements" ? hiddenAch : hiddenFish;
    if (set.size === 0) return;
    showHidden = !showHidden;
    if (currentTab === "fish") renderFish();
    else renderAchievements();
    updateHiddenToggle();
  });

  // ── Initial render ──────────────────────────────────────────────────────────
  renderFish();
  renderAchievements();
  updateHiddenToggle();
}

init();
