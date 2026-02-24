// Collection window — Fish tab and Achievements tab with per-item hide toggle.

import { RARITY_COLORS, SCORE_VALUES } from "./renderer/colors.js";
import creaturesData from "./data/creatures.json";
import { computeUnlocked, getAchievements } from "./simulation/achievements.js";

const { invoke } = window.__TAURI__.core;
const { getCurrentWindow } = window.__TAURI__.window;

const RARITY_ORDER = ["legendary", "epic", "rare", "uncommon", "common"];

const LS_TAB        = "ascii-reef-coll-tab";
const LS_HIDDEN_ACH = "ascii-reef-coll-hidden-ach";
const LS_FILTER_POOL = "ascii-reef-coll-filter-pool";
const LS_SORT_MODE   = "ascii-reef-coll-sort-mode";

const POOL_INFO = {
  typing: { label: "Typing", icon: "⌨", color: "#00B3FF" },
  click:  { label: "Clicks", icon: "◉", color: "#22C55E" },
  audio:  { label: "Audio",  icon: "♪", color: "#A855F7" },
};

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

const collColorMode = localStorage.getItem("ascii-reef-color-mode") || "rarity";

async function init() {
  let collection = {}, sendScoresEnabled = true, soundEnabled = false, sizeIndex = null;
  let hiddenFish = new Set();

  try {
    const state = await invoke("get_state");
    collection = state.collection || {};
    hiddenFish = new Set(state.hiddenCreatures || []);
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

  // Per-pool discovered counts
  const poolCounts = { typing: 0, click: 0, audio: 0 };
  for (const creature of creaturesData) {
    if (collection[creature.id]) poolCounts[creature.pool]++;
  }

  // Achievements
  const storedRank = localStorage.getItem("ascii-reef-rank");
  const leaderboardRank = sendScoresEnabled && storedRank ? parseInt(storedRank, 10) : null;
  const everReachedTop10 = localStorage.getItem("ascii-reef-ever-top10") === "1";
  const unlocked = computeUnlocked(collection, creaturesData, leaderboardRank, {
    sizeIndex, soundEnabled, sendScoresEnabled, everReachedTop10,
  });
  const allAchievements = getAchievements().filter(a => sendScoresEnabled || a.id !== "top_10");

  // Persistent hidden sets
  const hiddenAch  = loadHiddenSet(LS_HIDDEN_ACH);
  let showHidden = false;
  let currentTab = localStorage.getItem(LS_TAB) || "fish";

  // Filter / sort state (persisted)
  let filterPool = localStorage.getItem(LS_FILTER_POOL) || "all";
  let sortMode   = localStorage.getItem(LS_SORT_MODE)   || "rarity";

  // Sort: respects current sortMode, with rarity as tiebreak
  function getSorted() {
    return [...creaturesData].sort((a, b) => {
      if (sortMode === "count") {
        const ac = collection[a.id]?.count || 0;
        const bc = collection[b.id]?.count || 0;
        return bc - ac;
      }
      if (sortMode === "pool") {
        const order = ["typing", "click", "audio"];
        const pd = order.indexOf(a.pool) - order.indexOf(b.pool);
        if (pd !== 0) return pd;
      }
      // rarity (default, also used as tiebreak for pool sort)
      const aOwned = collection[a.id] ? 1 : 0;
      const bOwned = collection[b.id] ? 1 : 0;
      if (aOwned !== bOwned) return bOwned - aOwned;
      const rd = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
      if (rd !== 0) return rd;
      return (collection[b.id]?.count || 0) - (collection[a.id]?.count || 0);
    });
  }

  // ── Progress bar helpers ────────────────────────────────────────────────────
  function progressRow(label, labelColor, count, total, fillColor) {
    const pct  = total > 0 ? Math.round((count / total) * 100) : 0;
    const done = count === total && total > 0;
    return `
      <div class="coll-progress-row${done ? " coll-progress-row--done" : ""}">
        <span class="coll-progress-label"${labelColor ? ` style="color:${labelColor}"` : ""}>${label}</span>
        <div class="coll-bar-track">
          <div class="coll-bar-fill" style="width:${pct}%${fillColor ? `;background:${fillColor}` : ""}"></div>
        </div>
        <span class="coll-progress-pct">${pct}%</span>
        <span class="coll-progress-nums">${count}/${total}</span>
        <span class="coll-complete-badge">${done ? "✓ done" : ""}</span>
      </div>`;
  }

  const achTotal = allAchievements.length;

  // ── Build skeleton ──────────────────────────────────────────────────────────
  const root = document.getElementById("collection-root");
  root.innerHTML = `
    <div class="coll-header">
      <h1${uniqueCount === 105 ? ' class="coll-header-complete"' : ""}>ASCII Reef Collection</h1>
      <div class="coll-stats">
        <span>Score: ${score.toLocaleString()}</span>
        <span>${uniqueCount} / 105 discovered</span>
        <span>${unlocked.size} / ${achTotal} achievements</span>
      </div>
      <div class="coll-progress-section">
        ${progressRow("All fish", null, uniqueCount, 105, null)}
        ${progressRow(`${POOL_INFO.typing.icon} Typing`, POOL_INFO.typing.color, poolCounts.typing, 35, POOL_INFO.typing.color)}
        ${progressRow(`${POOL_INFO.click.icon} Clicks`,  POOL_INFO.click.color,  poolCounts.click,  35, POOL_INFO.click.color)}
        ${progressRow(`${POOL_INFO.audio.icon} Audio`,   POOL_INFO.audio.color,  poolCounts.audio,  35, POOL_INFO.audio.color)}
        ${progressRow("★ Achiev.", "#facc15", unlocked.size, achTotal, "#facc15")}
      </div>
    </div>
    <div class="coll-tab-bar" id="coll-tab-bar">
      <button class="coll-tab${currentTab === "fish" ? " active" : ""}" data-tab="fish">
        Fish (${uniqueCount}/105)
      </button>
      <button class="coll-tab${currentTab === "achievements" ? " active" : ""}" data-tab="achievements">
        Achievements (${unlocked.size}/${achTotal})
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
  function filteredHiddenFishCount() {
    if (filterPool === "all") return hiddenFish.size;
    let count = 0;
    for (const id of hiddenFish) {
      const creature = creaturesData.find(c => c.id === id);
      if (creature && creature.pool === filterPool) count++;
    }
    return count;
  }

  function updateHiddenToggle() {
    // Achievements always show in the list; only fish have a list-hide count.
    if (currentTab !== "fish") {
      hiddenToggle.textContent = "";
      hiddenToggle.style.cursor = "default";
      return;
    }
    const count = filteredHiddenFishCount();
    if (count === 0) {
      hiddenToggle.textContent = "";
      hiddenToggle.style.cursor = "default";
    } else {
      hiddenToggle.textContent = showHidden ? `hide ${count}` : `${count} hidden`;
      hiddenToggle.style.cursor = "pointer";
    }
  }

  // Save hidden fish to Rust state + emit to aquarium
  function persistHiddenFish() {
    invoke("set_hidden_creatures", { ids: [...hiddenFish] })
      .catch(e => console.error("Failed to save hidden creatures:", e));
  }

  // ── Fish tab ────────────────────────────────────────────────────────────────
  function renderFish() {
    fishPanel.innerHTML = "";

    // Build toolbar
    const toolbar = document.createElement("div");
    toolbar.className = "coll-toolbar";

    // Filter group
    const filterGroup = document.createElement("div");
    filterGroup.className = "coll-filter-group";

    const allBtn = document.createElement("button");
    allBtn.className = "coll-filter-btn" + (filterPool === "all" ? " active" : "");
    allBtn.dataset.pool = "all";
    allBtn.textContent = "All";
    filterGroup.appendChild(allBtn);

    for (const [pool, info] of Object.entries(POOL_INFO)) {
      const btn = document.createElement("button");
      btn.className = "coll-filter-btn" + (filterPool === pool ? " active" : "");
      btn.dataset.pool = pool;
      btn.style.setProperty("--pool-color", info.color);
      btn.textContent = `${info.icon} ${info.label} (${poolCounts[pool]}/35)`;
      filterGroup.appendChild(btn);
    }

    // Sort group
    const sortGroup = document.createElement("div");
    sortGroup.className = "coll-sort-group";

    const sortLabel = document.createElement("span");
    sortLabel.className = "coll-sort-label";
    sortLabel.textContent = "Sort:";
    sortGroup.appendChild(sortLabel);

    for (const [mode, label] of [["rarity", "Rarity"], ["count", "Count"], ["pool", "Pool"]]) {
      const btn = document.createElement("button");
      btn.className = "coll-sort-btn" + (sortMode === mode ? " active" : "");
      btn.dataset.sort = mode;
      btn.textContent = label;
      sortGroup.appendChild(btn);
    }

    toolbar.appendChild(filterGroup);
    toolbar.appendChild(sortGroup);
    fishPanel.appendChild(toolbar);

    // Toolbar event listeners
    filterGroup.addEventListener("click", (e) => {
      const btn = e.target.closest(".coll-filter-btn");
      if (!btn) return;
      filterPool = btn.dataset.pool;
      localStorage.setItem(LS_FILTER_POOL, filterPool);
      renderFish();
      updateHiddenToggle();
    });

    sortGroup.addEventListener("click", (e) => {
      const btn = e.target.closest(".coll-sort-btn");
      if (!btn) return;
      sortMode = btn.dataset.sort;
      localStorage.setItem(LS_SORT_MODE, sortMode);
      renderFish();
    });

    // Build grid
    const grid = document.createElement("div");
    grid.className = "coll-creature-grid";

    for (const creature of getSorted()) {
      if (filterPool !== "all" && creature.pool !== filterPool) continue;

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

      const spriteColor = collColorMode === "natural" && creature.naturalColor
        ? creature.naturalColor
        : RARITY_COLORS[creature.rarity];
      const color    = RARITY_COLORS[creature.rarity];
      const poolInfo = POOL_INFO[creature.pool];
      const timeOfDay  = creature.timeOfDay  || "both";
      const glowBadge  = creature.glowAtNight ? `<span class="coll-glow-badge" title="Bioluminescent">✦</span>` : "";
      const timeBadge  =
        timeOfDay === "day"   ? `<span class="coll-time-badge coll-time-badge--day"   title="Day only">☀</span>` :
        timeOfDay === "night" ? `<span class="coll-time-badge coll-time-badge--night" title="Night only">☽</span>` :
        "";
      const card     = document.createElement("div");
      card.className = "coll-card coll-card--found" + (isHidden ? " coll-card--dim" : "");
      card.innerHTML = `
        <button class="coll-fish-toggle">
          <span class="coll-check-icon">${isHidden ? "☐" : "☑"}</span>
          <span class="coll-check-label">${isHidden ? "hidden" : "shown"}</span>
        </button>
        <pre class="coll-sprite" style="color:${spriteColor}">${spriteHtml(creature.frames)}</pre>
        <div class="coll-card-footer">
          <span class="coll-pool-icon" style="color:${poolInfo.color}">${poolInfo.icon}</span>
          <span class="coll-card-name" style="color:${color}">${escapeHtml(creature.name)}${timeBadge}${glowBadge}</span>
          <span class="coll-card-count">x${owned.count}</span>
        </div>
      `;

      card.querySelector(".coll-fish-toggle").addEventListener("click", (e) => {
        e.stopPropagation();
        if (isHidden) hiddenFish.delete(creature.id);
        else          hiddenFish.add(creature.id);
        persistHiddenFish();
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

      // Achievements always show in the list; the toggle just dims them.
      const card = document.createElement("div");
      card.className = "coll-card coll-ach-card"
        + (!isUnlocked ? " coll-card--locked" : "")
        + (isHidden    ? " coll-card--dim"    : "");

      if (isUnlocked) {
        card.innerHTML = `
          <button class="coll-fish-toggle">
            <span class="coll-check-icon">${isHidden ? "☐" : "☑"}</span>
            <span class="coll-check-label">${isHidden ? "dismissed" : "shown"}</span>
          </button>
          <div class="coll-ach-icon">★</div>
          <div class="coll-ach-name">${escapeHtml(ach.name)}</div>
          <div class="coll-ach-desc">${escapeHtml(ach.description)}</div>
          <div class="coll-ach-unlock">${escapeHtml(ach.unlock)}</div>
        `;
        card.querySelector(".coll-fish-toggle").addEventListener("click", (e) => {
          e.stopPropagation();
          if (isHidden) hiddenAch.delete(ach.id);
          else          hiddenAch.add(ach.id);
          saveHiddenSet(LS_HIDDEN_ACH, hiddenAch);
          renderAchievements();
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

  // ── Show/hide hidden fish toggle (fish tab only) ────────────────────────────
  hiddenToggle.addEventListener("click", () => {
    if (currentTab !== "fish") return;
    const count = filteredHiddenFishCount();
    if (count === 0) return;
    showHidden = !showHidden;
    renderFish();
    updateHiddenToggle();
  });

  // ── Initial render ──────────────────────────────────────────────────────────
  renderFish();
  renderAchievements();
  updateHiddenToggle();
}

init();
