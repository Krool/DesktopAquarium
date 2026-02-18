// Tank display system: spawn cycle, lifetime, weighted selection, rarest slot

import { CreatureInstance } from "./creature.js";
import { drawString, drawStringBg, COLS, ROWS } from "../renderer/canvas.js";
import { ENV_COLORS, DISPLAY_WEIGHTS, SCORE_VALUES, RARITY_COLORS } from "../renderer/colors.js";
import { getMyRank } from "./leaderboard.js";

const SOFT_TARGET = 9;
const HARD_CAP = 12;
const SPAWN_MIN = 6000; // 6 seconds
const SPAWN_MAX = 10000; // 10 seconds

let creatures = []; // Active CreatureInstance[]
let allSprites = {}; // id -> parsed sprite def
let collection = {}; // id -> { count, firstSeen }
let nextSpawnTime = 0;
let capBoostEnd = 0; // Temporary cap boost to 12 after discovery

export function initTank(spriteDefs, savedCollection) {
  allSprites = spriteDefs;
  collection = savedCollection || {};
}

export function updateCollection(newCollection) {
  collection = newCollection;
}

export function getCollection() {
  return collection;
}

export function setCapBoost(timestamp) {
  capBoostEnd = timestamp + 30000; // 30 second boost
}

function getOwnedCreatures() {
  return Object.keys(collection)
    .filter((id) => allSprites[id])
    .map((id) => allSprites[id]);
}

function getActiveCreatureCounts() {
  const counts = new Map();
  for (const creature of creatures) {
    counts.set(creature.id, (counts.get(creature.id) || 0) + 1);
  }
  return counts;
}

function getMaxVisibleForCreature(id) {
  return Math.max(0, collection[id]?.count || 0);
}

function getRarestOwned() {
  const rarityOrder = ["legendary", "epic", "rare", "uncommon", "common"];
  const owned = getOwnedCreatures();
  for (const rarity of rarityOrder) {
    const match = owned.find((c) => c.rarity === rarity);
    if (match) return match;
  }
  return null;
}

function weightedSelect(owned) {
  const weights = owned.map((c) => DISPLAY_WEIGHTS[c.rarity] || 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * totalWeight;
  for (let i = 0; i < owned.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return owned[i];
  }
  return owned[owned.length - 1];
}

function spawnCreature(sprite, opts = {}) {
  const instance = new CreatureInstance(sprite, opts);
  creatures.push(instance);
  return instance;
}

export function spawnDiscoveryCreature(sprite, timestamp) {
  const centerCol = Math.floor((COLS - sprite.width) / 2);
  const centerRow = Math.floor((ROWS - sprite.height) / 2);
  return spawnCreature(sprite, {
    col: centerCol,
    row: centerRow,
    direction: 1,
    speed: 0.5,
    lifetime: 30,
    colorOverride: null,
  });
}

export function calculateScore() {
  let score = 0;
  for (const [id, data] of Object.entries(collection)) {
    const sprite = allSprites[id];
    if (sprite) {
      score += (SCORE_VALUES[sprite.rarity] || 0) * data.count;
    }
  }
  return score;
}

export function getUniqueCount() {
  return Object.keys(collection).length;
}

export function updateTank(timestamp, deltaSeconds) {
  // Update existing creatures
  for (const creature of creatures) {
    creature.update(deltaSeconds, timestamp);
  }

  // Remove dead creatures
  creatures = creatures.filter((c) => c.alive);

  const currentCap = timestamp < capBoostEnd ? HARD_CAP : SOFT_TARGET;

  // Spawn cycle
  if (timestamp >= nextSpawnTime && creatures.length < currentCap) {
    const owned = getOwnedCreatures();
    if (owned.length > 0) {
      const activeCounts = getActiveCreatureCounts();
      const spawnable = owned.filter((sprite) => {
        const active = activeCounts.get(sprite.id) || 0;
        return active < getMaxVisibleForCreature(sprite.id);
      });

      if (spawnable.length === 0) {
        nextSpawnTime = timestamp + SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
        return;
      }

      // Check if rarest slot is occupied
      const rarest = getRarestOwned();
      const rarestOnScreen = rarest && (activeCounts.get(rarest.id) || 0) > 0;
      const rarestCanSpawn = rarest && spawnable.some((sprite) => sprite.id === rarest.id);

      // Bias toward filling empty species slots first so the aquarium feels fuller
      // as the player unlocks more unique creatures.
      const notOnScreen = spawnable.filter((sprite) => (activeCounts.get(sprite.id) || 0) === 0);

      let toSpawn;
      if (rarest && !rarestOnScreen && rarestCanSpawn) {
        toSpawn = rarest;
      } else if (notOnScreen.length > 0) {
        toSpawn = weightedSelect(notOnScreen);
      } else {
        toSpawn = weightedSelect(spawnable);
      }

      spawnCreature(toSpawn);
    }

    nextSpawnTime = timestamp + SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
  }
}

export function renderTank(timestamp) {
  // Render creatures sorted by category (heavy drawn last)
  const sorted = [...creatures].sort((a, b) => {
    const order = { swimmer: 0, bottom: 1, floater: 2, heavy: 3 };
    return (order[a.sprite.category] || 0) - (order[b.sprite.category] || 0);
  });

  for (const creature of sorted) {
    creature.render(timestamp);
  }

  // Score display on the rock line row (bottom area)
  const score = calculateScore();
  const rank = getMyRank();
  const scoreText = rank !== null
    ? `Score: ${score.toLocaleString()} #${rank}`
    : `Score: ${score.toLocaleString()}`;
  const uiBg = "rgba(0, 0, 0, 0.5)";
  drawStringBg(1, ROWS - 2, scoreText, ENV_COLORS.ui, uiBg);

  // Collection progress bottom-right on rock line
  const total = 105;
  const owned = getUniqueCount();
  const progressText = `${owned}/${total}`;
  drawStringBg(COLS - progressText.length - 1, ROWS - 2, progressText, ENV_COLORS.ui, uiBg);
}

export function clearCreatures() {
  creatures = [];
  nextSpawnTime = 0;
}

export function getCreatures() {
  return creatures;
}
