// 60x30 character grid rendered on HTML5 Canvas at 24 FPS

const COLS = 60;
const ROWS = 24;
const FONT_SIZE = 14;
const FPS = 24;
const FRAME_INTERVAL = 1000 / FPS;

let canvas, ctx;
let charWidth, charHeight;
let lastFrameTime = 0;
let renderCallback = null;

// Buffer: each cell holds { char, color }
const buffer = [];
for (let i = 0; i < ROWS * COLS; i++) {
  buffer.push({ char: " ", color: null });
}

export function initCanvas(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext("2d");

  ctx.font = `${FONT_SIZE}px "JetBrains Mono", monospace`;
  const metrics = ctx.measureText("M");
  charWidth = Math.ceil(metrics.width);
  charHeight = FONT_SIZE + 2; // line height with small gap

  canvas.width = COLS * charWidth;
  canvas.height = ROWS * charHeight;
  canvas.style.width = canvas.width + "px";
  canvas.style.height = canvas.height + "px";

  return { width: canvas.width, height: canvas.height, charWidth, charHeight };
}

export function clearBuffer() {
  for (let i = 0; i < buffer.length; i++) {
    buffer[i].char = " ";
    buffer[i].color = null;
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

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Semi-transparent dark blue background
  ctx.fillStyle = "rgba(10, 15, 40, 0.75)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

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
