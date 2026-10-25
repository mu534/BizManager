import { redirect } from "next/navigation";

/**
 * /app/[businessId]/settings — redirects to the subscription page.
 * The subscription page is the default settings destination.
 */
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  redirect(`/app/${businessId}/settings/subscription`);
}
