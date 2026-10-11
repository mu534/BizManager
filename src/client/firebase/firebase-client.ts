/**
 * Firebase client SDK singleton.
 *
 * Only imports used by the client (no firebase-admin here).
 * Safe to import from 'use client' components.
 *
 * All NEXT_PUBLIC_FIREBASE_* variables are required at runtime.
 * If any are missing the app will fail loudly during initialization
 * rather than silently misbehave.
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
        `Check your .env.local file against .env.example.`,
    );
  }
  return value;
}

function createFirebaseApp(): FirebaseApp {
  return initializeApp({
    apiKey: getRequiredEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: getRequiredEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: getRequiredEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: getRequiredEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
  });
}

// Singleton: reuse an existing app if already initialized (hot-reload safe).
export const firebaseApp: FirebaseApp =
  getApps().length > 0 ? getApps()[0]! : createFirebaseApp();
