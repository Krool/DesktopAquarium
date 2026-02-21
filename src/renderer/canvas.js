// Character grid rendered on HTML5 Canvas at 30 FPS
// COLS and ROWS are mutable — updated via resizeCanvas()

import { NIGHT_COLORS } from "./colors.js";

let COLS = 60;
let ROWS = 24;
const FONT_SIZE = 14;
const FPS = 30;
const FRAME_INTERVAL = 1000 / FPS;

let canvas, ctx;
let charWidth, charHeight;
let lastFrameTime = 0;
let lastRenderTimestamp = 0;
let renderCallback = null;
let dayNightCycle = "computer";
let floatingText = [];

// Buffer: each cell holds { char, color }
let buffer = [];
// Background buffer: each cell holds a bg color or null
let bgBuffer = [];
function allocBuffer() {
  buffer = [];
  bgBuffer = [];
  for (let i = 0; i < ROWS * COLS; i++) {
    buffer.push({ char: " ", color: null });
    bgBuffer.push(null);
  }
}
allocBuffer();

export function initCanvas(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext("2d");

  ctx.font = `${FONT_SIZE}px "JetBrains Mono", monospace`;
  const metrics = ctx.measureText("M");
  charWidth = Math.ceil(metrics.width);
  charHeight = FONT_SIZE + 2;

  canvas.width = COLS * charWidth;
  canvas.height = ROWS * charHeight;
  canvas.style.width = canvas.width + "px";
  canvas.style.height = canvas.height + "px";

  return { width: canvas.width, height: canvas.height, charWidth, charHeight };
}

// Resize the grid and canvas to new dimensions
export function resizeCanvas(cols, rows) {
  COLS = cols;
  ROWS = rows;
  allocBuffer();

  if (canvas && ctx) {
    ctx.font = `${FONT_SIZE}px "JetBrains Mono", monospace`;
    const metrics = ctx.measureText("M");
    charWidth = Math.ceil(metrics.width);
    charHeight = FONT_SIZE + 2;

    canvas.width = COLS * charWidth;
    canvas.height = ROWS * charHeight;
    canvas.style.width = canvas.width + "px";
    canvas.style.height = canvas.height + "px";
  }

  return { width: canvas?.width || 0, height: canvas?.height || 0 };
}

export function getCharDimensions() {
  return { charWidth, charHeight };
}

export function clearBuffer() {
  for (let i = 0; i < buffer.length; i++) {
    buffer[i].char = " ";
    buffer[i].color = null;
    bgBuffer[i] = null;
  }
  floatingText = [];
}

export function drawChar(col, row, char, color) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
  const idx = row * COLS + col;
  buffer[idx].char = char;
  buffer[idx].color = color;
}

export function clearCell(col, row) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
  const idx = row * COLS + col;
  buffer[idx].char = " ";
  buffer[idx].color = null;
}


export function drawString(col, row, str, color) {
  for (let i = 0; i < str.length; i++) {
    if (str[i] !== " ") {
      drawChar(col + i, row, str[i], color);
    }
  }
}

export function drawFloatingString(col, row, str, color, offsetY = 0) {
  floatingText.push({ col, row, str, color, offsetY });
}

// Draw a background rectangle (cell-aligned)
export function drawBg(col, row, width, height, bgColor) {
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const cc = col + c;
      const rr = row + r;
      if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS) continue;
      bgBuffer[rr * COLS + cc] = bgColor;
    }
  }
}

// Draw a string with a background behind it
export function drawStringBg(col, row, str, color, bgColor) {
  drawBg(col, row, str.length, 1, bgColor);
  drawString(col, row, str, color);
}

