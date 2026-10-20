import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@server/auth/session";
import { getUserById } from "@server/services/user.service";
import { getBusinessesForUser, requireBusinessMembership } from "@server/services/business.service";
import { prisma } from "@server/db/prisma";
import { AppShell } from "@components/layout/app-shell";
import { visibleGroups, serializeGroups } from "@components/layout/nav-config";
import { SubscriptionBanner } from "@components/billing/subscription-banner";
import { UserRole } from "@shared/types/auth.types";
import { hasFinancialReportAccess } from "@shared/team-rules";

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

  const [user, membership, allMemberships, defaultBranchRow] = await Promise.all([
    getUserById(userId).catch(() => null),
    requireBusinessMembership(userId, businessId).catch(() => null),
    getBusinessesForUser(userId),
    prisma.branch.findFirst({
      where: { businessId, isDefault: true, status: "ACTIVE" },
      select: { name: true },
    }).catch(() => null),
  ]);

  if (!user || !membership) redirect("/sign-in");

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
  const branchName = defaultBranchRow?.name ?? null;

  return (
    <AppShell
      businessId={businessId}
      businessName={businessName}
      branchName={branchName}
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
