import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@server/auth/session";
import { getUserById } from "@server/services/user.service";
import { getBusinessesForUser, requireBusinessMembership } from "@server/services/business.service";
import { AppShell } from "@components/layout/app-shell";
import { visibleGroups, serializeGroups } from "@components/layout/nav-config";
import { SubscriptionBanner } from "@components/billing/subscription-banner";
import { UserRole } from "@shared/types/auth.types";
import { hasFinancialReportAccess } from "@shared/team-rules";
import { listAccessibleBranches } from "@server/services/branch-access.service";
import { getCurrentBranch } from "@server/branch/current-branch";

// Reads cookies → must not prerender. Suppresses instant-nav validation
// for the entire /app/[businessId]/* subtree.
export const instant = false;

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  STAFF: "Staff",
};

export default async function BusinessLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;

  const userId = await getSessionUserId();
  if (!userId) redirect("/sign-in");

  const [user, membership, allMemberships] = await Promise.all([
    getUserById(userId).catch(() => null),
    requireBusinessMembership(userId, businessId).catch(() => null),
    getBusinessesForUser(userId),
  ]);

  if (!user || !membership) redirect("/sign-in");

  // Branches this member may use, and the one they are working in (a saved
  // preference re-validated against their access).
  const actor = { businessId, membershipId: membership.id, role: membership.role as UserRole };
  const accessibleBranches = await listAccessibleBranches(actor).catch(() => []);
  const currentBranch = await getCurrentBranch(actor).catch(() => null);

  const groups = serializeGroups(
    visibleGroups({
      isOwner: membership.role === UserRole.OWNER,
      isManagerOrOwner: membership.role !== UserRole.STAFF,
      canSeeFinancials: hasFinancialReportAccess(membership.role, membership.canViewFinancialReports),
    }),
  );

  const businessOptions = allMemberships.map((m) => ({
    id: m.business.id,
    name: m.business.name,
  }));

  const currentMembership = allMemberships.find((m) => m.business.id === businessId);
  const businessName = currentMembership?.business.name ?? "Business";
  const branchName = currentBranch?.name ?? null;

  return (
    <AppShell
      businessId={businessId}
      businessName={businessName}
      branchName={branchName}
      branches={accessibleBranches.filter((b) => b.status === "ACTIVE").map((b) => ({ id: b.id, name: b.name }))}
      currentBranchId={currentBranch?.id ?? null}
      roleLabel={ROLE_LABELS[membership.role] ?? membership.role}
      user={{ name: user.name, email: user.email }}
      businesses={businessOptions}
      groups={groups}
    >
      <SubscriptionBanner businessId={businessId} isOwner={membership.role === UserRole.OWNER} />
      {children}
    </AppShell>
  );
}
