/**
 * Firebase Admin SDK singleton — SERVER ONLY.
 *
 * Never import this file from 'use client' components or src/client/.
 * The ESLint import-boundary rule enforces this.
 *
 * Reads credentials from server-side environment variables only.
 * FIREBASE_PRIVATE_KEY must be the full PEM string, with literal \n
 * characters in the env value (which Node.js expands automatically).
 */
import "server-only";
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";

function getRequiredServerEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required server environment variable: ${key}. ` +
        `This must be set in .env.local and must NEVER be a NEXT_PUBLIC_ variable.`,
    );
  }
  return value;
}

function createAdminApp(): App {
  const privateKey = getRequiredServerEnv("FIREBASE_PRIVATE_KEY")
    // Handle cases where the newlines are escaped as literal \n strings.
    .replace(/\\n/g, "\n");

  return initializeApp({
    credential: cert({
      projectId: getRequiredServerEnv("FIREBASE_PROJECT_ID"),
      clientEmail: getRequiredServerEnv("FIREBASE_CLIENT_EMAIL"),
      privateKey,
    }),
  });
}

// Singleton: one admin app per Node.js process (hot-reload safe).
export const adminApp: App =
  getApps().length > 0 ? getApps()[0]! : createAdminApp();
