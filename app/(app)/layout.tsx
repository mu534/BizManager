import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUserId } from "@server/auth/session";
import { getUserById } from "@server/services/user.service";
import { getBusinessesForUser } from "@server/services/business.service";
import SignOutButton from "./sign-out-button";

/**
 * Protected application shell layout.
 *
 * Verifies the session and ensures the user has at least one business.
 * Redirects to sign-in or onboarding if either condition is not met.
 *
 * This layout wraps all /app/* routes. It renders a minimal top nav
 * that will be expanded in later phases.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const user = await getUserById(userId).catch(() => null);
  if (!user) {
    redirect("/sign-in");
  }

  const businesses = await getBusinessesForUser(userId);
  if (businesses.length === 0) {
    redirect("/create-business");
  }

  const displayName = user.name ?? user.email ?? "User";

  return (
    <div className="min-h-full flex flex-col">
      {/* Top navigation bar */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-gray-900">
                BizManager
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 hidden sm:block">
                {displayName}
              </span>
              <SignOutButton />
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
