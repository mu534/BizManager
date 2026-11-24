import type { ReactNode } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { adminPageGuard } from "@server/auth/require-admin-page";
import { pendingReviewCount } from "@server/services/subscription-payment.service";

export const metadata: Metadata = { title: { default: "Platform console", template: "%s · BizManager console" }, robots: { index: false, follow: false } };
export const instant = false;

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/businesses", label: "Businesses" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/plans", label: "Plans & pricing" },
  { href: "/admin/audit", label: "Audit log" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await adminPageGuard();
  const pending = await pendingReviewCount().catch(() => 0);
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="text-sm font-semibold text-ink-900">
            BizManager <span className="text-brand-700">console</span>
          </span>
          <nav aria-label="Console" className="flex flex-wrap gap-1 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-control px-3 py-1.5 text-ink-700 hover:bg-ink-100 hover:text-ink-900">
                {n.label}
                {n.href === "/admin/payments" && pending > 0 && (
                  <span
                    aria-label={`${pending} waiting for review`}
                    className="ml-1.5 inline-grid min-w-5 place-items-center rounded-full bg-warning-600 px-1.5 text-[11px] font-semibold leading-5 text-white"
                  >
                    {pending}
                  </span>
                )}
              </Link>
            ))}
          </nav>
          <span className="ml-auto text-xs text-ink-500">{admin.role.replace("_", " ").toLowerCase()}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}