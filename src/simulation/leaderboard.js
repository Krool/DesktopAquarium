// Global leaderboard via Firebase Firestore

import {
  getFirestore,
  doc,
  setDoc,
  getDocs,
  collection,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { firebaseConfig, getFirebaseApp } from "./firebase.js";

let db = null;
let playerId = null;
let leaderboardData = []; // [{name, score, rank}]
let myRank = null;
let initialized = false;
let leaderboardEnabled = true;

// Debounce score submissions: multiple discoveries in quick succession only
// result in one Firestore write, using the most recent score values.
const SUBMIT_DEBOUNCE_MS = 60_000;
let submitTimer = null;
let pendingScore = null;

export function setLeaderboardEnabled(enabled) {
  leaderboardEnabled = enabled;
  if (!leaderboardEnabled) {
    myRank = null;
    leaderboardData = [];
    localStorage.removeItem("ascii-reef-rank");
  }
}

export function getLeaderboardEnabled() {
  return leaderboardEnabled;
}

export function initLeaderboard() {
  if (!leaderboardEnabled) return;
  try {
    if (!firebaseConfig.apiKey) {
      console.warn("Firebase not configured - leaderboard disabled");
      return;
    }
    const app = getFirebaseApp();
    if (!app) return;
    db = getFirestore(app);

    // Generate or load a persistent player ID
    playerId = localStorage.getItem("ascii-reef-player-id");
    if (!playerId) {
      playerId = "player_" + Math.random().toString(36).substring(2, 10);
      localStorage.setItem("ascii-reef-player-id", playerId);
    }

    initialized = true;
    // Fetch initial leaderboard
    fetchLeaderboard();
  } catch (e) {
    console.error("Firebase init failed:", e);
  }
}

async function withRetry(fn, label, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt === maxAttempts) {
        console.error(`${label} failed after ${maxAttempts} attempts:`, e);
        return;
      }
      const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export function submitScore(score, uniqueCount) {
  if (!leaderboardEnabled || !initialized || !db) return;

  // Always keep the latest values; cancel any queued submission
  pendingScore = { score, uniqueCount };
  if (submitTimer !== null) {
    clearTimeout(submitTimer);
  }

  submitTimer = setTimeout(async () => {
    submitTimer = null;
    const { score: s, uniqueCount: u } = pendingScore;
    pendingScore = null;

    await withRetry(async () => {
      const playerName =
        localStorage.getItem("ascii-reef-player-name") || playerId;
      await setDoc(doc(db, "leaderboard", playerId), {
        name: playerName,
        score: s,
        creatures: u,
        updatedAt: new Date().toISOString(),
      });

      // Refresh leaderboard after submitting
      await fetchLeaderboard();
    }, "submitScore");
  }, SUBMIT_DEBOUNCE_MS);
}

async function fetchLeaderboard() {
  if (!leaderboardEnabled || !initialized || !db) return;

  await withRetry(async () => {
    const q = query(
      collection(db, "leaderboard"),
      orderBy("score", "desc"),
      limit(100)
    );
    const snapshot = await getDocs(q);

    leaderboardData = [];
    let rank = 1;
    myRank = null;

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const entry = {
        id: docSnap.id,
        name: data.name || docSnap.id,
        score: data.score || 0,
        creatures: data.creatures || 0,
        rank: rank,
      };
      leaderboardData.push(entry);

      if (docSnap.id === playerId) {
        myRank = rank;
        localStorage.setItem("ascii-reef-rank", String(rank));
      }
      rank++;
    });
  }, "fetchLeaderboard");
}

export function getMyRank() {
  return myRank;
}

function getLeaderboardData() {
  return leaderboardData;
}

// Refresh leaderboard every 2 minutes
setInterval(() => {
  if (initialized && leaderboardEnabled) fetchLeaderboard();
}, 120000);
