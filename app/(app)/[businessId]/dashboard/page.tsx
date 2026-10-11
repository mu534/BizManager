import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Dashboard placeholder — Phase 3.
 *
 * Confirms that tenant context resolves correctly for this business.
 * The real dashboard with reports, sales summary, and account balances
 * will be built in Phase 7.
 */
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;

  // Resolve and verify tenant access. Throws/redirects if unauthorized.
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) {
    redirect("/sign-in");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Phase 3 complete — authentication and tenant context working.
        </p>
      </div>

      {/* Minimal confirmation card */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-medium text-gray-700 mb-3">
          Active session
        </h2>
        <dl className="space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-gray-500">User ID</dt>
            <dd className="font-mono text-gray-900 truncate">{ctx.userId}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-gray-500">Business ID</dt>
            <dd className="font-mono text-gray-900 truncate">{ctx.businessId}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-gray-500">Role</dt>
            <dd className="font-mono text-gray-900">{ctx.role}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong>Phase 3 placeholder.</strong> The full dashboard with sales
        summary, inventory alerts, and financial account balances will be
        implemented in Phase 7.
      </div>
    </div>
  );
}
