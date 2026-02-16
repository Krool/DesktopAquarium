// Tank display system: spawn cycle, lifetime, weighted selection, rarest slot

import { CreatureInstance } from "./creature.js";
import { drawString, COLS, ROWS } from "../renderer/canvas.js";
import { ENV_COLORS, DISPLAY_WEIGHTS, SCORE_VALUES } from "../renderer/colors.js";

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
      // Check if rarest slot is occupied
      const rarest = getRarestOwned();
      const rarestOnScreen = rarest && creatures.some((c) => c.id === rarest.id);

      let toSpawn;
      if (rarest && !rarestOnScreen) {
        toSpawn = rarest;
      } else {
        toSpawn = weightedSelect(owned);
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

  // Score display bottom-left
  const score = calculateScore();
  const scoreText = `Score: ${score.toLocaleString()}`;
  drawString(1, ROWS - 1, scoreText, ENV_COLORS.ui);

  // Collection progress bottom-right
  const total = 75;
  const owned = getUniqueCount();
  const progressText = `${owned}/${total}`;
  drawString(COLS - progressText.length - 1, ROWS - 1, progressText, ENV_COLORS.ui);
}

export function getCreatures() {
  return creatures;
}
