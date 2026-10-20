import { describe, it, expect, vi, beforeEach } from "vitest";

type Member = {
  id: string;
  userId: string;
  businessId: string;
  role: "OWNER" | "MANAGER" | "STAFF";
  status: "ACTIVE" | "INACTIVE" | "REVOKED";
  canViewFinancialReports: boolean;
  createdAt: Date;
};

const db = vi.hoisted(() => ({
  members: [] as unknown[],
  users: [] as { id: string; email: string; name: string }[],
  audits: [] as { businessId: string; action: string; entityId: string }[],
  plan: "PRO" as "BASIC" | "PRO" | "BUSINESS",
  featureAllowed: true,
  writable: true,
  seq: 0,
}));
const members = () => db.members as Member[];
function must<T>(v: T | undefined): T {
  if (v === undefined) throw new Error("expected value to exist");
  return v;
}

vi.mock("server-only", () => ({}));
vi.mock("@server/services/subscription.service", () => ({
  FEATURE_KEYS: { MULTI_USER: "MULTI_USER" },
  LIMIT_KEYS: { MAX_USERS: "MAX_USERS" },
  requireFeature: async () => {
    if (!db.featureAllowed) throw Object.assign(new Error("plan"), { name: "AppError", code: "SUBSCRIPTION_LIMIT" });
    return { planCode: db.plan };
  },
  assertSubscriptionActive: async () => {
    if (!db.writable) throw Object.assign(new Error("readonly"), { name: "AppError", code: "SUBSCRIPTION_LIMIT" });
    return { planCode: db.plan };
  },
}));
vi.mock("@server/auth/permissions", () => ({
  requireOwner: (ctx: { role: string }) => {
    if (ctx.role !== "OWNER") throw new Error("FORBIDDEN");
  },
}));
vi.mock("@server/db/prisma", () => {
  const tx = {
    $queryRaw: async () => [],
    user: {
      findFirst: async ({ where }: { where: { email: { equals: string } } }) =>
        db.users.find((u) => u.email.toLowerCase() === where.email.equals.toLowerCase()) ?? null,
    },
    businessMember: {
      findMany: async ({ where }: { where: { businessId: string } }) =>
        members()
          .filter((m) => m.businessId === where.businessId)
          .map((m) => ({ ...m, user: db.users.find((u) => u.id === m.userId) })),
      findFirst: async ({ where }: { where: { id: string; businessId: string } }) =>
        members().find((m) => m.id === where.id && m.businessId === where.businessId) ?? null,
      findUnique: async ({ where }: { where: { userId_businessId: { userId: string; businessId: string } } }) =>
        members().find(
          (m) => m.userId === where.userId_businessId.userId && m.businessId === where.userId_businessId.businessId,
        ) ?? null,
      count: async ({ where }: { where: { businessId: string; status: string } }) =>
        members().filter((m) => m.businessId === where.businessId && m.status === where.status).length,
      create: async ({ data }: { data: Partial<Member> & { userId: string; businessId: string; role: Member["role"] } }) => {
        const m: Member = {
          id: `00000000-0000-4000-8000-00000000000${++db.seq}`,
          status: "ACTIVE",
          canViewFinancialReports: false,
          createdAt: new Date(),
          ...data,
        };
        members().push(m);
        return m;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Member> }) => {
        const m = must(members().find((x) => x.id === where.id));
        Object.assign(m, data);
        return m;
      },
    },
    auditLog: {
      create: async ({ data }: { data: { businessId: string; action: string; entityId: string } }) => {
        db.audits.push(data);
      },
    },
  };
  return { prisma: { ...tx, $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } };
});

import { addMember, updateMember, listTeam } from "@server/services/team.service";
import type { TenantContext } from "@shared/types/auth.types";
import { UserRole } from "@shared/types/auth.types";

const BIZ = "biz-1";
const OTHER_BIZ = "biz-2";
const ownerCtx: TenantContext = {
  userId: "u-owner",
  firebaseUid: "f",
  businessId: BIZ,
  membershipId: "m-owner",
  role: UserRole.OWNER,
  financialReportGrant: false,
  branchId: null,
};
const MGR_ID = "11111111-1111-4111-8111-111111111111";
const FOREIGN_ID = "22222222-2222-4222-8222-222222222222";

function seed() {
  db.members.length = 0;
  db.users.length = 0;
  db.audits.length = 0;
  db.plan = "PRO";
  db.featureAllowed = true;
  db.writable = true;
  db.users.push(
    { id: "u-owner", email: "owner@x.com", name: "Owner" },
    { id: "u-mgr", email: "mgr@x.com", name: "Manager" },
    { id: "u-new", email: "new@x.com", name: "Newcomer" },
    { id: "u-foreign", email: "foreign@x.com", name: "Foreign" },
  );
  members().push(
    { id: "m-owner", userId: "u-owner", businessId: BIZ, role: "OWNER", status: "ACTIVE", canViewFinancialReports: false, createdAt: new Date(1) },
    { id: MGR_ID, userId: "u-mgr", businessId: BIZ, role: "MANAGER", status: "ACTIVE", canViewFinancialReports: false, createdAt: new Date(2) },
    { id: FOREIGN_ID, userId: "u-foreign", businessId: OTHER_BIZ, role: "MANAGER", status: "ACTIVE", canViewFinancialReports: false, createdAt: new Date(3) },
  );
}
beforeEach(seed);

