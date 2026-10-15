"use client";
/**
 * Firebase client SDK — lazy singleton.
 *
 * NEXT_PUBLIC_FIREBASE_* values are substituted at compile time by Next.js.
 * They will be undefined only if the dev server was started before .env.local
 * was created — in that case, restart the dev server.
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();
  if (!firebaseConfig.apiKey) {
    throw new TypeError("FIREBASE_CONFIG_MISSING");
  }
  return initializeApp(firebaseConfig);
}
