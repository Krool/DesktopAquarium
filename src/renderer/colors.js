// Rarity colors applied to creature glyphs
export const RARITY_COLORS = {
  common: "#E0E0E0",
  uncommon: "#7FE0FF",
  rare: "#4FA3FF",
  epic: "#C36BFF",
  legendary: "#FFD84F",
};

// Environment colors
export const ENV_COLORS = {
  kelp: "#22c55e",
  rock: "#616161",
  coral: "#E0A0A0",
  water: "rgba(33, 150, 243, 0.30)",
  surface: "rgba(120, 200, 255, 0.55)",
  surfaceSplash: "#BFE9FF",
  bubble: "#7dd3fc",
  sand: "#a8896c",
  star: "#facc15",
  chest: "#d97706",
  ui: "#9E9E9E",
  // Achievement decoration colors
  clam: "#E8C8D8",
  shipwreck: "#8B7355",
  volcano: "#A0522D",
  trident: "#FFD700",
  keyboard: "#B0C4DE",
  cursor: "#C0C0C0",
  musicNotes: "#DDA0DD",
  trophy: "#FFD700",
  sparkle: "#E8E8FF",
  goldenSand: "#DAA520",
  shimmerWater: "rgba(255, 215, 0, 0.15)",
};

// Progress bar colors
export const PROGRESS_COLORS = {
  typing: { outline: "#5EE6FF", fill: "#00B3FF", empty: "#2B4C5A" },
  click: { outline: "#7CFF6B", fill: "#22C55E", empty: "#2B4E35" },
  audio: { outline: "#C9A2FF", fill: "#A855F7", empty: "#3F2B5A" },
};

// Score values per rarity
export const SCORE_VALUES = {
  common: 10,
  uncommon: 25,
  rare: 75,
  epic: 250,
  legendary: 1500,
};

export const NIGHT_COLORS = {
  skyNight:       "rgba(4,   8,  28, 0.97)",
  skyNightHoriz:  "rgba(10,  18,  52, 0.95)",
  skyDawnTop:     "rgba(60,  20,  70, 0.95)",
  skyDawn1:       "rgba(220, 90,  30, 0.88)",
  skyDay:         "rgba(28,  62, 110, 0.97)",
  skyDayHoriz:    "rgba(52, 110, 160, 0.92)",
  waterNightTop:  "rgba(10,  30,  80, 0.65)",
  waterNightMid:  "rgba(6,   18,  50, 0.55)",
  waterNightDeep: "rgba(2,    6,  22, 0.85)",
  waterDayTop:    "rgba(90, 195, 240, 0.55)",
  waterDayMid:    "rgba(26,  71, 150, 0.38)",
  waterDayBot:    "rgba(11,  48, 118, 0.30)",
  waterDayDeep:   "rgba(6,   16,  54, 0.78)",
  sunGlyph:       "#FFE080",
  moonGlyph:      "#C8D8F0",
  moteNight:      "rgba(60, 210, 140, 0.18)",
  moteDay:        "rgba(210, 245, 255, 0.22)",
  shootingStar:   "rgba(220, 230, 255, 0.85)",
};

// Display weights for tank spawn selection
export const DISPLAY_WEIGHTS = {
  common: 6,
  uncommon: 3,
  rare: 1.5,
  epic: 0.5,
  legendary: 0.1,
};
