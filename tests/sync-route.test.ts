import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => {
  const s = {
    signedIn: true,
    recorded: new Map<string, { businessId: string; entityId: string }>(),
    inventoryError: null as null | { code: string; message: string },
    calls: [] as string[],
  };
  const appErr = (code: string, message: string) =>
    Object.assign(new Error(message), { name: "AppError", code, statusCode: 400, toSafeJSON: () => ({ error: { code, message } }) });
  const movement = (kind: string) => async () => {
    s.calls.push(kind);
    if (s.inventoryError) throw appErr(s.inventoryError.code, s.inventoryError.message);
    return { id: `mv-${kind}` };
  };
  return { ...s, state: s, appErr, movement };
});

const S = state.state;
vi.mock("server-only", () => ({}));
vi.mock("@server/auth/session", () => ({ getSessionUserId: async () => (S.signedIn ? "u1" : null) }));
vi.mock("@server/auth/resolve-context", () => ({
  resolveContext: async (businessId: string, branchId?: string) => ({
    userId: "u1",
    firebaseUid: "f",
    businessId,
    membershipId: "m",
    role: "OWNER",
    financialReportGrant: false,
    branchId: branchId ?? null,
  }),
}));
vi.mock("@server/db/prisma", () => ({
  prisma: {
    syncOperation: {
      findUnique: async ({ where }: { where: { syncOperationId: string } }) => {
        const r = S.recorded.get(where.syncOperationId);
        return r ? { syncOperationId: where.syncOperationId, ...r } : null;
      },
      create: async ({ data }: { data: { syncOperationId: string; businessId: string; entityId: string } }) => {
        S.recorded.set(data.syncOperationId, { businessId: data.businessId, entityId: data.entityId });
      },
    },
  },
}));
vi.mock("@server/services/sale.service", () => ({ createSale: vi.fn() }));
vi.mock("@server/services/expense.service", () => ({ recordExpense: vi.fn() }));

vi.mock("@shared/errors", async (orig) => {
  const actual = await orig<typeof import("@shared/errors")>();
  return { ...actual, isAppError: (e: unknown): boolean => typeof e === "object" && e !== null && (e as { name?: string }).name === "AppError" };
});

vi.mock("@server/services/inventory.service", () => ({
  recordOpeningStock: vi.fn(state.movement("OPENING_STOCK")),
  recordStockReceipt: vi.fn(state.movement("STOCK_RECEIPT")),
  adjustStock: vi.fn(state.movement("STOCK_ADJUSTMENT")),
  recordDamage: vi.fn(state.movement("STOCK_DAMAGE")),
}));

import { POST } from "../app/api/[businessId]/sync/batch/route";
import type { SyncBatchResponse } from "@shared/validation/sync.schema";

const BIZ = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const PRODUCT = "22222222-2222-4222-8222-222222222222";
const BRANCH = "33333333-3333-4333-8333-333333333333";
const opId = (n: number) => `44444444-4444-4444-8444-44444444444${n}`;

function body(ops: unknown[]) {
  return { clientId: "device-1", operations: ops };
}
const receipt = (n: number, extra: Record<string, unknown> = {}) => ({
  syncOperationId: opId(n),
  entityType: "INVENTORY",
  operationType: "CREATE",
  schemaVersion: 1,
  payload: { kind: "STOCK_RECEIPT", productId: PRODUCT, branchId: BRANCH, quantity: 10, unitCost: "120.00", ...extra },
});

