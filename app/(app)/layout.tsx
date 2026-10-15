import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUserId } from "@server/auth/session";
import { getUserById } from "@server/services/user.service";
import { getBusinessesForUser } from "@server/services/business.service";
import SignOutButton from "./sign-out-button";
import { OfflineBanner } from "@components/offline/offline-banner";

// This layout reads cookies — must not be statically prerendered.
export const instant = false;

export default async function AppLayout({ children }: { children: ReactNode }) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/sign-in");

  const user = await getUserById(userId).catch(() => null);
  if (!user) redirect("/sign-in");

  const businesses = await getBusinessesForUser(userId);
  if (businesses.length === 0) redirect("/create-business");

  const displayName = user.name ?? user.email ?? "User";

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <span className="text-base font-semibold text-gray-900">BizManager</span>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500 hidden sm:block">{displayName}</span>
              <SignOutButton />
            </div>
          </div>
        </div>
      </header>
      <OfflineBanner />
      <main className="flex-1 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
