import { describe, expect, it } from "vitest";
import { buildLowStockMessage, crossedLowStock, urlBase64ToUint8Array, type LowStockHit } from "@shared/low-stock";
import { deliverPush, type StoredSubscription } from "../src/server/services/push-delivery";

const hit = (name: string, quantity: number, productId = name): LowStockHit => ({ productId, productName: name, quantity, minStockLevel: 5 });
const ctx = { branchName: "Bole", businessId: "b1", branchId: "br1" };

describe("crossedLowStock", () => {
  it("alerts only when stock drops through the alert level", () => {
    expect(crossedLowStock(6, 5, 5)).toBe(true);
    expect(crossedLowStock(6, 2, 5)).toBe(true);
    expect(crossedLowStock(5, 4, 5)).toBe(false); // already low
    expect(crossedLowStock(10, 8, 5)).toBe(false); // still fine
  });
  it("treats a level of 0 as 'out of stock'", () => {
    expect(crossedLowStock(1, 0, 0)).toBe(true);
    expect(crossedLowStock(0, 0, 0)).toBe(false);
  });
});

describe("buildLowStockMessage", () => {
  it("returns nothing for no hits", () => {
    expect(buildLowStockMessage([], ctx)).toBeNull();
  });
  it("describes one product, including out of stock", () => {
    expect(buildLowStockMessage([hit("Sugar", 3)], ctx)).toMatchObject({ title: "Low stock — Bole", body: "Sugar: 3 left", url: "/app/b1/inventory", tag: "low-stock-br1" });
    expect(buildLowStockMessage([hit("Sugar", 0)], ctx)?.body).toBe("Sugar is out of stock");
  });
  it("summarises many products without a long list", () => {
    const m = buildLowStockMessage([hit("A", 1), hit("B", 1), hit("C", 1), hit("D", 1), hit("E", 1)], ctx);
    expect(m?.title).toBe("5 products running low — Bole");
    expect(m?.body).toBe("A, B, C and 2 more");
  });
});

describe("urlBase64ToUint8Array", () => {
  it("decodes url-safe base64 with missing padding", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(urlBase64ToUint8Array("-_8"))).toEqual([251, 255]);
  });
});

describe("deliverPush", () => {
  const subs: StoredSubscription[] = [1, 2, 3].map((n) => ({ id: `s${n}`, endpoint: `https://push.example/${n}`, p256dh: "k", auth: "a" }));
  const payload = { title: "t", body: "b", url: "/app", tag: "x" };

  it("sends to every device and deletes only the ones the push service says are gone", async () => {
    const removed: string[][] = [];
    const result = await deliverPush(
      subs,
      payload,
      async (sub) => {
        if (sub.endpoint.endsWith("/2")) throw Object.assign(new Error("gone"), { statusCode: 410 });
        if (sub.endpoint.endsWith("/3")) throw Object.assign(new Error("boom"), { statusCode: 500 });
      },
      async (ids) => void removed.push(ids),
    );
    expect(result).toEqual({ sent: 1, gone: 1, failed: 1 });
    expect(removed).toEqual([["s2"]]);
  });
  it("sends the JSON payload", async () => {
    const bodies: string[] = [];
    await deliverPush(subs.slice(0, 1), payload, async (_s, body) => void bodies.push(body), async () => undefined);
    expect(JSON.parse(bodies[0] ?? "null")).toEqual(payload);
  });
});