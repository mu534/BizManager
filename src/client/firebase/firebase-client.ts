/**
 * Firebase client SDK singleton.
 *
 * Only imports used by the client (no firebase-admin here).
 * Safe to import from 'use client' components.
 *
 * Initialisation is lazy — the Firebase app is only created when
 * getFirebaseApp() is first called, not at module load time.
 * This prevents a missing env var from crashing the entire module
 * evaluation and breaking pages that happen to import this file.
 *
 * All NEXT_PUBLIC_FIREBASE_* variables are required at runtime.
 * If any are missing the error is thrown when the user actually
 * tries to use Firebase (sign-in, sign-up, etc.), not earlier.
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
        `Copy .env.example to .env.local and fill in your Firebase project credentials.`,
    );
  }
  return value;
}

let _app: FirebaseApp | null = null;

/**
 * Returns the Firebase app singleton, creating it on first call.
 * Throws a clear error if Firebase env vars are not configured.
 */
export function getFirebaseApp(): FirebaseApp {
  if (_app) return _app;

  // Reuse an already-initialised app (handles Next.js hot-reload).
  const existing = getApps();
  if (existing.length > 0) {
    _app = existing[0]!;
    return _app;
  }

  _app = initializeApp({
    apiKey: getRequiredEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: getRequiredEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: getRequiredEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: getRequiredEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
  });

  return _app;
}

/**
 * @deprecated Import `getFirebaseApp()` instead.
 * Left for backward compatibility while callers are updated.
 */
export const firebaseApp: FirebaseApp = new Proxy({} as FirebaseApp, {
  get(_target, prop) {
    return Reflect.get(getFirebaseApp(), prop);
  },
});
