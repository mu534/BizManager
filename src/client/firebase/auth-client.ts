"use client";

/**
 * Firebase Authentication client helpers.
 *
 * These functions run in the browser only. They use the Firebase client SDK
 * to authenticate the user, then exchange the resulting ID token for a
 * server-side session cookie via POST /api/auth/session.
 *
 * After sign-in, the server sets an httpOnly cookie — the browser never
 * stores the raw Firebase ID token in a client-readable location.
 */
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  updateProfile,
  type UserCredential,
} from "firebase/auth";
import { firebaseApp } from "./firebase-client";

export const firebaseAuth = getAuth(firebaseApp);

const googleProvider = new GoogleAuthProvider();

/** Exchange a Firebase ID token for a server session cookie. */
async function createServerSession(idToken: string): Promise<void> {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body?.error?.message ?? "Failed to create session");
  }
}

/**
 * Sign in with email and password, then create a server session.
 */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<void> {
  const credential: UserCredential = await signInWithEmailAndPassword(
    firebaseAuth,
    email,
    password,
  );
  const idToken = await credential.user.getIdToken();
  await createServerSession(idToken);
}

/**
 * Register a new user with email, password, and display name,
 * then create a server session.
 */
export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
): Promise<void> {
  const credential: UserCredential = await createUserWithEmailAndPassword(
    firebaseAuth,
    email,
    password,
  );
  // Store the display name in Firebase (optional but useful for display).
  await updateProfile(credential.user, { displayName: name });
  const idToken = await credential.user.getIdToken(/* forceRefresh */ true);
  await createServerSession(idToken);
}

/**
 * Sign in with Google OAuth popup, then create a server session.
 */
export async function signInWithGoogle(): Promise<void> {
  const credential: UserCredential = await signInWithPopup(
    firebaseAuth,
    googleProvider,
  );
  const idToken = await credential.user.getIdToken();
  await createServerSession(idToken);
}

/**
 * Sign out from both Firebase and the server session.
 * Call this from sign-out buttons/actions.
 */
export async function signOut(): Promise<void> {
  // Clear the server-side session cookie first.
  await fetch("/api/auth/sign-out", { method: "POST" });
  // Then sign out of Firebase client-side.
  await firebaseSignOut(firebaseAuth);
}
