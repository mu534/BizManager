import type { PushPayload } from "@shared/low-stock";

export interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Sends one notification; injected so delivery can be tested without a network. */
export type PushSender = (
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  body: string,
) => Promise<void>;

/**
 * Send a notification to every subscription. A subscription the push service says
 * is gone (HTTP 404/410) is reported through onGone so it can be deleted; any other
 * failure is ignored for that device and never stops the rest.
 */
export async function deliverPush(
  subs: readonly StoredSubscription[],
  payload: PushPayload,
  send: PushSender,
  onGone: (ids: string[]) => Promise<void>,
): Promise<{ sent: number; gone: number; failed: number }> {
  const body = JSON.stringify(payload);
  const gone: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
        sent++;
      } catch (err) {
        const status = typeof err === "object" && err !== null && "statusCode" in err ? Number((err as { statusCode?: unknown }).statusCode) : 0;
        if (status === 404 || status === 410) gone.push(s.id);
        else failed++;
      }
    }),
  );

  if (gone.length > 0) await onGone(gone).catch(() => undefined);
  return { sent, gone: gone.length, failed };
}