// Global leaderboard via Firebase Firestore

import { initializeApp } from "firebase/app";
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

const firebaseConfig = {
  apiKey: "AIzaSyDoUT_dSBkTh_Ie4NeCqoxaeLEeRIsmJR4",
  authDomain: "desktopaquar.firebaseapp.com",
  projectId: "desktopaquar",
  storageBucket: "desktopaquar.firebasestorage.app",
  messagingSenderId: "692782370145",
  appId: "1:692782370145:web:004159cc61ad94497f0920",
};

let db = null;
let playerId = null;
let leaderboardData = []; // [{name, score, rank}]
let myRank = null;
let initialized = false;

export function initLeaderboard() {
  try {
    if (!firebaseConfig.apiKey) {
      console.warn("Firebase not configured - leaderboard disabled");
      return;
    }
    const app = initializeApp(firebaseConfig);
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
  if (!initialized || !db) return;

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
  if (!initialized || !db) return;

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

export function renderLeaderboardRank(timestamp) {
  // Rank is now rendered next to the score in tank.js
}

export function getMyRank() {
  return myRank;
}

export function getLeaderboardData() {
  return leaderboardData;
}

// Refresh leaderboard every 2 minutes
setInterval(() => {
  if (initialized) fetchLeaderboard();
}, 120000);
