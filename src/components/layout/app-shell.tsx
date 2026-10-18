import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@components/ui/logo";
import { Badge } from "@components/ui/primitives";
import { OfflineBanner } from "@components/offline/offline-banner";
import { AccountMenu, type BusinessOption } from "./account-menu";
import { MobileNav } from "./mobile-nav";
import { SidebarNav } from "./nav-links";
import { SyncRunner } from "./sync-runner";
import { TopbarSearch } from "./topbar-search";
import type { SerializedNavGroup } from "./nav-config";

export interface ShellProps {
  businessId: string;
  businessName: string;
  branchName: string | null;
  roleLabel: string;
  user: { name: string; email: string | null };
  businesses: BusinessOption[];
  groups: SerializedNavGroup[];
  children: ReactNode;
}

/**
 * Authenticated application shell.
 * Desktop (lg+): fixed 256px sidebar with grouped navigation.
 * Mobile: top bar + bottom tab bar with a "More" sheet.
 */
export function AppShell({ businessId, businessName, branchName, roleLabel, user, businesses, groups, children }: ShellProps) {
  const base = `/app/${businessId}`;
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop">
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-14 items-center border-b border-line px-5">
          <Link href={`${base}/dashboard`} aria-label="BizManager home"><Logo /></Link>
        </div>
        <SidebarNav groups={groups} base={base} />
        <div className="border-t border-line p-4">
          <p className="truncate text-sm font-semibold text-ink-900">{businessName}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
            <Badge tone="brand">{roleLabel}</Badge>
          </p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
          <Link href={`${base}/dashboard`} className="lg:hidden" aria-label="BizManager home"><Logo /></Link>
          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-sm font-semibold text-ink-900">{businessName}</p>
            {branchName && <p className="truncate text-xs text-ink-500">{branchName}</p>}
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <TopbarSearch base={base} />
            <AccountMenu name={user.name} email={user.email} roleLabel={roleLabel} businesses={businesses} currentId={businessId} />
          </div>
        </header>

        <OfflineBanner businessId={businessId} />
        <SyncRunner businessId={businessId} />

        <main id="main" className="mx-auto w-full max-w-[1280px] px-4 pb-24 pt-5 sm:px-6 sm:pt-6 lg:pb-10">
          {children}
        </main>
      </div>

      <MobileNav groups={groups} base={base} />
    </div>
  );
}
