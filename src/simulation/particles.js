// Particle systems: bubbles, sparkles, surface splashes, bubble pops, shooting stars.
// All particle state and rendering lives here; environment.js delegates to this module.

import { drawChar, COLS, ROWS } from "../renderer/canvas.js";
import { ENV_COLORS, NIGHT_COLORS } from "../renderer/colors.js";

const MAX_BUBBLES = 30;
const MAX_SPARKLES = 8;
const MAX_SHOOTING_STARS = 2;
const SURFACE_ROW = 2;

const bubbles = [];
const sparkles = [];
const surfaceSplashes = [];
const bubblePops = [];
const shootingStars = [];

let unlockedSet = new Set();

export function setParticleAchievements(set) {
  unlockedSet = set;
}

function hasAchievement(id) {
  return unlockedSet.has(id);
}

/** Clear all particle arrays — call on resize/reinit. */
export function clearParticles() {
  bubbles.length = 0;
  sparkles.length = 0;
  shootingStars.length = 0;
  bubblePops.length = 0;
  surfaceSplashes.length = 0;
}

/** Spawn a rising bubble at the given grid position (gated by getting_hooked achievement). */
export function spawnBubble(col, row) {
  if (!hasAchievement("getting_hooked")) return;
  if (bubbles.length >= MAX_BUBBLES) return;
  bubbles.push({
    x: col + (Math.random() - 0.5) * 0.5,
    y: row,
    speed: 0.02 + Math.random() * 0.03,
    drift: (Math.random() - 0.5) * 0.15,
    big: Math.random() > 0.6,
  });
}

/** Spawn a surface splash effect at the given column. */
export function spawnSurfaceSplash(col, timestamp, width = 2) {
  surfaceSplashes.push({
    col,
    width,
    start: timestamp,
    duration: 900 + Math.random() * 600,
  });
}

/**
 * Update and render all particle systems.
 * Call once per frame from renderEnvironment, after all static decorations.
 */
export function renderParticles(timestamp, isNight) {
  const ROCK_ROW = ROWS - 2;

  // Shooting stars (night only)
  if (isNight) {
    if (shootingStars.length < MAX_SHOOTING_STARS && Math.random() < 0.003) {
      shootingStars.push({
        col: 1 + Math.floor(Math.random() * (COLS - 8)),
        life: 0,
        maxLife: 40 + Math.floor(Math.random() * 30),
      });
    }
    for (let i = shootingStars.length - 1; i >= 0; i--) {
      const ss = shootingStars[i];
      ss.life++;
      if (ss.life >= ss.maxLife) { shootingStars.splice(i, 1); continue; }
      const trailCol = ss.col + Math.floor((ss.life / ss.maxLife) * 6);
      const trailRow = Math.floor(ss.life / ss.maxLife * 1.5);
      if (trailCol < COLS && trailRow < 2) {
        drawChar(trailCol,     trailRow, "*", NIGHT_COLORS.shootingStar);
        drawChar(trailCol - 1, trailRow, "-", "rgba(220,230,255,0.50)");
        drawChar(trailCol - 2, trailRow, ".", "rgba(220,230,255,0.25)");
      }
    }
  }

  // Surface splashes
  for (let i = surfaceSplashes.length - 1; i >= 0; i--) {
    const s = surfaceSplashes[i];
    const age = timestamp - s.start;
    if (age > s.duration) { surfaceSplashes.splice(i, 1); continue; }
    const splashGlyph = (age / s.duration) < 0.5 ? "^" : "~";
    drawChar(s.col, SURFACE_ROW, splashGlyph, ENV_COLORS.surfaceSplash);
    if (s.width > 1) {
      drawChar(s.col - 1, SURFACE_ROW, "~", ENV_COLORS.surfaceSplash);
      drawChar(s.col + 1, SURFACE_ROW, "~", ENV_COLORS.surfaceSplash);
    }
  }

  // Bubble pops (short-lived surface bursts)
  for (let i = bubblePops.length - 1; i >= 0; i--) {
    const p = bubblePops[i];
    p.life++;
    if (p.life > p.maxLife) { bubblePops.splice(i, 1); continue; }
    drawChar(p.col, p.row, p.life % 4 < 2 ? "*" : "+", ENV_COLORS.bubble);
  }

  // Sparkles (epic_discovery achievement)
  if (hasAchievement("epic_discovery")) {
    if (sparkles.length < MAX_SPARKLES && Math.random() < 0.03) {
      sparkles.push({
        col: Math.floor(Math.random() * COLS),
        row: 1 + Math.floor(Math.random() * (ROCK_ROW - 2)),
        life: 0,
        maxLife: 60 + Math.random() * 90,
      });
    }
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i];
      s.life++;
      if (s.life > s.maxLife) { sparkles.splice(i, 1); continue; }
      drawChar(s.col, s.row, s.life % 30 < 15 ? "\u2726" : "\u2727", ENV_COLORS.sparkle);
    }
  }

  // Bubbles — update position and render
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    b.y -= b.speed;
    b.x += b.drift * 0.05;
    if (b.y <= SURFACE_ROW + 0.2) {
      bubblePops.push({
        col: Math.round(b.x),
        row: SURFACE_ROW,
        life: 0,
        maxLife: 6 + Math.floor(Math.random() * 6),
      });
      bubbles.splice(i, 1);
      continue;
    }
    drawChar(Math.round(b.x), Math.round(b.y), b.big ? "O" : "o", ENV_COLORS.bubble);
  }
}
