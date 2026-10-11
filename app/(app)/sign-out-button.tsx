"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@client/firebase/auth-client";

export default function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    try {
      await signOut();
      router.push("/sign-in");
    } catch {
      // Best-effort: even if Firebase sign-out fails, the server
      // session cookie was cleared, so the user is effectively signed out.
      router.push("/sign-in");
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className="text-sm text-gray-500 hover:text-gray-900 disabled:opacity-50"
    >
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
