"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@client/firebase/auth-client";
import { clearLocalBusinessData, countUnsyncedOperations } from "@client/db/dexie";

export default function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    const unsynced = await countUnsyncedOperations().catch(() => 0);
    if (
      unsynced > 0 &&
      !window.confirm(
        `${unsynced} sale/expense record${unsynced === 1 ? " has" : "s have"} not synced yet. ` +
          "They stay safely on this device and sync after you sign in again. Sign out now?",
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      await clearLocalBusinessData().catch(() => 0);
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
      className="w-full rounded px-0 py-1.5 text-left text-sm font-medium text-danger-700 hover:underline disabled:opacity-50"
    >
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
