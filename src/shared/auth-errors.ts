import type { Dictionary } from "./i18n/en";

/**
 * Map a Firebase Auth error to a translated, user-safe message — pure.
 * Wrong-password and unknown-email deliberately share one message so the form
 * does not reveal which emails have accounts. Raw error text is never shown.
 */
export function authErrorMessage(err: unknown, t: Dictionary["auth"]): string {
  if (err instanceof TypeError && err.message === "FIREBASE_CONFIG_MISSING") return t.unavailable;
  const code =
    typeof err === "object" && err !== null && "code" in err ? String((err as { code?: unknown }).code) : "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return t.wrongCredentials;
    case "auth/invalid-email":
      return t.invalidEmail;
    case "auth/email-already-in-use":
      return t.emailInUse;
    case "auth/weak-password":
      return t.passwordMin;
    case "auth/too-many-requests":
      return t.tooMany;
    case "auth/user-disabled":
      return t.disabled;
    case "auth/network-request-failed":
      return t.network;
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return t.cancelled;
    case "auth/popup-blocked":
      return t.popupBlocked;
    case "auth/operation-not-allowed":
    case "auth/configuration-not-found":
      return t.unavailable;
    default:
      return t.failed;
  }
}
