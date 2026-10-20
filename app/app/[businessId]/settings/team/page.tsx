import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveContext } from "@server/auth/resolve-context";
import { listTeam } from "@server/services/team.service";
import { getSubscriptionSummary } from "@server/services/subscription.service";
import { AccessDenied } from "@components/layout/states";
import { Alert, Badge, Card, CardHeader, PageHeader, Table, TableWrap, Td, Th } from "@components/ui/primitives";
import { UserRole } from "@shared/types/auth.types";
import { PLANS, minimumPlanFor, FEATURE_KEYS } from "@shared/plans";
import { AddMemberForm } from "./add-member-form";
import { MemberControls } from "./member-controls";

export const metadata: Metadata = { title: "Team" };
// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function TeamPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");
  if (ctx.role !== UserRole.OWNER) return <AccessDenied businessId={businessId} what="team settings" />;

  const [team, summary] = await Promise.all([listTeam(ctx), getSubscriptionSummary(ctx)]);
  const hasFeature = summary.features[FEATURE_KEYS.MULTI_USER];
  const needed = PLANS[minimumPlanFor(FEATURE_KEYS.MULTI_USER)].displayName;
  const canAdd = hasFeature && summary.canWrite;
  const reportViewers = team.filter((m) => m.canSeeFinancialReports);

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Team"
        description="Add staff and managers, and decide who can see financial reports. Staff can sell without seeing profit."
      />

      <Alert tone="info" title="Who can see financial reports right now">
        {reportViewers.map((m) => `${m.name}${m.role === "OWNER" ? " (owner)" : ""}`).join(", ")}.
        {" "}Managers see financial reports only after you grant access; staff never do.
      </Alert>

      {!hasFeature && (
        <Alert tone="warning" title={`Team accounts are part of the ${needed} plan`}>
          Your current plan has one user. <Link href={`/app/${businessId}/settings/subscription`} className="font-semibold underline">Upgrade</Link> to add
          managers and staff.
        </Alert>
      )}
      {hasFeature && !summary.canWrite && (
        <Alert tone="warning" title="Adding members is paused">
          Your subscription is not active. You can still remove access below. Renew to add people.
        </Alert>
      )}

      <Card>
        <CardHeader title="Add a team member" />
        <div className="px-4 py-4 sm:px-5">
          <AddMemberForm businessId={businessId} disabled={!canAdd} />
        </div>
      </Card>

      <Card>
        <CardHeader title={`Members (${team.filter((m) => m.status === "ACTIVE").length} active)`} />
        <TableWrap>
          <Table>
            <thead>
              <tr><Th>Person</Th><Th>Role</Th><Th>Financial reports</Th><Th>Manage</Th></tr>
            </thead>
            <tbody>
              {team.map((m) => (
                <tr key={m.memberId} className="align-top">
                  <Td>
                    <span className="font-medium text-ink-900">{m.name}{m.isSelf ? " (you)" : ""}</span>
                    <span className="block text-xs text-ink-500">{m.email ?? "—"}</span>
                  </Td>
                  <Td>
                    <Badge tone={m.role === "OWNER" ? "brand" : "neutral"}>{m.role.charAt(0) + m.role.slice(1).toLowerCase()}</Badge>
                    {m.status !== "ACTIVE" && <Badge tone="danger" className="ml-1">{m.status === "INACTIVE" ? "Inactive" : "Removed"}</Badge>}
                  </Td>
                  <Td>
                    {m.canSeeFinancialReports ? <Badge tone="success">Can view</Badge> : <span className="text-sm text-ink-500">No access</span>}
                  </Td>
                  <Td>
                    {m.role === "OWNER" || m.isSelf || m.status === "REVOKED" ? (
                      <span className="text-xs text-ink-400">—</span>
                    ) : (
                      <MemberControls
                        businessId={businessId}
                        memberId={m.memberId}
                        name={m.name}
                        role={m.role === "STAFF" ? "STAFF" : "MANAGER"}
                        status={m.status === "ACTIVE" ? "ACTIVE" : "INACTIVE"}
                        hasReportAccess={m.canSeeFinancialReports}
                      />
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </div>
  );
}
