/** Pure low-stock helpers shared by the server (what to send) and client (subscribing). */

export interface LowStockHit {
  productId: string;
  productName: string;
  /** Quantity left at the branch after the change. */
  quantity: number;
  /** The product's alert level (minStockLevel). */
  minStockLevel: number;
}

/**
 * Alert only when stock *crosses* down to or below its alert level, so a product
 * that stays low does not notify again on every sale.
 */
export function crossedLowStock(before: number, after: number, minStockLevel: number): boolean {
  return after <= minStockLevel && before > minStockLevel;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Where tapping the notification goes (same-origin path). */
  url: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  tag: string;
}

const MAX_NAMES = 3;

/** Notification text for one or several products running low at a branch. */
export function buildLowStockMessage(
  hits: readonly LowStockHit[],
  opts: { branchName: string; businessId: string; branchId: string },
): PushPayload | null {
  if (hits.length === 0) return null;
  const url = `/app/${opts.businessId}/inventory`;
  const tag = `low-stock-${opts.branchId}`;
  const where = opts.branchName ? ` — ${opts.branchName}` : "";

  const only = hits.length === 1 ? hits[0] : undefined;
  if (only) {
    const h = only;
    const body = h.quantity <= 0 ? `${h.productName} is out of stock` : `${h.productName}: ${h.quantity} left`;
    return { title: `Low stock${where}`, body, url, tag };
  }
  const names = hits.slice(0, MAX_NAMES).map((h) => h.productName);
  const more = hits.length - names.length;
  return {
    title: `${hits.length} products running low${where}`,
    body: names.join(", ") + (more > 0 ? ` and ${more} more` : ""),
    url,
    tag,
  };
}

/** Web Push needs the VAPID public key as bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}