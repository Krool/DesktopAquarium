// Firebase app initialization (shared singleton).
// Note: Firebase web API keys are public client identifiers — not secrets.
// Access control is enforced via Firestore security rules on the server.
import { getApp, getApps, initializeApp } from "firebase/app";

export const firebaseConfig = {
  apiKey: "AIzaSyDoUT_dSBkTh_Ie4NeCqoxaeLEeRIsmJR4",
  authDomain: "desktopaquar.firebaseapp.com",
  projectId: "desktopaquar",
  storageBucket: "desktopaquar.firebasestorage.app",
  messagingSenderId: "692782370145",
  appId: "1:692782370145:web:004159cc61ad94497f0920",
};

export function getFirebaseApp() {
  if (!firebaseConfig.apiKey) return null;
  if (getApps().length > 0) return getApp();
  return initializeApp(firebaseConfig);
}
