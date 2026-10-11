import { redirect } from "next/navigation";
import { getSessionUserId } from "@server/auth/session";
import { getBusinessesForUser } from "@server/services/business.service";

/**
 * /app — root of the protected application.
 *
 * Resolves the user's active business and redirects to the dashboard.
 * In Phase 3, if a user has exactly one business, we auto-select it.
 * Multi-business selection will be added when needed.
 */
export default async function AppRootPage({
  searchParams,
}: {
  searchParams: Promise<{ businessId?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const params = await searchParams;
  const requestedBusinessId = params.businessId;

  const businesses = await getBusinessesForUser(userId);

  if (businesses.length === 0) {
    redirect("/create-business");
  }

  // Use the requested businessId if valid, otherwise use the first business.
  const targetBusiness =
    (requestedBusinessId &&
      businesses.find((b) => b.business.id === requestedBusinessId)) ||
    businesses[0]!;

  redirect(`/app/${targetBusiness.business.id}/dashboard`);
}
