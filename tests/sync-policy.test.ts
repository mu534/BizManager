import { describe, it, expect } from "vitest";
import {
  nextQueueState,
  manualRetryState,
  summarizeQueue,
  backoffMs,
  isDeliverable,
  needsAttention,
  MAX_RETRIES,
  NETWORK_RETRY_MS,
  HELD_RETRY_MS,
} from "@shared/sync-policy";
import { classifyServiceError } from "@shared/sync-results";
import { AppErrorCode } from "@shared/errors";

const NOW = 1_800_000_000_000;

describe("connectivity problems never consume retries or escalate", () => {
  it("many consecutive network failures keep the item pending with the same retry count", () => {
    let state = { retryCount: 0 };
    for (let i = 0; i < 200; i++) {
      const next = nextQueueState(state, { kind: "network" }, NOW + i);
      expect(next.status).toBe("pending");
      expect(next.retryCount).toBe(0);
      expect(next.lastErrorCode).toBe("NETWORK");
      state = next;
    }
  });

  it("retries soon after a network failure so sync resumes quickly when back online", () => {
    expect(nextQueueState({ retryCount: 3 }, { kind: "network" }, NOW).retryAt).toBe(NOW + NETWORK_RETRY_MS);
  });

  it("a signed-out session keeps the item pending without burning retries", () => {
    const s = nextQueueState({ retryCount: 2 }, { kind: "unauthenticated" }, NOW);
    expect(s).toMatchObject({ status: "pending", retryCount: 2, lastErrorCode: "AUTH" });
  });
});

describe("subscription restriction", () => {
  it("is HELD, not a conflict, and does not count as a retry", () => {
    const s = nextQueueState({ retryCount: 1 }, { kind: "result", status: "HELD", code: "SUBSCRIPTION_LIMIT", message: "Renew to continue" }, NOW);
    expect(s).toMatchObject({ status: "held", retryCount: 1, lastErrorCode: "SUBSCRIPTION_LIMIT", lastError: "Renew to continue" });
    expect(s.retryAt).toBe(NOW + HELD_RETRY_MS);
  });

  it("held items stay deliverable so they resume after renewal", () => {
    expect(isDeliverable("held")).toBe(true);
    expect(isDeliverable("pending")).toBe(true);
    expect(isDeliverable("conflict")).toBe(false);
    expect(isDeliverable("discarded")).toBe(false);
    expect(needsAttention("held")).toBe(false);
  });

  it("repeated holds never escalate however long the subscription stays lapsed", () => {
    let state = { retryCount: 0 };
    for (let i = 0; i < 100; i++) {
      const next = nextQueueState(state, { kind: "result", status: "HELD" }, NOW);
      expect(next.status).toBe("held");
      state = next;
    }
  });
});

describe("server outcomes", () => {
  it("SYNCED and DUPLICATE both complete the item", () => {
    for (const status of ["SYNCED", "DUPLICATE"] as const) {
      expect(nextQueueState({ retryCount: 4 }, { kind: "result", status }, NOW)).toMatchObject({ status: "synced", lastError: null });
    }
  });

  it("CONFLICT keeps the item with the reason and stops automatic retries", () => {
    const s = nextQueueState({ retryCount: 0 }, { kind: "result", status: "CONFLICT", code: "INSUFFICIENT_STOCK", message: "Only 2 left" }, NOW);
    expect(s).toMatchObject({ status: "conflict", lastError: "Only 2 left", lastErrorCode: "INSUFFICIENT_STOCK" });
    expect(needsAttention(s.status)).toBe(true);
  });

  it("transient server failures back off exponentially (bounded) and escalate to failed — never deleted", () => {
    let state = { retryCount: 0 };
    let last = nextQueueState(state, { kind: "result", status: "FAILED" }, NOW);
    for (let i = 1; i < MAX_RETRIES - 1; i++) {
      expect(last.status).toBe("pending");
      state = last;
      last = nextQueueState(state, { kind: "http", status: 503 }, NOW);
    }
    expect(last.status).toBe("pending");
    const escalated = nextQueueState(last, { kind: "http", status: 503 }, NOW);
    expect(escalated.status).toBe("failed");
    expect(escalated.retryCount).toBe(MAX_RETRIES);
  });

  it("backoff doubles and is capped at one hour", () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(2)).toBe(120_000);
    expect(backoffMs(30)).toBe(3_600_000);
  });
});

describe("recovery and summaries", () => {
  it("manual retry resets the item for immediate delivery", () => {
    expect(manualRetryState()).toEqual({ status: "pending", retryCount: 0, retryAt: 0, lastError: null, lastErrorCode: null });
  });

  it("summarizeQueue separates waiting, paused and needs-attention; ignores finished items", () => {
    expect(summarizeQueue(["pending", "pending", "submitting", "held", "conflict", "failed", "synced", "discarded"])).toEqual({
      pending: 2,
      submitting: 1,
      held: 1,
      needsAttention: 2,
    });
  });
});

describe("classifyServiceError (server → sync result)", () => {
  it("maps subscription restriction to HELD", () => {
    expect(classifyServiceError(AppErrorCode.SUBSCRIPTION_LIMIT)).toBe("HELD");
  });
  it("maps business-rule rejections to CONFLICT", () => {
    for (const c of [AppErrorCode.INSUFFICIENT_STOCK, AppErrorCode.FORBIDDEN, AppErrorCode.TENANT_VIOLATION, AppErrorCode.VALIDATION_ERROR, AppErrorCode.NOT_FOUND]) {
      expect(classifyServiceError(c)).toBe("CONFLICT");
    }
  });
  it("treats unknown/server errors as transient FAILED", () => {
    expect(classifyServiceError(AppErrorCode.SERVER_ERROR)).toBe("FAILED");
    expect(classifyServiceError("SOMETHING_NEW")).toBe("FAILED");
  });
});
