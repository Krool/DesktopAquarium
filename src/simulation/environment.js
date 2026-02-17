// Environment rendering: kelp, coral, bubbles, water particles, rock line, decorations

import { drawChar, drawString, COLS, ROWS } from "../renderer/canvas.js";
import { ENV_COLORS } from "../renderer/colors.js";

// Dynamic constants
let ROCK_ROW, SAND_ROW;
const WATER_DENSITY = 0.06;
const WATER_GLYPHS = ["~", ".", "\u00B0", "o"];
const SAND_GLYPHS = [".", ",", " ", ".", ",", "_", "."];
const CORAL = ["  _-_ ", " /   \\", " \\_-_/"];

// State that gets regenerated on resize
let waterParticles = [];
let waterDriftOffset = 0;
let kelpStalks = [];
let coralPositions = [];
let starfish = [];
let chestCol = null;

// Bubbles: organic, spawned from creatures and decorations
const bubbles = [];
const MAX_BUBBLES = 30;

export function spawnBubble(col, row) {
  if (bubbles.length >= MAX_BUBBLES) return;
  bubbles.push({
    x: col + (Math.random() - 0.5) * 0.5,
    y: row,
    speed: 0.02 + Math.random() * 0.03,
    drift: (Math.random() - 0.5) * 0.15,
    big: Math.random() > 0.6,
  });
}

function generateAll() {
  ROCK_ROW = ROWS - 2;
  SAND_ROW = ROWS - 1;

  // Water particles
  waterParticles = [];
  const count = Math.floor(COLS * (ROWS - 2) * WATER_DENSITY);
  for (let i = 0; i < count; i++) {
    waterParticles.push({
      col: Math.floor(Math.random() * COLS),
      row: Math.floor(Math.random() * (ROWS - 2)),
      glyph: WATER_GLYPHS[Math.floor(Math.random() * WATER_GLYPHS.length)],
    });
  }

  // Kelp stalks - scale count with width
  kelpStalks = [];
  const kelpCount = Math.max(2, Math.floor(COLS / 15));
  const kelpSpacing = Math.floor(COLS / (kelpCount + 1));
  for (let i = 0; i < kelpCount; i++) {
    const col = kelpSpacing * (i + 1) + Math.floor(Math.random() * 4) - 2;
    kelpStalks.push({
      col: Math.max(2, Math.min(COLS - 3, col)),
      height: 3 + Math.floor(Math.random() * 4),
      phase: Math.random() * Math.PI * 2,
    });
  }

  // Coral - scale with width
  coralPositions = [];
  const coralCount = Math.max(1, Math.floor(COLS / 30));
  for (let i = 0; i < coralCount; i++) {
    let col;
    let attempts = 0;
    do {
      col = 3 + Math.floor(Math.random() * (COLS - 10));
      attempts++;
    } while (
      attempts < 20 &&
      kelpStalks.some((k) => Math.abs(k.col - col) < 8)
    );
    if (attempts < 20) coralPositions.push(col);
  }

  // Starfish - scale with width
  starfish = [];
  const starCount = Math.max(1, Math.floor(COLS / 25));
  for (let i = 0; i < starCount; i++) {
    starfish.push({ col: 5 + Math.floor(Math.random() * (COLS - 10)) });
  }

  // Treasure chest
  chestCol = null;
  const chestTry = Math.floor(COLS * 0.6) + Math.floor(Math.random() * 10) - 5;
  const overlaps = kelpStalks.some((k) => Math.abs(k.col - chestTry) < 6);
  if (!overlaps && chestTry + 4 < COLS - 1 && chestTry >= 1) {
    chestCol = chestTry;
  }

  // Clear bubbles on resize
  bubbles.length = 0;
}

// Initial generation
generateAll();

// Re-initialize for new dimensions
export function reinitEnvironment() {
  generateAll();
}

export function getRockRow() {
  return ROWS - 2;
}

export function renderEnvironment(timestamp) {
  ROCK_ROW = ROWS - 2;
  SAND_ROW = ROWS - 1;
  const t = timestamp / 1000;

  // Water particles - slow drift
  waterDriftOffset = (timestamp / 3000) % COLS;
  for (const p of waterParticles) {
    const col = Math.floor(p.col + waterDriftOffset) % COLS;
    if (p.row < ROCK_ROW) {
      drawChar(col, p.row, p.glyph, ENV_COLORS.water);
    }
  }

  // Rock line
  for (let col = 0; col < COLS; col++) {
    drawChar(col, ROCK_ROW, "_", ENV_COLORS.rock);
  }

  // Sand row with texture
  for (let col = 0; col < COLS; col++) {
    const g = SAND_GLYPHS[col % SAND_GLYPHS.length];
    if (g !== " ") drawChar(col, SAND_ROW, g, ENV_COLORS.sand);
  }

  // Kelp - per-segment sway
  for (const stalk of kelpStalks) {
    const sway = Math.sin(t * 0.5 + stalk.phase);
    for (let i = 0; i < stalk.height; i++) {
      const row = ROCK_ROW - 1 - i;
      if (row < 1) break;
      const offset = i > 0 ? Math.round(sway * (i * 0.4)) : 0;
      const col = stalk.col + offset;
      const ch = i % 2 === 0 ? ")" : "(";
      drawChar(col, row, ch, ENV_COLORS.kelp);
    }
  }

  // Coral
  for (const cCol of coralPositions) {
    const startRow = ROCK_ROW - CORAL.length;
    for (let r = 0; r < CORAL.length; r++) {
      drawString(cCol, startRow + r, CORAL[r], ENV_COLORS.coral);
    }
  }

  // Starfish on sand
  for (const s of starfish) {
    drawChar(s.col, ROCK_ROW - 1, "*", ENV_COLORS.star);
  }

  // Treasure chest on sand
  if (chestCol !== null) {
    drawString(chestCol, ROCK_ROW - 2, "____", ENV_COLORS.chest);
    drawString(chestCol, ROCK_ROW - 1, "|$$|", ENV_COLORS.chest);
  }

  // Occasional bubbles from chest
  if (chestCol !== null && Math.random() < 0.008) {
    spawnBubble(chestCol + 2, ROCK_ROW - 3);
  }

  // Update and render bubbles
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    b.y -= b.speed;
    b.x += b.drift * 0.05;
    if (b.y < 1) {
      bubbles.splice(i, 1);
      continue;
    }
    const ch = b.big ? "O" : "o";
    drawChar(Math.round(b.x), Math.round(b.y), ch, ENV_COLORS.bubble);
  }
}
