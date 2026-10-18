import { redirect } from "next/navigation";


// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function ReportsIndexPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  redirect(`/app/${businessId}/reports/sales`);
}
