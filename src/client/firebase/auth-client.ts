"use client";

/**
 * Firebase Authentication client helpers.
 *
 * The Auth instance and GoogleAuthProvider are initialised lazily on first
 * use via getAuth(). getAuth() is idempotent — it always returns the same
 * instance for a given FirebaseApp, so calling it multiple times is safe.
 *
 * IMPORTANT — popup gesture chain:
 *   signInWithPopup() MUST be called in the same synchronous tick as the
 *   user gesture (button click). Any await or setState before the call
 *   breaks the gesture chain and the browser blocks the popup.
 *   Pre-compute everything that requires async work (app init, token fetch)
 *   before the user clicks, so the click handler itself is synchronous up
 *   to the signInWithPopup call.
 */
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
  type UserCredential,
} from "firebase/auth";
import { getFirebaseApp } from "./firebase-client";
import { clearLocalBusinessData } from "@client/db/dexie";

const googleProvider = new GoogleAuthProvider();

/**
 * Returns the Auth instance, initialising the FirebaseApp if needed.
 * Safe to call at module scope — throws only if env vars are missing,
 * which is caught at sign-in time.
 */
function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

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
  const auth = getFirebaseAuth();
  const credential: UserCredential = await signInWithEmailAndPassword(
    auth,
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
  const auth = getFirebaseAuth();
  const credential: UserCredential = await createUserWithEmailAndPassword(
    auth,
    email,
    password,
  );
  await updateProfile(credential.user, { displayName: name });
  // Ask the new user to confirm their email. Never blocks sign-up: they can
  // resend it later from the banner inside the app.
  await sendEmailVerification(credential.user).catch(() => undefined);
  const idToken = await credential.user.getIdToken(/* forceRefresh */ true);
  await createServerSession(idToken);
}

/**
 * Sign in with Google OAuth popup, then create a server session.
 *
 * MUST be called synchronously from a click handler — no awaits before
 * this function is invoked. The browser will block the popup if it is
 * not opened in the same tick as the user gesture.
 */
export async function signInWithGoogle(): Promise<void> {
  // signInWithPopup opens the popup synchronously on the first line.
  // Do not add any await or setState calls in the caller before invoking this.
  const credential: UserCredential = await signInWithPopup(
    getFirebaseAuth(),
    googleProvider,
  );
  const idToken = await credential.user.getIdToken();
  await createServerSession(idToken);
}

/**
 * Sign out from both Firebase and the server session.
 * Clears local business data from IndexedDB before signing out.
 * Unsynced operations are preserved (clearLocalBusinessData keeps them)
 * so shopkeepers do not lose sales recorded offline.
 */
export async function signOut(): Promise<void> {
  // Clear local business data from IndexedDB (product replicas + synced records).
  // Unsynced operations are intentionally kept so they can sync on next sign-in.
  await clearLocalBusinessData().catch(() => {
    // Non-critical — proceed with sign-out even if IndexedDB clear fails.
  });
  // Clear the server-side session cookie first.
  await fetch("/api/auth/sign-out", { method: "POST" });
  // Then sign out of Firebase client-side.
  await firebaseSignOut(getFirebaseAuth());
}

/**
 * Email a password-reset link. Resolves even for unknown addresses (Firebase may
 * report auth/user-not-found); callers map errors with resetRequestOutcome().
 */
export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(getFirebaseAuth(), email);
}

export interface EmailVerificationState {
  /** True for a signed-in email/password user whose address is not confirmed yet. */
  needsVerification: boolean;
  email: string | null;
}

/**
 * Watch the signed-in Firebase user. Google accounts are already verified, so
 * only email/password users are reported as needing verification. Returns an
 * unsubscribe function. Silent if Firebase is not configured.
 */
export function watchEmailVerification(onChange: (s: EmailVerificationState) => void): () => void {
  try {
    return onAuthStateChanged(getFirebaseAuth(), (user) => {
      const usesPassword = !!user?.providerData.some((p) => p.providerId === "password");
      onChange({ needsVerification: !!user && usesPassword && !user.emailVerified, email: user?.email ?? null });
    });
  } catch {
    return () => undefined;
  }
}

/** Send the verification email again to the signed-in user. */
export async function resendVerificationEmail(): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("NOT_SIGNED_IN");
  await sendEmailVerification(user);
}

/** Re-read the user from Firebase and report whether the email is now confirmed. */
export async function refreshEmailVerified(): Promise<boolean> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return false;
  await user.reload();
  return user.emailVerified;
}