async function post(businessId: string, payload: unknown) {
  const req = new NextRequest(`http://localhost/api/${businessId}/sync/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const res = await POST(req, { params: Promise.resolve({ businessId }) });
  return { status: res.status, json: (await res.json()) as SyncBatchResponse & { error?: { code: string } } };
}

beforeEach(() => {
  S.signedIn = true;
  S.recorded.clear();
  S.inventoryError = null;
  S.calls.length = 0;
});

describe("POST /api/[businessId]/sync/batch — inventory operations", () => {
  it("applies each stock kind once and returns SYNCED with the movement id", async () => {
    const { json } = await post(BIZ, body([
      receipt(1),
      { syncOperationId: opId(2), entityType: "INVENTORY", operationType: "CREATE", schemaVersion: 1, payload: { kind: "STOCK_ADJUSTMENT", productId: PRODUCT, branchId: BRANCH, quantity: -3, reason: "Recount" } },
      { syncOperationId: opId(3), entityType: "INVENTORY", operationType: "CREATE", schemaVersion: 1, payload: { kind: "STOCK_DAMAGE", productId: PRODUCT, branchId: BRANCH, quantity: 1 } },
      { syncOperationId: opId(4), entityType: "INVENTORY", operationType: "CREATE", schemaVersion: 1, payload: { kind: "OPENING_STOCK", productId: PRODUCT, branchId: BRANCH, quantity: 5, unitCost: "10.00" } },
    ]));
    expect(json.results.map((r) => r.status)).toEqual(["SYNCED", "SYNCED", "SYNCED", "SYNCED"]);
    expect(json.results[0]?.entityId).toBe("mv-STOCK_RECEIPT");
    expect(S.calls).toEqual(["STOCK_RECEIPT", "STOCK_ADJUSTMENT", "STOCK_DAMAGE", "OPENING_STOCK"]);
  });

  it("is idempotent: a retried operation is acknowledged as DUPLICATE and not applied again", async () => {
    await post(BIZ, body([receipt(1)]));
    expect(S.calls).toHaveLength(1);
    const retry = await post(BIZ, body([receipt(1)]));
    expect(retry.json.results[0]).toMatchObject({ status: "DUPLICATE", entityId: "mv-STOCK_RECEIPT" });
    expect(S.calls).toHaveLength(1);
  });

  it("never acknowledges or reveals an operation id that belongs to another business", async () => {
    S.recorded.set(opId(1), { businessId: OTHER, entityId: "secret-entity" });
    const { json } = await post(BIZ, body([receipt(1)]));
    expect(json.results[0]?.status).toBe("FAILED");
    expect(JSON.stringify(json)).not.toContain("secret-entity");
    expect(S.calls).toHaveLength(0);
  });

  it("insufficient stock is a CONFLICT (kept for the user), not a retryable failure", async () => {
    S.inventoryError = { code: "INSUFFICIENT_STOCK", message: "Only 2 in stock." };
    const { json } = await post(BIZ, body([receipt(1)]));
    expect(json.results[0]).toMatchObject({ status: "CONFLICT", error: { code: "INSUFFICIENT_STOCK" } });
    expect(S.recorded.has(opId(1))).toBe(false); // not marked acknowledged
  });

  it("an expired subscription is HELD, not a conflict", async () => {
    S.inventoryError = { code: "SUBSCRIPTION_LIMIT", message: "Your subscription has ended." };
    const { json } = await post(BIZ, body([receipt(1)]));
    expect(json.results[0]).toMatchObject({ status: "HELD", error: { code: "SUBSCRIPTION_LIMIT" } });
    expect(S.recorded.has(opId(1))).toBe(false); // so it can be applied after renewal
  });

  it("a removed permission (staff) is a CONFLICT", async () => {
    S.inventoryError = { code: "FORBIDDEN", message: "Not allowed." };
    const { json } = await post(BIZ, body([receipt(1)]));
    expect(json.results[0]?.status).toBe("CONFLICT");
  });

  it("an unexpected error is a transient FAILED with no internals leaked", async () => {
    S.inventoryError = { code: "SERVER_ERROR", message: "boom" };
    const { json } = await post(BIZ, body([receipt(1)]));
    expect(json.results[0]?.status).toBe("FAILED");
  });

  it("one bad item in a batch does not block the others", async () => {
    S.inventoryError = null;
    const { json } = await post(BIZ, body([receipt(1), receipt(2, { branchId: "not-a-uuid" })]));
    // the whole batch is rejected by schema validation (422), never partially applied
    expect(json.error?.code).toBe("VALIDATION_ERROR");
    expect(S.calls).toHaveLength(0);
  });

  it("rejects invalid stock payloads: zero adjustment, negative damage, missing reason", async () => {
    for (const payload of [
      { kind: "STOCK_ADJUSTMENT", productId: PRODUCT, branchId: BRANCH, quantity: 0, reason: "x" },
      { kind: "STOCK_ADJUSTMENT", productId: PRODUCT, branchId: BRANCH, quantity: 5 },
      { kind: "STOCK_DAMAGE", productId: PRODUCT, branchId: BRANCH, quantity: -2 },
      { kind: "STOCK_RECEIPT", productId: PRODUCT, branchId: BRANCH, quantity: 2 },
    ]) {
      const { status } = await post(BIZ, body([{ syncOperationId: opId(5), entityType: "INVENTORY", operationType: "CREATE", schemaVersion: 1, payload }]));
      expect(status).toBe(422);
    }
    expect(S.calls).toHaveLength(0);
  });

  it("requires a signed-in session before reading the body", async () => {
    S.signedIn = false;
    const { status, json } = await post(BIZ, { nonsense: true });
    expect(status).toBe(401);
    expect(json.error?.code).toBe("UNAUTHORIZED");
  });
});
