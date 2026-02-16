// Discovery burst animation and UI display

import { drawString, drawChar, COLS, ROWS } from "../renderer/canvas.js";
import { RARITY_COLORS, ENV_COLORS } from "../renderer/colors.js";

const BURST_DURATION = 500; // 0.5 seconds
const NAME_DISPLAY_DURATION = 3000; // 3 seconds

let activeBurst = null;
let nameDisplay = null;

export function triggerDiscoveryBurst(creatureName, rarity, isNew) {
  const now = performance.now();
  const centerCol = Math.floor(COLS / 2);
  const centerRow = Math.floor(ROWS / 2);

  activeBurst = {
    startTime: now,
    centerCol,
    centerRow,
    rarity,
  };

  if (isNew) {
    nameDisplay = {
      name: creatureName,
      rarity,
      startTime: now,
    };
  }
}

export function renderDiscovery(timestamp) {
  // Render burst animation
  if (activeBurst) {
    const elapsed = timestamp - activeBurst.startTime;
    if (elapsed < BURST_DURATION) {
      const progress = elapsed / BURST_DURATION;
      const ripple = "~~~~~((((())))))~~~~~";
      const visibleLen = Math.floor(ripple.length * progress);
      const start = Math.floor((ripple.length - visibleLen) / 2);
      const visible = ripple.substring(start, start + visibleLen);
      const col = activeBurst.centerCol - Math.floor(visible.length / 2);
      const color = RARITY_COLORS[activeBurst.rarity] || RARITY_COLORS.common;
      drawString(col, activeBurst.centerRow - 2, visible, color);
    } else {
      activeBurst = null;
    }
  }

  // Render name display for new creatures
  if (nameDisplay) {
    const elapsed = timestamp - nameDisplay.startTime;
    if (elapsed < NAME_DISPLAY_DURATION) {
      const color = RARITY_COLORS[nameDisplay.rarity] || RARITY_COLORS.common;
      const text = `* ${nameDisplay.name} *`;
      const col = Math.floor((COLS - text.length) / 2);
      const row = Math.floor(ROWS / 2) + 3;
      drawString(col, row, text, color);
    } else {
      nameDisplay = null;
    }
  }
}

export function isDiscoveryActive() {
  return activeBurst !== null;
}
