import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";
import { prisma } from "@server/db/prisma";
import { SyncIssues } from "./sync-issues";

export const metadata: Metadata = { title: "Sync status" };
// Reads the session; the queue itself lives in the browser (IndexedDB).
export const instant = false;

export default async function SyncPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } });
  return <SyncIssues businessId={businessId} currency={business?.currency ?? "ETB"} />;
}
