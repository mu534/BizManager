import { redirect } from "next/navigation";
import { getSessionUserId } from "@server/auth/session";
import { getBusinessesForUser } from "@server/services/business.service";
import { getSubscriptionAccess } from "@server/services/subscription.service";
import { hasSubmittedPayment } from "@server/services/subscription-payment.service";
import { startPage } from "@shared/onboarding-rules";

/**
 * /app — root of the protected application.
 *
 * Resolves the user's active business and redirects to the dashboard.
 * In Phase 3, if a user has exactly one business, we auto-select it.
 * Multi-business selection will be added when needed.
 */
// Reads cookies via getSessionUserId — must not prerender.
export const instant = false;

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

  const businessId = targetBusiness.business.id;

  // A brand-new shop has no plan. Its owner starts by choosing one; everyone else,
  // and every shop that already has or is waiting on a plan, sees the dashboard.
  const access = await getSubscriptionAccess(businessId).catch(() => null);
  const destination = access
    ? startPage({
        isOwner: targetBusiness.membership.role === "OWNER",
        accessState: access.decision.state,
        hasSubmittedPayment: await hasSubmittedPayment(businessId),
      })
    : "dashboard";
  redirect(destination === "choose-plan" ? `/app/${businessId}/settings/subscription` : `/app/${businessId}/dashboard`);
}