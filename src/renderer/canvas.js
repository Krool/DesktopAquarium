// Character grid rendered on HTML5 Canvas at 24 FPS
// COLS and ROWS are mutable — updated via resizeTank()

let COLS = 60;
let ROWS = 24;
const FONT_SIZE = 14;
const FPS = 24;
const FRAME_INTERVAL = 1000 / FPS;

let canvas, ctx;
let charWidth, charHeight;
let lastFrameTime = 0;
let lastRenderTimestamp = 0;
let renderCallback = null;

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
}

export function drawChar(col, row, char, color) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
  const idx = row * COLS + col;
  buffer[idx].char = char;
  buffer[idx].color = color;
}

export function drawString(col, row, str, color) {
  for (let i = 0; i < str.length; i++) {
    if (str[i] !== " ") {
      drawChar(col + i, row, str[i], color);
    }
  }
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

function drawWaterLighting(timestamp) {
  const t = timestamp / 1000;

  // Deep-water base gradient with slight breathing motion.
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "rgba(26, 71, 150, 0.38)");
  gradient.addColorStop(0.45, "rgba(11, 48, 118, 0.30)");
  gradient.addColorStop(1, "rgba(6, 16, 54, 0.78)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Sun glow near the surface.
  const sunX = canvas.width * (0.35 + Math.sin(t * 0.17) * 0.06);
  const sunGradient = ctx.createRadialGradient(
    sunX,
    -canvas.height * 0.05,
    canvas.width * 0.03,
    sunX,
    -canvas.height * 0.05,
    canvas.width * 0.55
  );
  sunGradient.addColorStop(0, "rgba(214, 243, 255, 0.28)");
  sunGradient.addColorStop(0.35, "rgba(108, 201, 255, 0.16)");
  sunGradient.addColorStop(1, "rgba(20, 82, 166, 0)");
  ctx.fillStyle = sunGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Slow-moving light shafts.
  for (let i = 0; i < 3; i++) {
    const beamWidth = canvas.width * (0.08 + i * 0.02);
    const centerX =
      canvas.width * (0.2 + i * 0.25) + Math.sin(t * (0.2 + i * 0.1)) * 34;
    const beamGradient = ctx.createLinearGradient(centerX, 0, centerX, canvas.height);
    beamGradient.addColorStop(0, "rgba(180, 240, 255, 0.15)");
    beamGradient.addColorStop(0.45, "rgba(120, 207, 255, 0.07)");
    beamGradient.addColorStop(1, "rgba(90, 170, 230, 0)");
    ctx.fillStyle = beamGradient;

    ctx.beginPath();
    ctx.moveTo(centerX - beamWidth * 0.34, 0);
    ctx.lineTo(centerX + beamWidth * 0.34, 0);
    ctx.lineTo(centerX + beamWidth, canvas.height);
    ctx.lineTo(centerX - beamWidth, canvas.height);
    ctx.closePath();
    ctx.fill();
  }

  // Caustic shimmer arcs.
  ctx.strokeStyle = "rgba(190, 238, 255, 0.11)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const y = (i / 12) * canvas.height;
    const phase = t * (0.8 + i * 0.04) + i * 0.8;
    const x = (Math.sin(phase) * 0.5 + 0.5) * canvas.width;
    ctx.beginPath();
    ctx.ellipse(x, y, 16 + (i % 4) * 8, 5 + (i % 3), 0, 0, Math.PI * 2);
    ctx.stroke();
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

export { COLS, ROWS, FONT_SIZE };
