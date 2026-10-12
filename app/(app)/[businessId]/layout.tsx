import type { ReactNode } from "react";
import { NavLinks } from "@components/layout/nav-links";
import { BottomNav } from "@components/layout/bottom-nav";

export default async function BusinessLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      {/* Desktop section navigation */}
      <div className="border-b border-gray-200 pb-0 -mb-2 hidden md:block">
        <NavLinks businessId={businessId} />
      </div>
      {children}
      {/* Mobile bottom navigation */}
      <BottomNav businessId={businessId} />
    </div>
  );
}
