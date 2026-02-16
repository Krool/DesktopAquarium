// Creature instance: position, velocity, animation, movement patterns

import { drawChar, COLS, ROWS } from "../renderer/canvas.js";
import { RARITY_COLORS } from "../renderer/colors.js";

const FRAME_DURATION = 500; // 0.5s per animation frame
const ROCK_ROW = ROWS - 2;

export class CreatureInstance {
  constructor(spriteDef, opts = {}) {
    this.sprite = spriteDef;
    this.rarity = spriteDef.rarity;
    this.id = spriteDef.id;

    // Direction: 1 = left-to-right, -1 = right-to-left
    this.direction = opts.direction ?? (Math.random() < 0.5 ? 1 : -1);

    // Position
    const rowConstraints = this.getRowConstraints();
    this.row = opts.row ?? (rowConstraints.min + Math.floor(Math.random() * (rowConstraints.max - rowConstraints.min)));
    this.col = opts.col ?? (this.direction === 1 ? -spriteDef.width : COLS);
    this.exactCol = this.col; // floating point column for smooth movement

    // Velocity (columns per second)
    this.speed = opts.speed ?? this.getDefaultSpeed();

    // Sine oscillation
    this.sineAmplitude = opts.sineAmplitude ?? this.getDefaultSineAmplitude();
    this.sinePeriod = opts.sinePeriod ?? (8 + Math.random() * 4); // 8-12 seconds
    this.sinePhase = Math.random() * Math.PI * 2;
    this.baseRow = this.row;

    // Animation
    this.frameIndex = 0;
    this.lastFrameSwap = 0;

    // Lifetime
    this.lifetime = opts.lifetime ?? (20 + Math.random() * 20); // 20-40 seconds
    this.age = 0;
    this.alive = true;

    // Color override (for discovery flash)
    this.colorOverride = opts.colorOverride ?? null;
    this.colorOverrideEnd = 0;
  }

  getRowConstraints() {
    switch (this.sprite.category) {
      case "bottom":
        return { min: ROCK_ROW - 4, max: ROCK_ROW - this.sprite.height };
      case "floater":
        return { min: 1, max: ROCK_ROW - 5 - this.sprite.height };
      case "heavy":
      case "swimmer":
      default:
        return { min: 1, max: ROCK_ROW - this.sprite.height };
    }
  }

  getDefaultSpeed() {
    switch (this.sprite.category) {
      case "bottom":
        return 0.5 + Math.random() * 0.5; // 0.5-1
      case "floater":
        return 0.5 + Math.random() * 0.5; // 0.5-1
      case "heavy":
        return 0.3 + Math.random() * 0.2; // 0.3-0.5
      case "swimmer":
      default:
        return 1 + Math.random() * 2; // 1-3
    }
  }

  getDefaultSineAmplitude() {
    switch (this.sprite.category) {
      case "bottom":
        return 0; // Bottom dwellers don't oscillate
      case "floater":
        return 3 + Math.random() * 2; // 3-5
      case "heavy":
        return 0.5 + Math.random() * 0.5; // 0.5-1
      case "swimmer":
      default:
        return 1 + Math.random(); // 1-2
    }
  }

  update(deltaSeconds, timestamp) {
    this.age += deltaSeconds;
    if (this.age >= this.lifetime) {
      // Let it drift offscreen
      this.lifetime = Infinity;
    }

    // Update position
    this.exactCol += this.speed * this.direction * deltaSeconds;
    this.col = Math.round(this.exactCol);

    // Sine oscillation
    if (this.sineAmplitude > 0) {
      const sineOffset = Math.sin(
        (timestamp / 1000) * ((2 * Math.PI) / this.sinePeriod) + this.sinePhase
      );
      const constraints = this.getRowConstraints();
      this.row = Math.round(
        Math.max(
          constraints.min,
          Math.min(constraints.max, this.baseRow + sineOffset * this.sineAmplitude)
        )
      );
    }

    // Animation frame cycling
    if (timestamp - this.lastFrameSwap >= FRAME_DURATION) {
      this.frameIndex = (this.frameIndex + 1) % this.sprite.frameCount;
      this.lastFrameSwap = timestamp;
    }

    // Check if offscreen (remove)
    if (this.direction === 1 && this.col > COLS + 2) {
      this.alive = false;
    } else if (this.direction === -1 && this.col < -(this.sprite.width + 2)) {
      this.alive = false;
    }
  }

  render(timestamp) {
    const frames =
      this.direction === -1
        ? this.sprite.mirroredFrames
        : this.sprite.frames;
    const frame = frames[this.frameIndex];

    let color = RARITY_COLORS[this.rarity] || RARITY_COLORS.common;
    if (this.colorOverride && timestamp < this.colorOverrideEnd) {
      color = this.colorOverride;
    }

    for (let r = 0; r < frame.length; r++) {
      const line = frame[r];
      for (let c = 0; c < line.length; c++) {
        if (line[c] !== " ") {
          drawChar(this.col + c, this.row + r, line[c], color);
        }
      }
    }
  }
}
