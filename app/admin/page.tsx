import { adminPageGuard } from "@server/auth/require-admin-page";
import { getPlatformMetrics } from "@server/services/platform-admin.service";
import { Alert, Card, CardHeader, PageHeader, Stat } from "@components/ui/primitives";
import { formatDateTime } from "@components/ui/format";
import Link from "next/link";

export const instant = false;

export default async function AdminOverview() {
  await adminPageGuard();
  const m = await getPlatformMetrics();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Recorded platform facts only. Nothing here is estimated, and no revenue total is shown."
      />

      {m.pendingPaymentReviews > 0 && (
        <Alert
          tone="warning"
          title={`${m.pendingPaymentReviews} payment${m.pendingPaymentReviews === 1 ? "" : "s"} waiting for review`}
          action={<Link href="/admin/payments" className="text-sm font-semibold underline">Review</Link>}
        >
          {m.oldestPendingAt ? `Oldest submitted ${formatDateTime(m.oldestPendingAt)}.` : null}
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Registered businesses" value={m.registeredBusinesses} />
        <Stat label="Can record now" value={m.activeSubscriptions} sub={`${m.inGrace} in grace period`} />
        <Stat label="Read-only or no plan" value={m.readOnlyOrNoSubscription} />
        <Stat label="Expiring in 7 days" value={m.expiringWithin7Days} />
        <Stat label="Pending payment reviews" value={m.pendingPaymentReviews} />
        <Stat label="Suspended businesses" value={m.suspendedBusinesses} />
        <Stat label="Open support requests" value={m.openSupportRequests} />
        <Stat label="Failed sync operations (7 days)" value={m.failedSyncOperations7d} sub="As recorded by the server" />
      </div>

      <Card>
        <CardHeader title="Plan distribution" description="Businesses that can currently record transactions." />
        {m.planDistribution.length === 0 ? (
          <p className="px-4 py-5 text-sm text-ink-500 sm:px-5">No paying businesses yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {m.planDistribution.map((p) => (
              <li key={p.plan} className="flex items-center justify-between px-4 py-2.5 sm:px-5">
                <span className="text-ink-800">{p.plan}</span>
                <span className="font-semibold text-ink-900">{p.count}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-xs text-ink-500">Generated {formatDateTime(m.generatedAt)}. Client-side sync failures that never reached the server are not counted.</p>
    </div>
  );
}
