import { describe, it, expect } from "vitest";
import { canAdminTransition, canCustomerReply, statusAfterAdminReply, statusAfterCustomerReply, isTicketStatus, TICKET_STATUSES } from "@shared/support-rules";

describe("support ticket rules", () => {
  it("closed is final: no admin transition out and no customer reply", () => {
    for (const to of TICKET_STATUSES) expect(canAdminTransition("CLOSED", to)).toBe(false);
    expect(canCustomerReply("CLOSED")).toBe(false);
  });

  it("customers can reply to any open conversation", () => {
    for (const s of ["OPEN", "IN_PROGRESS", "RESOLVED"] as const) expect(canCustomerReply(s)).toBe(true);
  });

  it("a customer reply reopens a resolved ticket and leaves the others alone", () => {
    expect(statusAfterCustomerReply("RESOLVED")).toBe("OPEN");
    expect(statusAfterCustomerReply("OPEN")).toBe("OPEN");
    expect(statusAfterCustomerReply("IN_PROGRESS")).toBe("IN_PROGRESS");
  });

  it("an admin reply moves an open ticket to in-progress only", () => {
    expect(statusAfterAdminReply("OPEN")).toBe("IN_PROGRESS");
    expect(statusAfterAdminReply("RESOLVED")).toBe("RESOLVED");
    expect(statusAfterAdminReply("IN_PROGRESS")).toBe("IN_PROGRESS");
  });

  it("admins can resolve, close and reopen; no self-transitions", () => {
    expect(canAdminTransition("OPEN", "RESOLVED")).toBe(true);
    expect(canAdminTransition("RESOLVED", "OPEN")).toBe(true);
    expect(canAdminTransition("IN_PROGRESS", "CLOSED")).toBe(true);
    for (const s of TICKET_STATUSES) expect(canAdminTransition(s, s)).toBe(false);
  });

  it("validates status strings", () => {
    expect(isTicketStatus("OPEN")).toBe(true);
    expect(isTicketStatus("DELETED")).toBe(false);
    expect(isTicketStatus(undefined)).toBe(false);
  });
});
