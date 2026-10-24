import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";
import { getBranchOverview } from "@server/services/branch.service";
import { getSubscriptionSummary } from "@server/services/subscription.service";
import { AccessDenied } from "@components/layout/states";
import { Alert, Badge, Card, CardHeader, PageHeader } from "@components/ui/primitives";
import { UserRole } from "@shared/types/auth.types";
import { FEATURE_KEYS, PLANS, minimumPlanFor } from "@shared/plans";
import { AddBranchForm, BranchRowControls, MemberBranchAccess } from "./branch-controls";

export const metadata: Metadata = { title: "Branches" };
// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function BranchesPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");
  if (ctx.role !== UserRole.OWNER) return <AccessDenied businessId={businessId} what="branch settings" />;

  const [overview, summary] = await Promise.all([getBranchOverview(ctx), getSubscriptionSummary(ctx)]);
  const hasFeature = summary.features[FEATURE_KEYS.MULTI_BRANCH];
  const needed = PLANS[minimumPlanFor(FEATURE_KEYS.MULTI_BRANCH)].displayName;
  const multi = overview.branches.length > 1;

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Branches"
        description="Run several shops under one business. Each branch has its own stock, sales and expenses; reports can show one branch or all of them together."
      />

      {!hasFeature && (
        <Alert tone="warning" title={`Several branches are part of the ${needed} plan`}>
          Your plan includes one shop location.{" "}
          <Link href={`/app/${businessId}/settings/subscription`} className="font-semibold underline">Upgrade</Link> to add more.
        </Alert>
      )}
      {hasFeature && !summary.canWrite && (
        <Alert tone="warning" title="Adding branches is paused">
          Your subscription is not active. You can still close branches and change access below.
        </Alert>
      )}

      <Card>
        <CardHeader title="Add a branch" />
        <div className="px-4 py-4 sm:px-5">
          <AddBranchForm businessId={businessId} disabled={!hasFeature || !summary.canWrite} />
        </div>
      </Card>

      <Card>
        <CardHeader title={`Your branches (${overview.branches.filter((b) => b.status === "ACTIVE").length} open)`} />
        <ul className="divide-y divide-line">
          {overview.branches.map((b) => (
            <li key={b.id} className="space-y-2 px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink-900">{b.name}</span>
                {b.isDefault && <Badge tone="brand">Main</Badge>}
                {b.status === "INACTIVE" && <Badge tone="danger">Closed</Badge>}
                {(b.address || b.phone) && <span className="text-xs text-ink-500">{[b.address, b.phone].filter(Boolean).join(" · ")}</span>}
              </div>
              <BranchRowControls businessId={businessId} branchId={b.id} name={b.name} status={b.status === "ACTIVE" ? "ACTIVE" : "INACTIVE"} isDefault={b.isDefault} />
            </li>
          ))}
        </ul>
      </Card>

      {multi && (
        <Card>
          <CardHeader
            title="Who can use which branch"
            description="The owner can use every branch. Managers and staff only see the branches ticked here."
          />
          {overview.members.length === 0 ? (
            <p className="px-4 py-5 text-sm text-ink-500 sm:px-5">
              You have no team members yet. <Link href={`/app/${businessId}/settings/team`} className="font-medium text-brand-700 underline">Add some</Link>.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {overview.members.map((m) => (
                <li key={m.memberId} className="space-y-2 px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink-900">{m.name}</span>
                    <Badge tone="neutral">{m.role === "MANAGER" ? "Manager" : "Staff"}</Badge>
                    {m.status === "INACTIVE" && <Badge tone="danger">Inactive</Badge>}
                    <span className="text-xs text-ink-500">{m.email}</span>
                  </div>
                  <MemberBranchAccess
                    businessId={businessId}
                    memberId={m.memberId}
                    memberName={m.name}
                    branches={overview.branches.map((b) => ({ id: b.id, name: b.name, inactive: b.status !== "ACTIVE" }))}
                    initial={m.branchIds}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
