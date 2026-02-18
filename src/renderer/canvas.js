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

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Semi-transparent dark blue background
  ctx.fillStyle = "rgba(10, 15, 40, 0.75)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

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
  render();
}

export function startRenderLoop(callback) {
  renderCallback = callback;
  requestAnimationFrame(frameLoop);
}

export { COLS, ROWS, FONT_SIZE };
