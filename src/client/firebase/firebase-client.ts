/**
 * Firebase client SDK singleton.
 *
 * Lazy initialisation — Firebase app is only created on first call to
 * getFirebaseApp(), not at module load time.
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";

let _app: FirebaseApp | null = null;

/**
 * Returns the Firebase app singleton, creating it on first call.
 * Throws if Firebase env vars are missing (configuration error, not a user error).
 */
export function getFirebaseApp(): FirebaseApp {
  if (_app) return _app;

  const existing = getApps();
  if (existing.length > 0) {
    _app = existing[0]!;
    return _app;
  }

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !appId) {
    // Configuration error — not a user-facing error.
    // In development: check that .env.local has NEXT_PUBLIC_FIREBASE_* values
    // and restart the dev server after adding them.
    throw new TypeError("FIREBASE_CONFIG_MISSING");
  }

  _app = initializeApp({
    apiKey,
    authDomain,
    projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId,
  });

  return _app;
}
