// Discovery burst animation and UI display

import { drawString, drawStringBg, drawBg, drawChar, COLS, ROWS } from "../renderer/canvas.js";
import { RARITY_COLORS, ENV_COLORS } from "../renderer/colors.js";

const BURST_DURATION = 500; // 0.5 seconds
const NAME_DISPLAY_DURATION = 3000; // 3 seconds
const NOTIFICATION_BG = "rgba(0, 0, 0, 0.6)";

let activeBurst = null;
let nameDisplay = null;
let achievementToast = null;
const achievementQueue = [];
const ACHIEVEMENT_TOAST_DURATION = 3000;

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
      drawStringBg(col, activeBurst.centerRow - 2, visible, color, NOTIFICATION_BG);
    } else {
      activeBurst = null;
    }
  }

  // Render achievement toast (queued)
  if (!achievementToast && achievementQueue.length > 0) {
    const next = achievementQueue.shift();
    achievementToast = { ...next, startTime: timestamp };
  }
  if (achievementToast) {
    const elapsed = timestamp - achievementToast.startTime;
    if (elapsed < ACHIEVEMENT_TOAST_DURATION) {
      const line1 = "* ACHIEVEMENT UNLOCKED *";
      const line2 = achievementToast.name;
      const line3 = achievementToast.unlock;
      const row = Math.floor(ROWS / 2) + 5;
      // Background block behind all 3 lines
      const maxLen = Math.max(line1.length, line2.length, line3.length) + 2;
      const bgCol = Math.floor((COLS - maxLen) / 2);
      drawBg(bgCol, row, maxLen, 3, NOTIFICATION_BG);
      drawString(Math.floor((COLS - line1.length) / 2), row, line1, ENV_COLORS.star);
      drawString(Math.floor((COLS - line2.length) / 2), row + 1, line2, ENV_COLORS.star);
      drawString(Math.floor((COLS - line3.length) / 2), row + 2, line3, ENV_COLORS.ui);
    } else {
      achievementToast = null;
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
      drawStringBg(col, row, text, color, NOTIFICATION_BG);
    } else {
      nameDisplay = null;
    }
  }
}

export function triggerAchievementToast(name, unlock) {
  achievementQueue.push({ name, unlock });
}

function isDiscoveryActive() {
  return activeBurst !== null;
}
