// Creature instance: position, velocity, animation, movement patterns

import { drawChar, COLS, ROWS } from "../renderer/canvas.js";
import { RARITY_COLORS } from "../renderer/colors.js";
import { spawnBubble, spawnSurfaceSplash, getSurfaceRow } from "./environment.js";

const FRAME_DURATION = 350; // 0.35s per animation frame
const GLOW_COLOR = "#FFF3B0";
const BREACHERS = new Set(["Dolphin", "Orca", "Flying Fish"]);
const DASHERS = new Set(["Octopus"]);
const TAIL_SLAPPERS = new Set(["Whale", "Orca", "Dolphin"]);
const DELIGHT_WINDOWS = {
  common: [12000, 20000],
  uncommon: [10000, 18000],
  rare: [8000, 14000],
  epic: [7000, 12000],
  legendary: [6000, 10000],
};

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
    this.baseSpeed = this.speed;

    // Sine oscillation
    this.sineAmplitude = opts.sineAmplitude ?? this.getDefaultSineAmplitude();
    this.sinePeriod = opts.sinePeriod ?? (5 + Math.random() * 5); // 5-10 seconds
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

    // Delight moments
    this.nextDelightAt = 0;
    this.breach = null;
    this.dashUntil = 0;
    this.tailSlapUntil = 0;
    this.glowPulseUntil = 0;

    // Social behaviors
    this.schoolUntil = 0;
    this.schoolDir = null;
    this.schoolSpeed = null;
    this.schoolCooldownUntil = 0;
    this.fightUntil = 0;
    this.fightBaseCol = 0;
    this.fightCooldownUntil = 0;
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

  scheduleNextDelight(timestamp) {
    const [min, max] = DELIGHT_WINDOWS[this.rarity] || DELIGHT_WINDOWS.common;
    this.nextDelightAt = timestamp + min + Math.random() * (max - min);
  }

  startBreach(timestamp) {
    const surfaceRow = getSurfaceRow();
    const baseRow = Math.min(this.row, surfaceRow + 2);
    this.breach = {
      start: timestamp,
      duration: 1200 + Math.random() * 600,
      baseRow,
      amplitude: 2 + Math.random() * 2,
    };
    spawnSurfaceSplash(this.col + Math.floor(this.sprite.width / 2), timestamp, 2);
  }

  startDash(timestamp) {
    this.dashUntil = timestamp + 800 + Math.random() * 600;
  }

  startTailSlap(timestamp) {
    this.tailSlapUntil = timestamp + 700 + Math.random() * 500;
  }

  startGlowPulse(timestamp) {
    this.glowPulseUntil = timestamp + 1200 + Math.random() * 800;
  }

  startFight(timestamp) {
    this.fightUntil = timestamp + 1400 + Math.random() * 600;
    this.fightBaseCol = this.exactCol;
    this.fightCooldownUntil = timestamp + 6000 + Math.random() * 4000;
  }

  maybeTriggerDelight(timestamp) {
    if (this.nextDelightAt === 0) {
      this.scheduleNextDelight(timestamp);
    }
    if (timestamp < this.nextDelightAt) return;

    const surfaceRow = getSurfaceRow();
    const nearSurface = this.row <= surfaceRow + 2;

    if (BREACHERS.has(this.sprite.name) && nearSurface) {
      this.startBreach(timestamp);
      this.startTailSlap(timestamp);
    } else if (DASHERS.has(this.sprite.name)) {
      this.startDash(timestamp);
    } else if (this.rarity === "legendary") {
      this.startGlowPulse(timestamp);
    } else if (TAIL_SLAPPERS.has(this.sprite.name)) {
      this.startTailSlap(timestamp);
    }

    this.scheduleNextDelight(timestamp);
  }

  update(deltaSeconds, timestamp) {
    this.age += deltaSeconds;
    if (this.age >= this.lifetime) {
      // Let it drift offscreen
      this.lifetime = Infinity;
    }

    // Social or delight moments
    this.maybeTriggerDelight(timestamp);

    // Fighting pause / shake
    if (this.fightUntil > timestamp) {
      this.exactCol = this.fightBaseCol + Math.sin(timestamp / 80) * 0.4;
      this.col = Math.floor(this.exactCol);
    } else {
      let speed = this.baseSpeed;
      if (this.schoolUntil > timestamp && this.schoolSpeed !== null) {
        this.direction = this.schoolDir ?? this.direction;
        speed = (speed + this.schoolSpeed) * 0.5;
      }
      if (this.dashUntil > timestamp) {
        speed *= 2.2;
      }

      // Update position
      this.exactCol += speed * this.direction * deltaSeconds;
      this.col = Math.floor(this.exactCol);
    }

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

    // Breach arc (toward air band)
    if (this.breach) {
      const elapsed = timestamp - this.breach.start;
      const progress = Math.min(1, elapsed / this.breach.duration);
      const rise = Math.sin(Math.PI * progress) * this.breach.amplitude;
      const target = Math.round(this.breach.baseRow - rise);
      this.row = Math.max(0, target);
      if (progress >= 1) {
        this.breach = null;
      }
    }

    // Animation frame cycling
    const frameDuration = this.tailSlapUntil > timestamp ? FRAME_DURATION / 3 : FRAME_DURATION;
    if (timestamp - this.lastFrameSwap >= frameDuration) {
      this.frameIndex = (this.frameIndex + 1) % this.sprite.frameCount;
      this.lastFrameSwap = timestamp;
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
    if (this.glowPulseUntil > timestamp) {
      color = GLOW_COLOR;
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