describe("report-access grants", () => {
  it("owner grants a manager access, audited", async () => {
    await updateMember(ownerCtx, MGR_ID, { financialReportAccess: true });
    expect(must(members().find((m) => m.id === MGR_ID)).canViewFinancialReports).toBe(true);
    expect(db.audits.map((a) => a.action)).toEqual(["REPORT_ACCESS_GRANTED"]);
    const team = await listTeam(ownerCtx);
    expect(team.find((t) => t.memberId === MGR_ID)?.canSeeFinancialReports).toBe(true);
  });

  it("owner can revoke, and revoking works even when the plan feature has lapsed", async () => {
    must(members().find((m) => m.id === MGR_ID)).canViewFinancialReports = true;
    db.featureAllowed = false;
    db.writable = false;
    await updateMember(ownerCtx, MGR_ID, { financialReportAccess: false });
    expect(must(members().find((m) => m.id === MGR_ID)).canViewFinancialReports).toBe(false);
  });

  it("granting needs the Pro feature", async () => {
    db.featureAllowed = false;
    await expect(updateMember(ownerCtx, MGR_ID, { financialReportAccess: true })).rejects.toThrow();
    expect(must(members().find((m) => m.id === MGR_ID)).canViewFinancialReports).toBe(false);
  });

  it("only the owner can manage the team", async () => {
    const mgrCtx = { ...ownerCtx, userId: "u-mgr", role: UserRole.MANAGER, financialReportGrant: true };
    await expect(updateMember(mgrCtx, MGR_ID, { status: "INACTIVE" })).rejects.toThrow("FORBIDDEN");
    await expect(addMember(mgrCtx, { email: "new@x.com", role: "STAFF" })).rejects.toThrow("FORBIDDEN");
    await expect(listTeam(mgrCtx)).rejects.toThrow("FORBIDDEN");
  });

  it("cannot touch a member of another business (tenant isolation)", async () => {
    await expect(updateMember(ownerCtx, FOREIGN_ID, { financialReportAccess: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(must(members().find((m) => m.id === FOREIGN_ID)).canViewFinancialReports).toBe(false);
    expect(db.audits).toHaveLength(0);
  });

  it("cannot change the owner or oneself", async () => {
    await expect(updateMember(ownerCtx, "m-owner", { status: "INACTIVE" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("demotion clears the grant atomically with the role change", async () => {
    must(members().find((m) => m.id === MGR_ID)).canViewFinancialReports = true;
    await updateMember(ownerCtx, MGR_ID, { role: "STAFF" });
    const m = must(members().find((x) => x.id === MGR_ID));
    expect(m.role).toBe("STAFF");
    expect(m.canViewFinancialReports).toBe(false);
    expect(db.audits.map((a) => a.action)).toEqual(["MEMBER_ROLE_CHANGED", "REPORT_ACCESS_REVOKED"]);
  });
});

describe("adding members", () => {
  it("adds an existing user with no report access by default", async () => {
    await addMember(ownerCtx, { email: "NEW@x.com", role: "MANAGER" });
    const added = must(members().find((m) => m.userId === "u-new"));
    expect(added).toMatchObject({ businessId: BIZ, role: "MANAGER", status: "ACTIVE", canViewFinancialReports: false });
    expect(db.audits.map((a) => a.action)).toEqual(["MEMBER_ADDED"]);
  });

  it("explains what to do when the person has no account yet", async () => {
    await expect(addMember(ownerCtx, { email: "ghost@x.com", role: "STAFF" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("refuses a duplicate member", async () => {
    await expect(addMember(ownerCtx, { email: "mgr@x.com", role: "STAFF" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("enforces the plan's user cap (Pro = 10)", async () => {
    for (let i = 0; i < 8; i++) {
      members().push({ id: `x${i}`, userId: `ux${i}`, businessId: BIZ, role: "STAFF", status: "ACTIVE", canViewFinancialReports: false, createdAt: new Date() });
    }
    // owner + manager + 8 staff = 10 active
    await expect(addMember(ownerCtx, { email: "new@x.com", role: "STAFF" })).rejects.toMatchObject({ code: "SUBSCRIPTION_LIMIT" });
    expect(members().some((m) => m.userId === "u-new")).toBe(false);
  });

  it("is blocked on a plan without the feature (Basic) and when read-only", async () => {
    db.featureAllowed = false;
    await expect(addMember(ownerCtx, { email: "new@x.com", role: "STAFF" })).rejects.toThrow();
    db.featureAllowed = true;
    db.writable = false;
    await expect(addMember(ownerCtx, { email: "new@x.com", role: "STAFF" })).rejects.toThrow();
  });

  it("reactivating a removed teammate never restores an old grant", async () => {
    const m = must(members().find((x) => x.id === MGR_ID));
    m.status = "INACTIVE";
    m.canViewFinancialReports = true; // stale flag from before deactivation
    await addMember(ownerCtx, { email: "mgr@x.com", role: "MANAGER" }).catch(() => undefined);
    await updateMember(ownerCtx, MGR_ID, { status: "ACTIVE" });
    expect(must(members().find((x) => x.id === MGR_ID)).canViewFinancialReports).toBe(false);
  });
});
