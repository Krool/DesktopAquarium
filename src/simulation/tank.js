// Tank display system: spawn cycle, lifetime, weighted selection, rarest slot

import { CreatureInstance } from "./creature.js";
import { drawStringBg, COLS, ROWS } from "../renderer/canvas.js";
import { ENV_COLORS, DISPLAY_WEIGHTS, SCORE_VALUES } from "../renderer/colors.js";
import { getMyRank, getLeaderboardEnabled } from "./leaderboard.js";

const SOFT_TARGET = 9;
const HARD_CAP = 12;
const SPAWN_MIN = 6000; // 6 seconds
const SPAWN_MAX = 10000; // 10 seconds

let creatures = []; // Active CreatureInstance[]
let allSprites = {}; // id -> parsed sprite def
let collection = {}; // id -> { count, firstSeen }
let nextSpawnTime = 0;
let capBoostEnd = 0; // Temporary cap boost to 12 after discovery

function maybeApplySchooling(timestamp) {
  const swimmers = creatures.filter((c) => c.sprite.category === "swimmer");
  if (swimmers.length < 2) return;
  for (const c of swimmers) {
    if (timestamp < c.schoolCooldownUntil) continue;
    if (Math.random() > 0.02) continue;
    let closest = null;
    let closestDist = Infinity;
    for (const other of swimmers) {
      if (other === c) continue;
      const dist = Math.abs(other.col - c.col) + Math.abs(other.row - c.row);
      if (dist < closestDist) {
        closestDist = dist;
        closest = other;
      }
    }
    if (closest && closestDist <= 6) {
      const until = timestamp + 1500 + Math.random() * 700;
      c.schoolUntil = until;
      c.schoolDir = closest.direction;
      c.schoolSpeed = closest.baseSpeed;
      c.schoolCooldownUntil = timestamp + 6000 + Math.random() * 4000;

      closest.schoolUntil = until;
      closest.schoolDir = c.direction;
      closest.schoolSpeed = c.baseSpeed;
      closest.schoolCooldownUntil = timestamp + 6000 + Math.random() * 4000;
    }
  }
}

function maybeTriggerCrabFights(timestamp) {
  const crabs = creatures.filter(
    (c) => c.sprite.category === "bottom" && c.sprite.name.includes("Crab")
  );
  if (crabs.length < 2) return;
  for (let i = 0; i < crabs.length; i++) {
    const a = crabs[i];
    if (timestamp < a.fightCooldownUntil || a.fightUntil > timestamp) continue;
    for (let j = i + 1; j < crabs.length; j++) {
      const b = crabs[j];
      if (timestamp < b.fightCooldownUntil || b.fightUntil > timestamp) continue;
      const close = Math.abs(a.col - b.col) <= 2 && Math.abs(a.row - b.row) <= 0;
      if (close) {
        a.startFight(timestamp);
        b.startFight(timestamp);
        return;
      }
    }
  }
}

function getRenderOrderValue(creature) {
  const order = { swimmer: 0, bottom: 1, floater: 2, heavy: 3 };
  return order[creature.sprite.category] || 0;
}

function isCreatureHit(creature, col, row) {
  if (col < creature.col || row < creature.row) return false;
  const localCol = col - creature.col;
  const localRow = row - creature.row;
  if (localCol >= creature.sprite.width || localRow >= creature.sprite.height) return false;

  const frames = creature.direction === -1 ? creature.sprite.mirroredFrames : creature.sprite.frames;
  const frame = frames[creature.frameIndex] || frames[0];
  if (!frame || !frame[localRow]) return false;
  return frame[localRow][localCol] && frame[localRow][localCol] !== " ";
}

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
  maybeApplySchooling(timestamp);
  maybeTriggerCrabFights(timestamp);

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
  const sorted = [...creatures].sort((a, b) => getRenderOrderValue(a) - getRenderOrderValue(b));

  for (const creature of sorted) {
    creature.render(timestamp);
  }

  // Score display on the rock line row (bottom area)
  const score = calculateScore();
  const leaderboardEnabled = getLeaderboardEnabled();
  const rank = leaderboardEnabled ? getMyRank() : null;
  let scoreText = rank !== null
    ? `Score: ${score.toLocaleString()} #${rank}`
    : `Score: ${score.toLocaleString()}`;
  const maxScoreLen = Math.max(6, COLS - 2);
  if (scoreText.length > maxScoreLen) {
    scoreText = `Score:${score.toLocaleString()}`;
  }
  if (scoreText.length > maxScoreLen) {
    scoreText = score.toLocaleString();
  }
  const uiBg = "rgba(0, 0, 0, 0.5)";
  drawStringBg(1, ROWS - 2, scoreText, ENV_COLORS.ui, uiBg);

  // Collection progress bottom-right on rock line
  const total = 105;
  const owned = getUniqueCount();
  const progressText = `${owned}/${total}`;
  const rightCol = COLS - progressText.length - 1;
  const scoreEnd = 1 + scoreText.length;
  if (rightCol - scoreEnd >= 2) {
    drawStringBg(rightCol, ROWS - 2, progressText, ENV_COLORS.ui, uiBg);
  }
}

export function clearCreatures() {
  creatures = [];
  nextSpawnTime = 0;
}

export function getCreatures() {
  return creatures;
}


export function getCreatureAtGrid(col, row) {
  const sorted = [...creatures].sort((a, b) => getRenderOrderValue(a) - getRenderOrderValue(b));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const creature = sorted[i];
    if (isCreatureHit(creature, col, row)) {
      return creature;
    }
  }
  return null;
}
