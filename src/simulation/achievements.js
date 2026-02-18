// Achievement definitions and unlock logic
// Achievements are derived deterministically from collection state — no persistence needed.

const ACHIEVEMENTS = [
  // Milestone achievements (progressive unlocks by unique creature count)
  {
    id: "first_catch",
    name: "First Catch",
    description: "Discover 1 creature",
    unlock: "Sand ripples appear",
    check: (col) => col.uniqueCount >= 1,
  },
  {
    id: "starter_tank",
    name: "Starter Tank",
    description: "Discover 3 unique creatures",
    unlock: "Kelp stalks grow in",
    check: (col) => col.uniqueCount >= 3,
  },
  {
    id: "getting_hooked",
    name: "Getting Hooked",
    description: "Discover 5 unique creatures",
    unlock: "Bubbles enabled",
    check: (col) => col.uniqueCount >= 5,
  },
  {
    id: "reef_builder",
    name: "Reef Builder",
    description: "Discover 10 unique creatures",
    unlock: "Coral formations",
    check: (col) => col.uniqueCount >= 10,
  },
  {
    id: "collector",
    name: "Collector",
    description: "Discover 15 unique creatures",
    unlock: "Starfish on sand",
    check: (col) => col.uniqueCount >= 15,
  },
  {
    id: "deep_diver",
    name: "Deep Diver",
    description: "Discover 20 unique creatures",
    unlock: "Treasure chest",
    check: (col) => col.uniqueCount >= 20,
  },
  {
    id: "marine_biologist",
    name: "Marine Biologist",
    description: "Discover 30 unique creatures",
    unlock: "Animated clam",
    check: (col) => col.uniqueCount >= 30,
  },
  {
    id: "ocean_explorer",
    name: "Ocean Explorer",
    description: "Discover 50 unique creatures",
    unlock: "Shipwreck piece",
    check: (col) => col.uniqueCount >= 50,
  },
  {
    id: "reef_master",
    name: "Reef Master",
    description: "Discover 60 unique creatures",
    unlock: "Volcano rock",
    check: (col) => col.uniqueCount >= 60,
  },
  {
    id: "completionist",
    name: "Completionist",
    description: "Discover all 105 creatures",
    unlock: "Golden trident + shimmering water",
    check: (col) => col.uniqueCount >= 105,
  },

  // Category achievements (all creatures in a pool)
  {
    id: "typist",
    name: "Typist",
    description: "Collect all 35 typing creatures",
    unlock: "Keyboard coral",
    check: (col) => col.poolCounts.typing >= 35,
  },
  {
    id: "clicker",
    name: "Clicker",
    description: "Collect all 35 click creatures",
    unlock: "Cursor arrow",
    check: (col) => col.poolCounts.click >= 35,
  },
  {
    id: "dj",
    name: "DJ",
    description: "Collect all 35 audio creatures",
    unlock: "Music notes",
    check: (col) => col.poolCounts.audio >= 35,
  },

  // Rarity achievements
  {
    id: "rare_finder",
    name: "Rare Finder",
    description: "Discover a rare creature",
    unlock: "Deeper blue water tint",
    check: (col) => col.hasRarity.rare,
  },
  {
    id: "epic_discovery",
    name: "Epic Discovery",
    description: "Discover an epic creature",
    unlock: "Sparkle particles",
    check: (col) => col.hasRarity.epic,
  },
  {
    id: "legendary_encounter",
    name: "Legendary Encounter",
    description: "Discover a legendary creature",
    unlock: "Golden sand shimmer",
    check: (col) => col.hasRarity.legendary,
  },

  // Leaderboard achievement
  {
    id: "top_10",
    name: "Top 10",
    description: "Reach leaderboard top 10",
    unlock: "Trophy decoration",
    check: (col) => col.leaderboardRank !== null && col.leaderboardRank <= 10,
  },
];

export function getAchievements() {
  return ACHIEVEMENTS;
}

/**
 * Build collection stats object used by achievement checks.
 */
function buildCollectionStats(collection, creaturesData, leaderboardRank) {
  const uniqueCount = Object.keys(collection).length;

  // Count unique creatures per pool
  const poolCounts = { typing: 0, click: 0, audio: 0 };
  const hasRarity = { rare: false, epic: false, legendary: false };

  for (const id of Object.keys(collection)) {
    const creature = creaturesData.find((c) => c.id === id);
    if (!creature) continue;
    if (poolCounts[creature.pool] !== undefined) {
      poolCounts[creature.pool]++;
    }
    if (creature.rarity === "rare") hasRarity.rare = true;
    if (creature.rarity === "epic") hasRarity.epic = true;
    if (creature.rarity === "legendary") hasRarity.legendary = true;
  }

  return { uniqueCount, poolCounts, hasRarity, leaderboardRank };
}

/**
 * Compute set of unlocked achievement IDs from current state.
 */
export function computeUnlocked(collection, creaturesData, leaderboardRank) {
  const stats = buildCollectionStats(collection, creaturesData, leaderboardRank);
  const unlocked = new Set();
  for (const achievement of ACHIEVEMENTS) {
    if (achievement.check(stats)) {
      unlocked.add(achievement.id);
    }
  }
  return unlocked;
}

/**
 * Find newly earned achievement IDs by diffing old vs new sets.
 */
export function diffAchievements(oldSet, newSet) {
  const newlyEarned = [];
  for (const id of newSet) {
    if (!oldSet.has(id)) {
      newlyEarned.push(id);
    }
  }
  return newlyEarned;
}
