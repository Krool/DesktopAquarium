// Environment rendering: kelp, coral, bubbles, water particles, rock line

import { drawChar, drawString, COLS, ROWS } from "../renderer/canvas.js";
import { ENV_COLORS } from "../renderer/colors.js";

// Constants - derived from ROWS
const ROCK_ROW = ROWS - 2; // second-to-last row
const SAND_ROW = ROWS - 1; // last row
const WATER_DENSITY = 0.06; // ~6% of cells
const KELP_SWAY_PERIOD = 4000; // 4 seconds full cycle

// Water particle glyphs
const WATER_GLYPHS = ["~", ".", "\u00B0", "o"];

// Pre-generate water particle positions
let waterParticles = [];
let waterDriftOffset = 0;

function generateWaterParticles() {
  waterParticles = [];
  const count = Math.floor(COLS * (ROWS - 2) * WATER_DENSITY);
  for (let i = 0; i < count; i++) {
    waterParticles.push({
      col: Math.floor(Math.random() * COLS),
      row: Math.floor(Math.random() * (ROWS - 2)),
      glyph: WATER_GLYPHS[Math.floor(Math.random() * WATER_GLYPHS.length)],
    });
  }
}
generateWaterParticles();

// Kelp configuration: 2-4 stalks, spaced 8+ columns apart
const kelpPositions = [];
{
  const count = 2 + Math.floor(Math.random() * 3); // 2-4
  const spacing = Math.floor(COLS / (count + 1));
  for (let i = 0; i < count; i++) {
    const col = spacing * (i + 1) + Math.floor(Math.random() * 4) - 2;
    kelpPositions.push(Math.max(2, Math.min(COLS - 5, col)));
  }
}

// Kelp frames
const KELP_FRAME_1 = ["   |", "  /|", " / |", "/  |"];
const KELP_FRAME_2 = ["   |", "   |\\", "   | \\", "   |  \\"];

// Coral configuration: 1-3 pieces, non-overlapping with kelp
const coralPositions = [];
{
  const count = 1 + Math.floor(Math.random() * 3); // 1-3
  for (let i = 0; i < count; i++) {
    let col;
    let attempts = 0;
    do {
      col = 3 + Math.floor(Math.random() * (COLS - 10));
      attempts++;
    } while (
      attempts < 20 &&
      kelpPositions.some((k) => Math.abs(k - col) < 8)
    );
    if (attempts < 20) coralPositions.push(col);
  }
}

const CORAL = ["  _-_ ", " /   \\", " \\_-_/"];

// Bubble columns: 1-2, rising 1 row/sec
const bubbleColumns = [];
{
  const count = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    bubbleColumns.push({
      col: 5 + Math.floor(Math.random() * (COLS - 10)),
      offset: Math.random() * ROCK_ROW,
    });
  }
}

const BUBBLE_GLYPHS = ["o", "O", "\u00B0"];

export function renderEnvironment(timestamp) {
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

  // Sand/ground row
  const sandGlyphs = [" ", "^", " ", " ", "^", " "];
  for (let col = 0; col < COLS; col++) {
    const g = sandGlyphs[col % sandGlyphs.length];
    if (g !== " ") drawChar(col, SAND_ROW, g, ENV_COLORS.rock);
  }

  // Kelp
  const kelpPhase = (timestamp % KELP_SWAY_PERIOD) / KELP_SWAY_PERIOD;
  const kelpFrame = kelpPhase < 0.5 ? KELP_FRAME_1 : KELP_FRAME_2;
  for (const kCol of kelpPositions) {
    const startRow = ROCK_ROW - kelpFrame.length;
    for (let r = 0; r < kelpFrame.length; r++) {
      drawString(kCol, startRow + r, kelpFrame[r], ENV_COLORS.kelp);
    }
  }

  // Coral
  for (const cCol of coralPositions) {
    const startRow = ROCK_ROW - CORAL.length;
    for (let r = 0; r < CORAL.length; r++) {
      drawString(cCol, startRow + r, CORAL[r], ENV_COLORS.coral);
    }
  }

  // Bubble columns
  for (const bc of bubbleColumns) {
    const risingOffset = (timestamp / 1000 + bc.offset) % ROCK_ROW;
    for (let i = 0; i < 3; i++) {
      const row = Math.floor(ROCK_ROW - risingOffset + i * 3) % ROCK_ROW;
      if (row >= 0 && row < ROCK_ROW) {
        const glyph = BUBBLE_GLYPHS[i % BUBBLE_GLYPHS.length];
        drawChar(bc.col + i, row, glyph, ENV_COLORS.bubble);
      }
    }
  }
}

export { ROCK_ROW };
