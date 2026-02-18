// Creature instance: position, velocity, animation, movement patterns

import { drawChar, COLS, ROWS } from "../renderer/canvas.js";
import { RARITY_COLORS } from "../renderer/colors.js";
import { spawnBubble } from "./environment.js";

const FRAME_DURATION_BY_CATEGORY = {
  swimmer: { min: 180, max: 300 },
  floater: { min: 260, max: 420 },
  bottom: { min: 300, max: 520 },
  heavy: { min: 360, max: 580 },
};

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

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
    this.sinePeriod = opts.sinePeriod ?? randomRange(5, 10); // 5-10 seconds
    this.sinePhase = Math.random() * Math.PI * 2;
    this.baseRow = this.row;

    // Animation
    this.frameIndex = Math.floor(Math.random() * this.sprite.frameCount);
    this.frameDuration = opts.frameDuration ?? this.getFrameDuration();
    this.frameProgress = Math.random() * this.frameDuration;
    this.exactRow = this.row;

    // Lifetime
    this.lifetime = opts.lifetime ?? (20 + Math.random() * 20); // 20-40 seconds
    this.age = 0;
    this.alive = true;

    // Color override (for discovery flash)
    this.colorOverride = opts.colorOverride ?? null;
    this.colorOverrideEnd = 0;
  }

  getRowConstraints() {
    const rockRow = ROWS - 2;
    switch (this.sprite.category) {
      case "bottom":
        // Pinned to the floor — sit right on the rock line
        return { min: rockRow - this.sprite.height, max: rockRow - this.sprite.height };
      case "floater":
        // Upper water only — never near the floor
        return { min: 1, max: Math.max(2, Math.floor(rockRow * 0.5)) };
      case "heavy":
        // Mid to low water — big creatures roam the lower half
        return { min: 2, max: rockRow - this.sprite.height - 2 };
      case "swimmer":
      default:
        // Mid water — avoid the floor area
        return { min: 1, max: rockRow - this.sprite.height - 3 };
    }
  }

  getDefaultSpeed() {
    switch (this.sprite.category) {
      case "bottom":
        return 0.3 + Math.random() * 0.4; // 0.3-0.7
      case "floater":
        return 0.25 + Math.random() * 0.35; // 0.25-0.6
      case "heavy":
        return 0.2 + Math.random() * 0.3; // 0.2-0.5
      case "swimmer":
      default:
        return 0.5 + Math.random() * 0.8; // 0.5-1.3
    }
  }

  getFrameDuration() {
    const range = FRAME_DURATION_BY_CATEGORY[this.sprite.category] || FRAME_DURATION_BY_CATEGORY.swimmer;
    return randomRange(range.min, range.max);
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
    this.col = Math.floor(this.exactCol);

    // Sine oscillation
    if (this.sineAmplitude > 0) {
      const sineOffset = Math.sin(
        (timestamp / 1000) * ((2 * Math.PI) / this.sinePeriod) + this.sinePhase
      );
      const constraints = this.getRowConstraints();
      this.exactRow = Math.max(
        constraints.min,
        Math.min(constraints.max, this.baseRow + sineOffset * this.sineAmplitude)
      );
      this.row = Math.round(this.exactRow);
    }

    // Animation frame cycling
    this.frameProgress += deltaSeconds * 1000;
    if (this.frameProgress >= this.frameDuration) {
      this.frameIndex = (this.frameIndex + 1) % this.sprite.frameCount;
      this.frameProgress %= this.frameDuration;
    }

    // Occasionally spawn bubbles from mouth
    if (this.sprite.category !== "bottom" && Math.random() < 0.004) {
      const mouthCol = this.direction === 1
        ? this.col + this.sprite.width
        : this.col - 1;
      spawnBubble(mouthCol, this.row);
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
