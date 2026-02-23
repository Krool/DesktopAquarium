// Sprite parsing and RTL mirroring

// Mirror map for horizontal flip
const MIRROR_MAP = {
  "<": ">",
  ">": "<",
  "(": ")",
  ")": "(",
  "/": "\\",
  "\\": "/",
  "{": "}",
  "}": "{",
  "[": "]",
  "]": "[",
};

function mirrorChar(ch) {
  return MIRROR_MAP[ch] || ch;
}

function mirrorLine(line) {
  let result = "";
  for (let i = line.length - 1; i >= 0; i--) {
    result += mirrorChar(line[i]);
  }
  return result;
}

function mirrorFrame(frame) {
  return frame.map(mirrorLine);
}

// Parse a creature definition into precomputed frame arrays
function parseCreature(def) {
  const frames = def.frames.map((frame) => {
    // Each frame is an array of strings (rows)
    // Pad all rows to the creature's width
    return frame.map((row) => row.padEnd(def.width, " "));
  });

  // Pre-compute mirrored frames
  const mirroredFrames = frames.map(mirrorFrame);

  return {
    id: def.id,
    name: def.name,
    rarity: def.rarity,
    pool: def.pool,
    category: def.category,
    width: def.width,
    height: def.height,
    frames,
    mirroredFrames,
    frameCount: frames.length,
    timeOfDay: def.timeOfDay || "both",
    glowAtNight: def.glowAtNight || false,
    nightGlowColor: def.nightGlowColor || null,
    naturalColor:    def.naturalColor    || null,
    naturalColorAlt: def.naturalColorAlt || null,
    naturalColorEye: def.naturalColorEye || null,
    naturalAnim:     def.naturalAnim     || null,
  };
}

// Parse all creatures from JSON data
export function parseAllCreatures(data) {
  const creatures = {};
  for (const def of data) {
    creatures[def.id] = parseCreature(def);
  }
  return creatures;
}
