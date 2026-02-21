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

export async function submitScore(score, uniqueCount) {
  if (!leaderboardEnabled || !initialized || !db) return;

  try {
    const playerName =
      localStorage.getItem("ascii-reef-player-name") || playerId;
    await setDoc(doc(db, "leaderboard", playerId), {
      name: playerName,
      score: score,
      creatures: uniqueCount,
      updatedAt: new Date().toISOString(),
    });

    // Refresh leaderboard after submitting
    await fetchLeaderboard();
  } catch (e) {
    console.error("Failed to submit score:", e);
  }
}

async function fetchLeaderboard() {
  if (!leaderboardEnabled || !initialized || !db) return;

  try {
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
  } catch (e) {
    console.error("Failed to fetch leaderboard:", e);
  }
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
