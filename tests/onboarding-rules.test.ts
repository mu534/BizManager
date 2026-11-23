import { describe, expect, it } from "vitest";
import { planFirstSteps, startPage } from "@shared/onboarding-rules";

describe("startPage", () => {
  it("sends an owner with no plan and no payment to choose a plan", () => {
    expect(startPage({ isOwner: true, accessState: "NONE", hasSubmittedPayment: false })).toBe("choose-plan");
  });
  it("shows the dashboard once a payment has been submitted", () => {
    expect(startPage({ isOwner: true, accessState: "NONE", hasSubmittedPayment: true })).toBe("dashboard");
  });
  it("never forces staff to the payment page", () => {
    expect(startPage({ isOwner: false, accessState: "NONE", hasSubmittedPayment: false })).toBe("dashboard");
  });
  it("shows the dashboard for every shop that already has or had a plan", () => {
    for (const accessState of ["ACTIVE", "GRACE", "READ_ONLY", "CANCELLED", "SUSPENDED"] as const) {
      expect(startPage({ isOwner: true, accessState, hasSubmittedPayment: false })).toBe("dashboard");
    }
  });
});

describe("planFirstSteps", () => {
  it("starts at choosing a plan", () => {
    expect(planFirstSteps(null)).toEqual({ choose: "current", review: "upcoming", record: "upcoming" });
  });
  it("waits on review after a payment is submitted", () => {
    expect(planFirstSteps("PENDING")).toEqual({ choose: "done", review: "current", record: "upcoming" });
  });
  it("asks the owner to pay again after a rejection", () => {
    expect(planFirstSteps("REJECTED").choose).toBe("attention");
    expect(planFirstSteps("REJECTED").record).toBe("upcoming");
  });
  it("unlocks recording after approval", () => {
    expect(planFirstSteps("APPROVED")).toEqual({ choose: "done", review: "done", record: "current" });
  });
});