export function getDayPhase() {
  if (dayNightCycle === "computer") {
    const now = new Date();
    const min = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const NIGHT_END = 330;   // 5:30
    const DAWN_END  = 450;   // 7:30
    const DAY_END   = 1050;  // 17:30
    const DUSK_END  = 1170;  // 19:30

    let dayness, warmth;
    if      (min < NIGHT_END) { dayness = 0; warmth = 0; }
    else if (min < DAWN_END)  { const t = (min-NIGHT_END)/(DAWN_END-NIGHT_END); dayness = t; warmth = Math.sin(t*Math.PI); }
    else if (min < DAY_END)   { dayness = 1; warmth = 0; }
    else if (min < DUSK_END)  { const t = (min-DAY_END)/(DUSK_END-DAY_END); dayness = 1-t; warmth = Math.sin(t*Math.PI); }
    else                       { dayness = 0; warmth = 0; }

    const sunNorm = Math.max(0, Math.min(1, (min - NIGHT_END) / (DUSK_END - NIGHT_END)));
    let sourceX;
    if (dayness > 0 || warmth > 0 || (min >= NIGHT_END && min < DUSK_END)) {
      sourceX = (canvas?.width ?? 540) * (0.05 + sunNorm * 0.90);
    } else {
      const nightDur = (1440 - DUSK_END) + NIGHT_END;
      const nightMin = min >= DUSK_END ? min - DUSK_END : (1440 - DUSK_END) + min;
      const moonNorm = nightMin / nightDur;
      sourceX = (canvas?.width ?? 540) * (0.95 - moonNorm * 0.90);
    }

    return { dayness, warmth, sourceX, isNight: dayness === 0 && warmth === 0 };
  }

  const cycleHalfMsByMode = {
    "5min": 5 * 60 * 1000,
    "10min": 10 * 60 * 1000,
    "60min": 60 * 60 * 1000,
    "3hours": 3 * 60 * 60 * 1000,
  };
  const halfMs = cycleHalfMsByMode[dayNightCycle] ?? cycleHalfMsByMode["60min"];
  const cycleMs = halfMs * 2;
  const elapsed = Date.now() % cycleMs;
  const inDay = elapsed < halfMs;

  if (inDay) {
    const progress = elapsed / halfMs;
    const sourceX = (canvas?.width ?? 540) * (0.05 + progress * 0.90);
    return { dayness: 1, warmth: 0, sourceX, isNight: false };
  }

  const progress = (elapsed - halfMs) / halfMs;
  const sourceX = (canvas?.width ?? 540) * (0.95 - progress * 0.90);
  return { dayness: 0, warmth: 0, sourceX, isNight: true };
}

export function setDayNightCycle(mode) {
  const validModes = new Set(["computer", "5min", "10min", "60min", "3hours"]);
  dayNightCycle = validModes.has(mode) ? mode : "computer";
}

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpRgba(c0, c1, t) {
  const p = (s) => s.match(/[\d.]+/g).map(Number);
  const [r0,g0,b0,a0] = p(c0), [r1,g1,b1,a1] = p(c1);
  return `rgba(${Math.round(lerp(r0,r1,t))},${Math.round(lerp(g0,g1,t))},${Math.round(lerp(b0,b1,t))},${lerp(a0,a1,t).toFixed(3)})`;
}

const STAR_COUNT = 60;
const stars = Array.from({ length: STAR_COUNT }, () => ({
  xFrac: Math.random(),
  yFrac: Math.random() * 0.85,
  size: Math.random() < 0.15 ? 1.5 : 1.0,
  twinklePhase: Math.random() * Math.PI * 2,
  twinkleSpeed: 0.4 + Math.random() * 0.8,
}));

