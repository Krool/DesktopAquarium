// Environment rendering: conditionally rendered based on achievement unlocks

import { drawChar, drawFloatingString, drawString, COLS, ROWS, getDayPhase, getCharDimensions } from "../renderer/canvas.js";
import { ENV_COLORS, NIGHT_COLORS } from "../renderer/colors.js";
import { DECORATIONS, SURFACE_DECORATIONS } from "../data/decorations.js";

// Dynamic constants
let ROCK_ROW, SAND_ROW;
const SURFACE_ROW = 2;
const WATER_DENSITY = 0.06;
const WATER_GLYPHS = ["~", ".", "\u00B0", "o"];
const SURFACE_GLYPHS = ["~", "-", "="];
const SAND_TEXTURE_GLYPHS = ["~", ".", ",", "~", "-", ".", ","];
const CORAL = ["  _-_ ", " /   \\", " \\_-_/"];

// State that gets regenerated on resize
let waterParticles = [];
let waterMotes = [];
let waterDriftOffset = 0;
let kelpStalks = [];
let coralPositions = [];
let starfish = [];
let chestCol = null;
let surfaceBoatCol = null;
let surfaceJetCol = null;
let surfaceBirdCols = [];
let surfaceFlockCol = null;

// Achievement-unlocked decoration positions
let clamCol = null;
let shipwreckCol = null;
let volcanoCol = null;
let tridentCol = null;
let keyboardCol = null;
let cursorCol = null;
let musicCol = null;
let trophyCol = null;

// Achievement-gated unlock set
let unlockedSet = new Set();

// Bubbles: organic, spawned from creatures and decorations
const bubbles = [];
const MAX_BUBBLES = 30;

// Sparkle particles for epic_discovery
const sparkles = [];
const MAX_SPARKLES = 8;
const surfaceSplashes = [];
const bubblePops = [];

// Shooting stars (night only)
const shootingStars = [];
const MAX_SHOOTING_STARS = 2;

const MESSAGE_BOTTLE_MIN_GAP_MS = 45000;
const MESSAGE_BOTTLE_SPAWN_CHANCE = 0.0012;
const MESSAGE_BOTTLE_ROW = 1;

let messageBottlesEnabled = false;
let messageBottleReceiveEnabled = false;
let messageBottle = null;
let messageBottleSerial = 0;
let lastMessageBottleSpawnAt = 0;
let lastMessageBottleUpdateAt = 0;

export function getSurfaceRow() {
  return SURFACE_ROW;
}

export function setUnlockedAchievements(achievementSet) {
  unlockedSet = achievementSet;
}

export function hasAchievement(id) {
  return unlockedSet.has(id);
}

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

export function spawnSurfaceSplash(col, timestamp, width = 2) {
  surfaceSplashes.push({
    col,
    width,
    start: timestamp,
    duration: 900 + Math.random() * 600,
  });
}

