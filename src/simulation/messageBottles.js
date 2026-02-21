// Firebase Firestore CRUD for shared message-in-a-bottle messages.
// Messages are stored globally in the "bottle_messages" collection.
// Players can compose (add), receive (read random), send along (re-insert), or trash (delete).
import { collection, addDoc, deleteDoc, doc, getDocs, getFirestore, limit, orderBy, query, serverTimestamp } from "firebase/firestore";
import { getFirebaseApp } from "./firebase.js";

const COLLECTION_NAME = "bottle_messages";
const MAX_FETCH = 100;
const MAX_MESSAGE_LENGTH = 280;

let db = null;
let initialized = false;

export function initMessageBottles() {
  if (initialized && db) return true;
  try {
    const app = getFirebaseApp();
    if (!app) return false;
    db = getFirestore(app);
    initialized = true;
    return true;
  } catch (err) {
    console.error("Message bottle Firebase init failed:", err);
    return false;
  }
}

function cleanMessage(text) {
  return (text || "").replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE_LENGTH);
}

export async function addGlobalBottleMessage(text) {
  const clean = cleanMessage(text);
  if (!clean) return null;
  if (!initMessageBottles() || !db) return null;
  const ref = await addDoc(collection(db, COLLECTION_NAME), {
    text: clean,
    createdAt: serverTimestamp(),
    createdAtIso: new Date().toISOString(),
  });
  return { id: ref.id, text: clean };
}

export async function getRandomGlobalBottleMessage() {
  if (!initMessageBottles() || !db) return null;
  const q = query(collection(db, COLLECTION_NAME), orderBy("createdAt", "desc"), limit(MAX_FETCH));
  const snapshot = await getDocs(q);
  const docs = [];
  snapshot.forEach((snap) => {
    const data = snap.data() || {};
    const text = cleanMessage(data.text || "");
    if (!text) return;
    docs.push({ id: snap.id, text });
  });
  if (docs.length === 0) return null;
  return docs[Math.floor(Math.random() * docs.length)];
}

export async function trashGlobalBottleMessage(id) {
  if (!id || !initMessageBottles() || !db) return false;
  await deleteDoc(doc(db, COLLECTION_NAME, id));
  return true;
}

export async function hasAnyGlobalBottleMessages() {
  if (!initMessageBottles() || !db) return false;
  const q = query(collection(db, COLLECTION_NAME), limit(1));
  const snapshot = await getDocs(q);
  return !snapshot.empty;
}