function drawWaterLighting(timestamp) {
  const t = timestamp / 1000;
  const waterlineY = charHeight * 2.5;
  const { dayness, warmth, sourceX, isNight } = getDayPhase();

  // Sky gradient
  const skyTop = isNight
    ? NIGHT_COLORS.skyNight
    : warmth > 0
      ? lerpRgba(lerpRgba(NIGHT_COLORS.skyNight, NIGHT_COLORS.skyDawnTop, Math.min(dayness + warmth, 1)), NIGHT_COLORS.skyDay, dayness)
      : NIGHT_COLORS.skyDay;
  const skyHoriz = warmth > 0
    ? lerpRgba(lerpRgba(NIGHT_COLORS.skyNightHoriz, NIGHT_COLORS.skyDawn1, warmth), NIGHT_COLORS.skyDayHoriz, dayness)
    : isNight ? NIGHT_COLORS.skyNightHoriz : NIGHT_COLORS.skyDayHoriz;
  const skyGrad = ctx.createLinearGradient(0, 0, 0, waterlineY);
  skyGrad.addColorStop(0,   skyTop);
  skyGrad.addColorStop(0.6, skyTop);
  skyGrad.addColorStop(1,   skyHoriz);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, canvas.width, waterlineY);

  // Stars (fade with dayness)
  const starAlpha = Math.max(0, 1 - dayness * 2.5 - warmth * 1.5);
  if (starAlpha > 0.01) {
    ctx.save();
    for (const star of stars) {
      const sx = star.xFrac * canvas.width;
      const sy = star.yFrac * waterlineY;
      ctx.globalAlpha = starAlpha * (0.6 + 0.4 * Math.sin(t * star.twinkleSpeed + star.twinklePhase));
      ctx.fillStyle = "#D8E8FF";
      ctx.fillRect(Math.round(sx), Math.round(sy), star.size, star.size);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Sun glow
  if (dayness > 0 || warmth > 0) {
    const sa = Math.max(dayness, warmth * 0.6);
    const sg = ctx.createRadialGradient(sourceX, waterlineY * 0.38, 0, sourceX, waterlineY * 0.38, canvas.width * 0.38);
    sg.addColorStop(0, `rgba(255,220,120,${(0.30*sa).toFixed(3)})`);
    sg.addColorStop(1, `rgba(28,62,110,0)`);
    ctx.fillStyle = sg; ctx.fillRect(0, 0, canvas.width, waterlineY);
  }

  // Moon glow
  if (isNight) {
    const mg = ctx.createRadialGradient(sourceX, waterlineY * 0.38, 0, sourceX, waterlineY * 0.38, canvas.width * 0.30);
    mg.addColorStop(0, `rgba(160,190,230,0.18)`);
    mg.addColorStop(1, `rgba(4,8,28,0)`);
    ctx.fillStyle = mg; ctx.fillRect(0, 0, canvas.width, waterlineY);
  }

  // Water gradient
  const waterGrad = ctx.createLinearGradient(0, waterlineY, 0, canvas.height);
  waterGrad.addColorStop(0,    lerpRgba(NIGHT_COLORS.waterNightTop,  NIGHT_COLORS.waterDayTop,  dayness));
  waterGrad.addColorStop(0.25, lerpRgba(NIGHT_COLORS.waterNightMid,  NIGHT_COLORS.waterDayMid,  dayness));
  waterGrad.addColorStop(0.60, lerpRgba(NIGHT_COLORS.waterNightMid,  NIGHT_COLORS.waterDayBot,  dayness));
  waterGrad.addColorStop(1,    lerpRgba(NIGHT_COLORS.waterNightDeep, NIGHT_COLORS.waterDayDeep, dayness));
  ctx.fillStyle = waterGrad;
  ctx.fillRect(0, waterlineY, canvas.width, canvas.height - waterlineY);

  // Surface entry glow (sourced at sourceX)
  const sg2 = ctx.createRadialGradient(sourceX, waterlineY, canvas.width*0.03, sourceX, waterlineY, canvas.width*0.55);
  sg2.addColorStop(0,    dayness > 0 ? `rgba(214,243,255,${(0.22*dayness).toFixed(3)})` : `rgba(140,170,220,0.08)`);
  sg2.addColorStop(0.35, dayness > 0 ? `rgba(108,201,255,${(0.12*dayness).toFixed(3)})` : `rgba(80,120,180,0.05)`);
  sg2.addColorStop(1, `rgba(0,0,0,0)`);
  ctx.fillStyle = sg2;
  ctx.fillRect(0, waterlineY, canvas.width, canvas.height - waterlineY);

  // Light shafts — pinned to sourceX at top, fanning at bottom
  const beamOp = dayness > 0 ? dayness : (1 - dayness) * 0.35;
  const b0 = dayness > 0
    ? `rgba(180,240,255,${(0.15*beamOp).toFixed(3)})`
    : `rgba(100,160,210,${(0.08*beamOp).toFixed(3)})`;
  const b1 = dayness > 0
    ? `rgba(120,207,255,${(0.07*beamOp).toFixed(3)})`
    : `rgba(70,120,180,${(0.04*beamOp).toFixed(3)})`;
  const fanOffsets = [-0.22, 0, 0.22];
  for (let i = 0; i < 3; i++) {
    const bw = canvas.width * (0.07 + i * 0.02);
    const cBot = sourceX + (fanOffsets[i] + Math.sin(t*(0.2+i*0.1))*0.03) * canvas.width;
    const bg = ctx.createLinearGradient(sourceX, waterlineY, cBot, canvas.height);
    bg.addColorStop(0, b0); bg.addColorStop(0.45, b1); bg.addColorStop(1, `rgba(0,0,0,0)`);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(sourceX - bw*0.2, waterlineY);
    ctx.lineTo(sourceX + bw*0.2, waterlineY);
    ctx.lineTo(cBot + bw, canvas.height);
    ctx.lineTo(cBot - bw, canvas.height);
    ctx.closePath(); ctx.fill();
  }

  // Night waterline shimmer
  if (isNight || dayness < 0.15) {
    const shAlpha = (1 - dayness) * 0.18;
    const shGrad = ctx.createLinearGradient(0, waterlineY-1, 0, waterlineY+2);
    shGrad.addColorStop(0,   `rgba(180,200,240,0)`);
    shGrad.addColorStop(0.5, `rgba(180,200,240,${shAlpha.toFixed(3)})`);
    shGrad.addColorStop(1,   `rgba(180,200,240,0)`);
    ctx.fillStyle = shGrad;
    ctx.fillRect(Math.sin(t*1.1)*canvas.width*0.03, waterlineY-1, canvas.width, 3);
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawWaterLighting(lastRenderTimestamp);

  // Draw cell backgrounds
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const bg = bgBuffer[row * COLS + col];
      if (bg) {
        ctx.fillStyle = bg;
        ctx.fillRect(col * charWidth, row * charHeight, charWidth, charHeight);
      }
    }
  }

  // Draw text
  ctx.font = `${FONT_SIZE}px "JetBrains Mono", monospace`;
  ctx.textBaseline = "top";

  let currentColor = null;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = buffer[row * COLS + col];
      if (cell.char === " " || !cell.color) continue;
      if (cell.color !== currentColor) {
        currentColor = cell.color;
        ctx.fillStyle = currentColor;
      }
      ctx.fillText(cell.char, col * charWidth, row * charHeight);
    }
  }

  // Draw floating text overlays (used for subtle sub-cell bobbing effects)
  for (const item of floatingText) {
    ctx.fillStyle = item.color;
    for (let i = 0; i < item.str.length; i++) {
      const ch = item.str[i];
      if (ch === " ") continue;
      ctx.fillText(ch, (item.col + i) * charWidth, item.row * charHeight + item.offsetY);
    }
  }
}

function frameLoop(timestamp) {
  requestAnimationFrame(frameLoop);
  const delta = timestamp - lastFrameTime;
  if (delta < FRAME_INTERVAL) return;
  lastFrameTime = timestamp - (delta % FRAME_INTERVAL);

  clearBuffer();
  if (renderCallback) {
    renderCallback(timestamp);
  }
  lastRenderTimestamp = timestamp;
  render();
}

export function startRenderLoop(callback) {
  renderCallback = callback;
  requestAnimationFrame(frameLoop);
}

export { COLS, ROWS };
