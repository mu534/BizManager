import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUserId } from "@server/auth/session";
import { getUserById } from "@server/services/user.service";
import { getBusinessesForUser } from "@server/services/business.service";

// This layout reads cookies — must not be statically prerendered.
export const instant = false;

/**
 * /app layout — wraps all authenticated routes.
 *
 * Auth and user data are resolved here. The business-specific shell
 * (AppShell with nav groups, sidebar, etc.) is rendered in the nested
 * [businessId]/layout.tsx which has access to the businessId param.
 * This layout only guards the session and provides a minimal wrapper.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/sign-in");

  const user = await getUserById(userId).catch(() => null);
  if (!user) redirect("/sign-in");

  const businesses = await getBusinessesForUser(userId);
  if (businesses.length === 0) redirect("/create-business");

  // Pass children straight through — the [businessId] layout renders the shell.
  return <>{children}</>;
}