function placeDecoration(width, existingPositions) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const col = 2 + Math.floor(Math.random() * (COLS - width - 4));
    const overlaps = existingPositions.some(
      (p) => p !== null && Math.abs(p - col) < width + 3
    );
    if (!overlaps) return col;
  }
  return null;
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

  // Floating light motes
  waterMotes = [];
  const moteCount = Math.max(8, Math.floor(COLS * 0.25));
  for (let i = 0; i < moteCount; i++) {
    waterMotes.push({
      col: Math.floor(Math.random() * COLS),
      row: (SURFACE_ROW + 1) + Math.floor(Math.random() * Math.max(1, ROWS - SURFACE_ROW - 3)),
      phase: Math.random() * Math.PI * 2,
      speed: 0.25 + Math.random() * 0.45,
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

  // Place new decorations avoiding kelp and each other
  const kelpCols = kelpStalks.map((k) => k.col);
  const usedPositions = [...kelpCols];
  if (chestCol !== null) usedPositions.push(chestCol);

  clamCol = placeDecoration(4, usedPositions);
  if (clamCol !== null) usedPositions.push(clamCol);

  shipwreckCol = placeDecoration(5, usedPositions);
  if (shipwreckCol !== null) usedPositions.push(shipwreckCol);

  volcanoCol = placeDecoration(4, usedPositions);
  if (volcanoCol !== null) usedPositions.push(volcanoCol);

  tridentCol = placeDecoration(3, usedPositions);
  if (tridentCol !== null) usedPositions.push(tridentCol);

  keyboardCol = placeDecoration(9, usedPositions);
  if (keyboardCol !== null) usedPositions.push(keyboardCol);

  cursorCol = placeDecoration(2, usedPositions);
  if (cursorCol !== null) usedPositions.push(cursorCol);

  musicCol = placeDecoration(5, usedPositions);
  if (musicCol !== null) usedPositions.push(musicCol);

  trophyCol = placeDecoration(3, usedPositions);

  // Surface/sky decorations (air band)
  surfaceBoatCol = placeDecoration(SURFACE_DECORATIONS.boat.width, usedPositions);
  if (surfaceBoatCol !== null) usedPositions.push(surfaceBoatCol);

  surfaceJetCol = placeDecoration(SURFACE_DECORATIONS.jetski.width, usedPositions);
  if (surfaceJetCol !== null) usedPositions.push(surfaceJetCol);

  surfaceFlockCol = placeDecoration(SURFACE_DECORATIONS.flock.width, usedPositions);

  surfaceBirdCols = [];
  const birdCount = Math.max(2, Math.floor(COLS / 30));
  for (let i = 0; i < birdCount; i++) {
    const bCol = placeDecoration(5, usedPositions);
    if (bCol !== null) {
      surfaceBirdCols.push(bCol);
      usedPositions.push(bCol);
    }
  }

  // Clear bubbles, sparkles, and shooting stars on resize
  bubbles.length = 0;
  sparkles.length = 0;
  shootingStars.length = 0;
  bubblePops.length = 0;
}

export function setMessageBottlesEnabled(enabled) {
  messageBottlesEnabled = !!enabled;
  if (!messageBottlesEnabled) {
    messageBottle = null;
  }
}

export function setMessageBottleReceiveEnabled(enabled) {
  messageBottleReceiveEnabled = !!enabled;
}

export function getMessageBottleAtGrid(col, row) {
  if (!messageBottle || row !== messageBottle.row) return null;
  const startCol = Math.round(messageBottle.x);
  if (col < startCol || col >= startCol + messageBottle.glyphs.length) return null;
  return { id: messageBottle.id, mode: messageBottle.mode };
}

function pointInRect(col, row, left, top, width, height) {
  return col >= left && col < left + width && row >= top && row < top + height;
}

export function getMajorDecorationAtGrid(col, row) {
  ROCK_ROW = ROWS - 2;
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;

  if (hasAchievement("starter_tank")) {
    for (const stalk of kelpStalks) {
      const top = ROCK_ROW - stalk.height;
      if (pointInRect(col, row, stalk.col - 2, top, 5, stalk.height)) {
        return { name: "Kelp", col: stalk.col, row: Math.max(1, top) };
      }
    }
  }

  if (hasAchievement("reef_builder")) {
    for (const cCol of coralPositions) {
      const top = ROCK_ROW - CORAL.length;
      if (pointInRect(col, row, cCol, top, CORAL[0].length, CORAL.length)) {
        return { name: "Coral", col: cCol, row: Math.max(1, top) };
      }
    }
  }

  if (hasAchievement("collector")) {
    for (const s of starfish) {
      if (col === s.col && row === ROCK_ROW - 1) {
        return { name: "Starfish", col: s.col, row: Math.max(1, ROCK_ROW - 2) };
      }
    }
  }

  if (hasAchievement("deep_diver") && chestCol !== null) {
    const chestTop = ROCK_ROW - 2;
    if (pointInRect(col, row, chestCol, chestTop, 4, 2)) {
      return { name: "Treasure Chest", col: chestCol, row: Math.max(1, chestTop - 1) };
    }
  }

  if (hasAchievement("marine_biologist") && clamCol !== null) {
    const top = ROCK_ROW - DECORATIONS.clam.height;
    if (pointInRect(col, row, clamCol, top, DECORATIONS.clam.width, DECORATIONS.clam.height)) {
      return { name: "Clam", col: clamCol, row: Math.max(1, top - 1) };
    }
  }

  if (hasAchievement("ocean_explorer") && shipwreckCol !== null) {
    const top = ROCK_ROW - DECORATIONS.shipwreck.height;
    if (pointInRect(col, row, shipwreckCol, top, DECORATIONS.shipwreck.width, DECORATIONS.shipwreck.height)) {
      return { name: "Shipwreck", col: shipwreckCol, row: Math.max(1, top - 1) };
    }
  }

  if (hasAchievement("reef_master") && volcanoCol !== null) {
    const top = ROCK_ROW - DECORATIONS.volcano.height;
    if (pointInRect(col, row, volcanoCol, top, DECORATIONS.volcano.width, DECORATIONS.volcano.height)) {
      return { name: "Volcano", col: volcanoCol, row: Math.max(1, top - 1) };
    }
  }

  if (hasAchievement("completionist") && tridentCol !== null) {
    const top = ROCK_ROW - DECORATIONS.trident.height;
    if (pointInRect(col, row, tridentCol, top, DECORATIONS.trident.width, DECORATIONS.trident.height)) {
      return { name: "Trident", col: tridentCol, row: Math.max(1, top - 1) };
    }
  }

  if (hasAchievement("typist") && keyboardCol !== null) {
    const top = ROCK_ROW - DECORATIONS.keyboard.height;
    if (pointInRect(col, row, keyboardCol, top, DECORATIONS.keyboard.width, DECORATIONS.keyboard.height)) {
      return { name: "Keyboard Coral", col: keyboardCol, row: Math.max(1, top - 1) };
    }
  }

  if (hasAchievement("clicker") && cursorCol !== null) {
    const top = ROCK_ROW - DECORATIONS.cursor.height;
    if (pointInRect(col, row, cursorCol, top, DECORATIONS.cursor.width, DECORATIONS.cursor.height)) {
      return { name: "Cursor Arrow", col: cursorCol, row: Math.max(1, top - 1) };
    }
  }

  if (hasAchievement("dj") && musicCol !== null) {
    const top = ROCK_ROW - DECORATIONS.musicNotes.height;
    if (pointInRect(col, row, musicCol, top, DECORATIONS.musicNotes.width, DECORATIONS.musicNotes.height)) {
      return { name: "Music Notes", col: musicCol, row: Math.max(1, top - 1) };
    }
  }

  if (hasAchievement("top_10") && trophyCol !== null) {
    const top = ROCK_ROW - DECORATIONS.trophy.height;
    if (pointInRect(col, row, trophyCol, top, DECORATIONS.trophy.width, DECORATIONS.trophy.height)) {
      return { name: "Trophy", col: trophyCol, row: Math.max(1, top - 1) };
    }
  }

  return null;
}

export function consumeMessageBottle(id) {
  if (!messageBottle) return null;
  if (typeof id === "number" && messageBottle.id !== id) return null;
  const consumed = { id: messageBottle.id, mode: messageBottle.mode };
  messageBottle = null;
  return consumed;
}

function maybeSpawnMessageBottle(timestamp) {
  if (!messageBottlesEnabled || messageBottle) return;
  if (timestamp - lastMessageBottleSpawnAt < MESSAGE_BOTTLE_MIN_GAP_MS) return;
  if (Math.random() > MESSAGE_BOTTLE_SPAWN_CHANCE) return;

  spawnMessageBottle(timestamp);
}

function spawnMessageBottle(timestamp, forcedMode = null) {
  if (messageBottle) return false;
  const mode = forcedMode === "compose" || forcedMode === "receive"
    ? forcedMode
    : messageBottleReceiveEnabled && Math.random() < 0.5
      ? "receive"
      : "compose";
  const fromLeft = Math.random() < 0.5;
  messageBottle = {
    id: ++messageBottleSerial,
    mode,
    row: MESSAGE_BOTTLE_ROW,
    x: fromLeft ? -4 : COLS + 1,
    dir: fromLeft ? 1 : -1,
    speed: 2.2 + Math.random() * 1.2,
    bobPhase: Math.random() * Math.PI * 2,
    bobSpeed: 1.2 + Math.random() * 0.8,
    glyphs: mode === "compose" ? ["[", "+", "]"] : ["[", "?", "]"],
  };
  lastMessageBottleSpawnAt = timestamp;
  return true;
}

export function forceSpawnMessageBottle(mode = null) {
  return spawnMessageBottle(performance.now(), mode);
}

function updateAndRenderMessageBottle(timestamp) {
  if (!messageBottlesEnabled) return;

  if (lastMessageBottleUpdateAt === 0) {
    lastMessageBottleUpdateAt = timestamp;
  }
  const dt = Math.max(0, (timestamp - lastMessageBottleUpdateAt) / 1000);
  lastMessageBottleUpdateAt = timestamp;

  maybeSpawnMessageBottle(timestamp);
  if (!messageBottle) return;

  messageBottle.x += messageBottle.dir * messageBottle.speed * dt;
  const width = messageBottle.glyphs.length;
  if (messageBottle.dir > 0 && messageBottle.x > COLS + width) {
    messageBottle = null;
    return;
  }
  if (messageBottle.dir < 0 && messageBottle.x < -width - 1) {
    messageBottle = null;
    return;
  }

  const startCol = Math.round(messageBottle.x);
  const color = messageBottle.mode === "compose" ? "rgba(255, 208, 140, 0.92)" : "rgba(214, 236, 255, 0.95)";
  const bobPx = 3 + Math.sin((timestamp / 1000) * messageBottle.bobSpeed + messageBottle.bobPhase) * 1.2;
  drawFloatingString(startCol, messageBottle.row, messageBottle.glyphs.join(""), color, bobPx);
}

// Initial generation
generateAll();

// Re-initialize for new dimensions
export function reinitEnvironment() {
  generateAll();
  lastMessageBottleUpdateAt = 0;
  messageBottle = null;
}

function renderDecoration(art, col, startRow, color) {
  if (col === null) return;
  for (let r = 0; r < art.length; r++) {
    drawString(col, startRow + r, art[r], ENV_COLORS[color] || ENV_COLORS.rock);
  }
}

function renderSurfaceDecoration(frames, col, startRow, frameIdx, color) {
  if (col === null) return;
  const frame = frames[frameIdx % frames.length];
  for (let r = 0; r < frame.length; r++) {
    drawString(col, startRow + r, frame[r], color);
  }
}

export function renderEnvironment(timestamp) {
  ROCK_ROW = ROWS - 2;
  SAND_ROW = ROWS - 1;
  const t = timestamp / 1000;

  // Surface band (top of water)
  const waveShift = Math.floor(t * 2);
  for (let col = 0; col < COLS; col++) {
    const glyph = SURFACE_GLYPHS[(col + waveShift) % SURFACE_GLYPHS.length];
    drawChar(col, SURFACE_ROW, glyph, ENV_COLORS.surface);
  }

  // Day/Night phase
  const { dayness, sourceX, isNight } = getDayPhase();
  const showDay = dayness > 0.3;

  // Sun or moon glyph in sky row 1
  const { charWidth: cw } = getCharDimensions();
  const glyphCol = Math.max(0, Math.min(COLS - 1, Math.floor(sourceX / cw)));
  if (dayness > 0.05) {
    drawChar(glyphCol, 1, "*", NIGHT_COLORS.sunGlyph);
  } else {
    drawChar(glyphCol, 1, "(", NIGHT_COLORS.moonGlyph);
  }

  updateAndRenderMessageBottle(timestamp);

  // Day-only: surface decorations
  const surfaceFrame = Math.floor(t * 2) % 2;
  const birdFrame = Math.floor(t * 4) % 2;
  if (showDay) {
    if (hasAchievement("harbor_pilot")) {
      renderSurfaceDecoration(SURFACE_DECORATIONS.boat.frames, surfaceBoatCol, 0, surfaceFrame, ENV_COLORS.ui);
    }
    if (hasAchievement("jet_wake")) {
      renderSurfaceDecoration(SURFACE_DECORATIONS.jetski.frames, surfaceJetCol, 0, surfaceFrame, ENV_COLORS.ui);
    }
    if (hasAchievement("gull_friend")) {
      for (let i = 0; i < surfaceBirdCols.length; i++) {
        const art = i % 2 === 0 ? SURFACE_DECORATIONS.gull.frames : SURFACE_DECORATIONS.tern.frames;
        renderSurfaceDecoration(art, surfaceBirdCols[i], 0, birdFrame, ENV_COLORS.ui);
      }
    }
    if (hasAchievement("sky_flock")) {
      renderSurfaceDecoration(SURFACE_DECORATIONS.flock.frames, surfaceFlockCol, 0, birdFrame, ENV_COLORS.ui);
    }
  }

  // Night-only: shooting stars
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
        drawChar(trailCol,     trailRow, "*",  NIGHT_COLORS.shootingStar);
        drawChar(trailCol - 1, trailRow, "-",  "rgba(220,230,255,0.50)");
        drawChar(trailCol - 2, trailRow, ".",  "rgba(220,230,255,0.25)");
      }
    }
  }

  // Surface splashes
  for (let i = surfaceSplashes.length - 1; i >= 0; i--) {
    const s = surfaceSplashes[i];
    const age = timestamp - s.start;
    if (age > s.duration) {
      surfaceSplashes.splice(i, 1);
      continue;
    }
    const phase = age / s.duration;
    const splashGlyph = phase < 0.5 ? "^" : "~";
    drawChar(s.col, SURFACE_ROW, splashGlyph, ENV_COLORS.surfaceSplash);
    if (s.width > 1) {
      drawChar(s.col - 1, SURFACE_ROW, "~", ENV_COLORS.surfaceSplash);
      drawChar(s.col + 1, SURFACE_ROW, "~", ENV_COLORS.surfaceSplash);
    }
  }

  // Bubble pops (short-lived)
  for (let i = bubblePops.length - 1; i >= 0; i--) {
    const p = bubblePops[i];
    p.life++;
    if (p.life > p.maxLife) {
      bubblePops.splice(i, 1);
      continue;
    }
    const ch = p.life % 4 < 2 ? "*" : "+";
    drawChar(p.col, p.row, ch, ENV_COLORS.bubble);
  }

  // Water particles - slow drift
  waterDriftOffset = (timestamp / 3000) % COLS;
  const waterColor = hasAchievement("rare_finder")
    ? "rgba(20, 120, 220, 0.35)"
    : ENV_COLORS.water;
  for (const p of waterParticles) {
    const col = Math.floor(p.col + waterDriftOffset) % COLS;
    if (p.row < ROCK_ROW && p.row > SURFACE_ROW) {
      drawChar(col, p.row, p.glyph, waterColor);
    }
  }

  // Slow drifting motes for depth.
  for (const mote of waterMotes) {
    const x = (mote.col + Math.sin(t * mote.speed + mote.phase) * 1.6 + COLS) % COLS;
    const y = mote.row + Math.sin(t * (mote.speed * 0.6) + mote.phase) * 0.6;
    drawChar(Math.round(x), Math.max(SURFACE_ROW + 1, Math.round(y)), "·",
      dayness > 0.5 ? NIGHT_COLORS.moteDay
        : dayness > 0
          ? `rgba(${Math.round(60+dayness*150)},${Math.round(210-dayness*35)},${Math.round(140+dayness*115)},0.22)`
          : NIGHT_COLORS.moteNight);
  }

  // Shimmering water particles (completionist)
  if (hasAchievement("completionist")) {
    const shimmerCount = 3;
    for (let i = 0; i < shimmerCount; i++) {
      const sc = Math.floor((t * 7 + i * 31) % COLS);
      const sr = Math.floor((t * 3 + i * 17) % Math.max(1, ROCK_ROW - 1)) + 1;
      if (sr < ROCK_ROW) {
        const glyph = Math.sin(t * 2 + i) > 0 ? "*" : "+";
        drawChar(sc, sr, glyph, ENV_COLORS.shimmerWater);
      }
    }
  }

  // Sparkle particles (epic_discovery)
  if (hasAchievement("epic_discovery")) {
    // Spawn new sparkles
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
      if (s.life > s.maxLife) {
        sparkles.splice(i, 1);
        continue;
      }
      const glyph = s.life % 30 < 15 ? "\u2726" : "\u2727";
      drawChar(s.col, s.row, glyph, ENV_COLORS.sparkle);
    }
  }

  // Rock line
  for (let col = 0; col < COLS; col++) {
    drawChar(col, ROCK_ROW, "_", ENV_COLORS.rock);
  }

  // Sand row — textured after first_catch, plain otherwise
  if (hasAchievement("first_catch")) {
    const sandColor = hasAchievement("legendary_encounter")
      ? ENV_COLORS.goldenSand
      : ENV_COLORS.sand;
    for (let col = 0; col < COLS; col++) {
      const g = SAND_TEXTURE_GLYPHS[col % SAND_TEXTURE_GLYPHS.length];
      drawChar(col, SAND_ROW, g, sandColor);
    }
  } else {
    // Bare sand — minimal dots
    for (let col = 0; col < COLS; col++) {
      if (col % 4 === 0) drawChar(col, SAND_ROW, ".", ENV_COLORS.sand);
    }
  }

  // Kelp - per-segment sway (starter_tank)
  if (hasAchievement("starter_tank")) {
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
  }

  // Coral (reef_builder)
  if (hasAchievement("reef_builder")) {
    for (const cCol of coralPositions) {
      const startRow = ROCK_ROW - CORAL.length;
      for (let r = 0; r < CORAL.length; r++) {
        drawString(cCol, startRow + r, CORAL[r], ENV_COLORS.coral);
      }
    }
  }

  // Starfish on sand (collector)
  if (hasAchievement("collector")) {
    for (const s of starfish) {
      drawChar(s.col, ROCK_ROW - 1, "*", ENV_COLORS.star);
    }
  }

  // Treasure chest on sand (deep_diver)
  if (hasAchievement("deep_diver")) {
    if (chestCol !== null) {
      drawString(chestCol, ROCK_ROW - 2, "____", ENV_COLORS.chest);
      drawString(chestCol, ROCK_ROW - 1, "|$$|", ENV_COLORS.chest);
    }
    // Occasional bubbles from chest
    if (chestCol !== null && Math.random() < 0.008) {
      spawnBubble(chestCol + 2, ROCK_ROW - 3);
    }
  }

  // Animated clam (marine_biologist)
  if (hasAchievement("marine_biologist") && clamCol !== null) {
    const frameIdx = Math.floor(t * 0.5) % 2;
    const frame = DECORATIONS.clam.frames[frameIdx];
    renderDecoration(frame, clamCol, ROCK_ROW - 2, "clam");
  }

  // Shipwreck (ocean_explorer)
  if (hasAchievement("ocean_explorer") && shipwreckCol !== null) {
    renderDecoration(
      DECORATIONS.shipwreck.art,
      shipwreckCol,
      ROCK_ROW - DECORATIONS.shipwreck.height,
      "shipwreck"
    );
  }

  // Volcano rock with rising bubble column (reef_master)
  if (hasAchievement("reef_master") && volcanoCol !== null) {
    renderDecoration(
      DECORATIONS.volcano.art,
      volcanoCol,
      ROCK_ROW - DECORATIONS.volcano.height,
      "volcano"
    );
    // Bubble column from volcano
    if (Math.random() < 0.04) {
      spawnBubble(volcanoCol + 1, ROCK_ROW - DECORATIONS.volcano.height - 1);
    }
  }

  // Golden trident (completionist)
  if (hasAchievement("completionist") && tridentCol !== null) {
    renderDecoration(
      DECORATIONS.trident.art,
      tridentCol,
      ROCK_ROW - DECORATIONS.trident.height,
      "trident"
    );
  }

  // Keyboard coral (typist)
  if (hasAchievement("typist") && keyboardCol !== null) {
    renderDecoration(DECORATIONS.keyboard.art, keyboardCol, ROCK_ROW - 1, "keyboard");
  }

  // Cursor arrow (clicker)
  if (hasAchievement("clicker") && cursorCol !== null) {
    renderDecoration(
      DECORATIONS.cursor.art,
      cursorCol,
      ROCK_ROW - DECORATIONS.cursor.height,
      "cursor"
    );
  }

  // Music notes (dj)
  if (hasAchievement("dj") && musicCol !== null) {
    renderDecoration(DECORATIONS.musicNotes.art, musicCol, ROCK_ROW - 1, "musicNotes");
  }

  // Trophy (top_10)
  if (hasAchievement("top_10") && trophyCol !== null) {
    renderDecoration(
      DECORATIONS.trophy.art,
      trophyCol,
      ROCK_ROW - DECORATIONS.trophy.height,
      "trophy"
    );
  }

  // Update and render bubbles (gated by getting_hooked in spawnBubble)
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
    const ch = b.big ? "O" : "o";
    drawChar(Math.round(b.x), Math.round(b.y), ch, ENV_COLORS.bubble);
  }
}
