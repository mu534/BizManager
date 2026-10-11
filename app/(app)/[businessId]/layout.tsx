import type { ReactNode } from "react";
import { NavLinks } from "@components/layout/nav-links";

export default async function BusinessLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;

  return (
    <div className="space-y-6">
      {/* Section navigation — sits below the app header */}
      <div className="border-b border-gray-200 pb-0 -mb-2">
        <NavLinks businessId={businessId} />
      </div>
      {children}
    </div>
  );
}
