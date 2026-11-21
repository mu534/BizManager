"use client";

import { useEffect, useState } from "react";
import { disablePush, enablePush, isSubscribedHere, pushSupported } from "@client/push";
import { Button } from "@components/ui/button";
import { Alert } from "@components/ui/primitives";

type Status = "loading" | "unsupported" | "off" | "on" | "blocked";

export function PushToggle({ businessId, publicKey }: { businessId: string; publicKey: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!pushSupported()) return !cancelled && setStatus("unsupported");
      if (Notification.permission === "denied") return !cancelled && setStatus("blocked");
      const on = await isSubscribedHere().catch(() => false);
      if (!cancelled) setStatus(on ? "on" : "off");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    const result = await enablePush(businessId, publicKey);
    if (result === "enabled") setStatus("on");
    else if (result === "denied") setStatus("blocked");
    else setMessage("Could not turn alerts on. Check your connection and try again.");
    setBusy(false);
  }

  async function turnOff() {
    setBusy(true);
    setMessage(null);
    if (await disablePush(businessId)) setStatus("off");
    else setMessage("Could not turn alerts off. Check your connection and try again.");
    setBusy(false);
  }

  if (status === "loading") return <p className="text-sm text-ink-500">Checking this device…</p>;
  if (status === "unsupported") {
    return (
      <Alert tone="info" title="This browser cannot show alerts">
        On an iPhone or iPad, first add BizManager to your Home Screen (Share → Add to Home Screen), then open it from there and come back to this page.
      </Alert>
    );
  }
  if (status === "blocked") {
    return (
      <Alert tone="warning" title="Notifications are blocked">
        Allow notifications for this site in your browser settings, then reload this page.
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-700">
        {status === "on" ? "Low-stock alerts are ON for this device." : "Low-stock alerts are OFF for this device."}
      </p>
      {status === "on" ? (
        <Button type="button" variant="secondary" onClick={() => void turnOff()} disabled={busy}>
          Turn off on this device
        </Button>
      ) : (
        <Button type="button" onClick={() => void turnOn()} disabled={busy}>
          Turn on low-stock alerts
        </Button>
      )}
      {message && <p role="status" className="text-sm text-danger-700">{message}</p>}
    </div>
  );
}