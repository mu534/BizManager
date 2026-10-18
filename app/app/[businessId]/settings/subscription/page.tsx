import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";
import { getSubscriptionSummary } from "@server/services/subscription.service";
import { requireOwner } from "@server/auth/permissions";

export const metadata: Metadata = { title: "Subscription" };

const PLAN_FEATURES: Record<string, string> = {
  OFFLINE_SYNC: "Offline operations",
  MULTI_USER: "Multiple users",
  MULTI_BRANCH: "Multiple branches",
  ADVANCED_REPORTS: "Advanced reports",
  TAX_TOOLS: "Tax tools",
};

const LIMIT_LABELS: Record<string, string> = {
  MAX_PRODUCTS: "Products",
  MAX_USERS: "Users",
  MAX_TRANSACTIONS_MONTH: "Transactions / month",
};


// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function SubscriptionPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");

  requireOwner(ctx);

  const summary = await getSubscriptionSummary(ctx);

  if (!summary) {
    return (
      <div className="max-w-lg space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Subscription</h1>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-500">
            No subscription found. Run the plan seed script and restart the server.
          </p>
          <pre className="mt-3 text-xs bg-gray-50 rounded p-2 text-gray-600">
            npx prisma db seed
          </pre>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    TRIAL: "bg-blue-50 text-blue-700",
    ACTIVE: "bg-green-50 text-green-700",
    PAST_DUE: "bg-amber-50 text-amber-700",
    CANCELLED: "bg-gray-100 text-gray-500",
    EXPIRED: "bg-red-50 text-red-700",
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Subscription</h1>

      {/* Status card */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-semibold text-gray-900">{summary.planDisplayName}</p>
            <p className="text-sm text-gray-500">Current plan</p>
          </div>
          <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${statusColors[summary.status] ?? "bg-gray-100 text-gray-500"}`}>
            {summary.isInTrial
              ? `Trial — ${summary.trialDaysRemaining ?? 0} day${summary.trialDaysRemaining !== 1 ? "s" : ""} left`
              : summary.status}
          </span>
        </div>

        {summary.isExpired && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            Your subscription has expired. Historical data remains accessible.
            Contact support to renew your subscription.
          </div>
        )}

        {summary.isInTrial && summary.trialDaysRemaining !== null && summary.trialDaysRemaining <= 3 && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            Your trial ends in {summary.trialDaysRemaining} day{summary.trialDaysRemaining !== 1 ? "s" : ""}.
          </div>
        )}
      </div>

      {/* Features */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-700">
          Plan Features
        </div>
        <div className="divide-y divide-gray-100">
          {Object.entries(PLAN_FEATURES).map(([key, label]) => {
            const enabled = summary.features[key] ?? false;
            return (
              <div key={key} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className={enabled ? "text-gray-900" : "text-gray-400"}>{label}</span>
                {enabled ? (
                  <span className="text-green-600 font-medium">✓ Included</span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Limits */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-700">
          Usage Limits
        </div>
        <div className="divide-y divide-gray-100">
          {Object.entries(summary.limits).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-gray-700">{LIMIT_LABELS[key] ?? key}</span>
              <span className="font-medium text-gray-900">
                {value === -1 ? "Unlimited" : value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Upgrade notice */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 space-y-2">
        <p className="font-medium text-gray-700">Subscription payments</p>
        <p>
          Online subscription payment is not yet available. BizManager subscription billing
          integration is pending payment provider selection (UD-003).
        </p>
        <p className="text-gray-400 text-xs">
          Contact support at support@bizmanager.app to manage your subscription manually.
        </p>
      </div>
    </div>
  );
}
