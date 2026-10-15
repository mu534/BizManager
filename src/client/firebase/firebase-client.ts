"use client";
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";

// These values are substituted at compile time by Next.js.
// They are available once the dev server is started with .env.local present.
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "";
const AUTH_DOMAIN = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "";
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "";

export function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();
  if (!API_KEY) throw new TypeError("FIREBASE_CONFIG_MISSING");
  return initializeApp({
    apiKey: API_KEY,
    authDomain: AUTH_DOMAIN,
    projectId: PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: APP_ID,
  });
}
