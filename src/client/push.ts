import { urlBase64ToUint8Array } from "@shared/low-stock";

/** Can this browser do Web Push at all? (iPhone: only after "Add to Home Screen".) */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function isSubscribedHere(): Promise<boolean> {
  if (!pushSupported()) return false;
  return (await currentSubscription()) !== null;
}

export type EnableResult = "enabled" | "denied" | "failed";

/** Ask permission, subscribe this browser, and register it with the server. */
export async function enablePush(businessId: string, publicKey: string): Promise<EnableResult> {
  if ((await Notification.requestPermission()) !== "granted") return "denied";
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      }));
    const res = await fetch(`/api/${businessId}/push/subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    if (!res.ok) {
      await sub.unsubscribe().catch(() => undefined);
      return "failed";
    }
    return "enabled";
  } catch {
    return "failed";
  }
}

/** Stop alerts on this device: tell the server, then drop the browser subscription. */
export async function disablePush(businessId: string): Promise<boolean> {
  try {
    const sub = await currentSubscription();
    if (!sub) return true;
    const res = await fetch(`/api/${businessId}/push/subscription`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    if (!res.ok) return false;
    await sub.unsubscribe();
    return true;
  } catch {
    return false;
  }
}