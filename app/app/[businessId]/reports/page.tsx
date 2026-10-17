import { redirect } from "next/navigation";

export default async function ReportsIndexPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  redirect(`/app/${businessId}/reports/sales`);
}
