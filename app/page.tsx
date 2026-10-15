import { redirect } from "next/navigation";
import { getSessionUserId } from "@server/auth/session";
import { getBusinessesForUser } from "@server/services/business.service";

// This route reads cookies (session) — opt out of static prerendering.
// See: https://nextjs.org/docs/messages/blocking-prerender-runtime
export const instant = false;

/**
 * Root page — smart redirect based on session state.
 * Authenticated + has business → /app
 * Authenticated + no business → /create-business
 * Not authenticated → /sign-in
 */
export default async function RootPage() {
  const userId = await getSessionUserId();

  if (!userId) {
    redirect("/sign-in");
  }

  const businesses = await getBusinessesForUser(userId).catch(() => []);
  if (businesses.length === 0) {
    redirect("/create-business");
  }

  redirect("/app");
}
