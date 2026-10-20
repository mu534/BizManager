import Link from "next/link";
import { getSubscriptionAccess } from "@server/services/subscription.service";
import { Alert } from "@components/ui/primitives";
import { formatDate } from "@components/ui/format";

/**
 * Subscription status notice shown on every business page. Server-rendered from
 * the server-side decision, so it cannot be changed by editing the device clock.
 * This is a SUBSCRIPTION message — it is deliberately worded and styled apart
 * from offline / sync-failure notices.
 */
export async function SubscriptionBanner({
  businessId,
  isOwner,
}: {
  businessId: string;
  isOwner: boolean;
}) {
  const access = await getSubscriptionAccess(businessId).catch(() => null);
  if (!access) return null;
  const { decision } = access;
  const link = isOwner ? (
    <Link href={`/app/${businessId}/settings/subscription`} className="font-semibold underline">
      {decision.state === "ACTIVE" || decision.state === "GRACE" ? "Renew now" : "Choose a plan"}
    </Link>
  ) : (
    <span>Ask the business owner to renew.</span>
  );

  if (decision.state === "GRACE" && decision.graceEndsAt) {
    return (
      <div className="mb-4">
        <Alert tone="warning" title="Your subscription has expired — renew within the grace period">
          You can keep recording for {decision.daysRemaining} more day{decision.daysRemaining === 1 ? "" : "s"} (until{" "}
          {formatDate(decision.graceEndsAt)}). After that, new transactions are paused; your data stays safe and
          exportable. {link}
        </Alert>
      </div>
    );
  }
  if (decision.state === "ACTIVE" && decision.daysRemaining !== null && decision.daysRemaining <= 7 && decision.periodEndsAt) {
    return (
      <div className="mb-4">
        <Alert tone="info" title={`Your plan renews by ${formatDate(decision.periodEndsAt)}`}>
          {decision.daysRemaining} day{decision.daysRemaining === 1 ? "" : "s"} left in this period. {link}
        </Alert>
      </div>
    );
  }
  if (decision.state === "READ_ONLY" || decision.state === "NONE" || decision.state === "CANCELLED") {
    return (
      <div className="mb-4">
        <Alert
          tone={decision.state === "NONE" ? "info" : "danger"}
          title={decision.state === "NONE" ? "Choose a plan to start recording" : "Recording is paused — read-only mode"}
        >
          {decision.state === "NONE"
            ? "You can look around and view your data. Submit your plan payment to record sales, products and expenses. "
            : "You can still view and export everything. New sales, products, expenses and stock changes are paused until you renew. Offline transactions already saved on this device are kept. "}
          {link}
        </Alert>
      </div>
    );
  }
  if (decision.state === "SUSPENDED") {
    return (
      <div className="mb-4">
        <Alert tone="danger" title="This business is suspended">
          You can view and export your data, but new transactions are blocked. Please contact support.
        </Alert>
      </div>
    );
  }
  return null;
}
