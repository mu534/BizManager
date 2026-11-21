import type { Metadata } from "next";
import { resolveContext } from "@server/auth/resolve-context";
import { pushConfig } from "@server/services/push.service";
import { Card, PageHeader } from "@components/ui/primitives";
import { AccessDenied } from "@components/layout/states";
import { PushToggle } from "./push-toggle";

export const metadata: Metadata = { title: "Notifications" };

// Reads session + business-scoped data on every request — cannot prerender.
export const instant = false;

export default async function NotificationsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const ctx = await resolveContext(businessId);
  if (ctx.role === "STAFF") return <AccessDenied businessId={businessId} what="notifications" />;
  const cfg = pushConfig();

  return (
    <div className="max-w-xl">
      <PageHeader
        title="Notifications"
        description="Get told when a product runs low, even when BizManager is closed."
      />
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-ink-900">Low-stock alerts</h2>
          <p className="mt-1 text-sm text-ink-600">
            You get one alert when a product drops to its alert level (set on the product as &ldquo;minimum stock&rdquo;),
            not on every sale after that. Owners get alerts for every branch; managers for the branches they can access.
          </p>
        </div>
        {cfg ? (
          <PushToggle businessId={businessId} publicKey={cfg.publicKey} />
        ) : (
          <p className="text-sm text-ink-600">
            Notifications are not set up on this server yet. The administrator needs to add the push keys (see DEPLOYMENT.md).
          </p>
        )}
        <p className="text-xs text-ink-500">Alerts are turned on per device. Turn them on once on each phone or computer you want to use.</p>
      </Card>
    </div>
  );
}