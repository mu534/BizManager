"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithEmail, signInWithGoogle } from "@client/firebase/auth-client";

type FormState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

export default function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/app";

  const [formState, setFormState] = useState<FormState>({ status: "idle" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormState({ status: "loading" });
    try {
      await signInWithEmail(email, password);
      router.push(nextPath);
    } catch (err) {
      // Log the raw error in development for debugging — never shown to user.
      if (process.env.NODE_ENV === "development") {
        console.error("[sign-in] Firebase error:", err);
      }
      const message = getFirebaseErrorMessage(err);
      setFormState({ status: "error", message });
    }
  }

  async function handleGoogle() {
    // Do NOT call setFormState before signInWithGoogle — any state update
    // before signInWithPopup breaks the browser's user-gesture chain and
    // causes auth/popup-blocked. Set loading state only after the popup opens.
    try {
      await signInWithGoogle();
      setFormState({ status: "loading" });
      router.push(nextPath);
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("[sign-in] Google error:", err);
      }
      const message = getFirebaseErrorMessage(err);
      setFormState({ status: "error", message });
    }
  }

  const loading = formState.status === "loading";

  return (
    <div className="bg-white py-8 px-6 shadow-sm rounded-lg border border-gray-200">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">
        Sign in to your account
      </h2>

      {formState.status === "error" && (
        <div
          role="alert"
          className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          {formState.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              Password
            </label>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="mt-4">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs text-gray-500">
            <span className="bg-white px-2">or</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="mt-3 w-full flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <GoogleIcon />
          Continue with Google
        </button>
      </div>

      <p className="mt-6 text-center text-sm text-gray-600">
        Don&apos;t have an account?{" "}
        <Link
          href="/sign-up"
          className="font-medium text-blue-600 hover:text-blue-500"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function getFirebaseErrorMessage(err: unknown): string {
  if (err instanceof TypeError && err.message === "FIREBASE_CONFIG_MISSING") {
    // Configuration problem — show a generic message, never expose internals.
    return "Sign-in is not available right now. Please try again later.";
  }
  if (err instanceof Error) {
    const code = "code" in err ? String((err as { code?: string }).code) : "";
    const messages: Record<string, string> = {
      "auth/invalid-credential": "Incorrect email or password.",
      "auth/invalid-email": "Enter a valid email address.",
      "auth/user-not-found": "No account found with this email.",
      "auth/wrong-password": "Incorrect password.",
      "auth/too-many-requests":
        "Too many failed attempts. Please try again later.",
      "auth/user-disabled": "This account has been disabled.",
      "auth/network-request-failed":
        "Network error. Check your connection and try again.",
      "auth/popup-closed-by-user": "Sign-in was cancelled.",
      "auth/popup-blocked":
        "Pop-up was blocked by your browser. Allow pop-ups for this site and try again.",
      "auth/operation-not-allowed":
        "Email/password sign-in is not enabled. Enable it in your Firebase Console under Authentication → Sign-in method.",
      "auth/configuration-not-found":
        "Firebase Authentication is not configured correctly. Check your Firebase project settings.",
    };
    return messages[code] ?? "Sign-in failed. Please try again.";
  }
  return "Sign-in failed. Please try again.";
}
