import { describe, it, expect, vi, beforeEach } from "vitest";

type B = { id: string; businessId: string; name: string; status: "ACTIVE" | "INACTIVE" | "DELETED"; isDefault: boolean; address: string | null; phone: string | null };
type M = { id: string; businessId: string; role: "OWNER" | "MANAGER" | "STAFF"; status: "ACTIVE" | "INACTIVE" | "REVOKED"; createdAt: Date };

const db = vi.hoisted(() => ({
  branches: [] as unknown[],
  members: [] as unknown[],
  access: [] as { memberId: string; branchId: string }[],
  audits: [] as string[],
  plan: "BUSINESS" as "BASIC" | "PRO" | "BUSINESS",
  seq: 0,
}));
const branches = () => db.branches as B[];
const members = () => db.members as M[];

vi.mock("server-only", () => ({}));
vi.mock("@server/auth/permissions", () => ({
  requireOwner: (ctx: { role: string }) => {
    if (ctx.role !== "OWNER") throw new Error("FORBIDDEN");
  },
}));
vi.mock("@server/services/subscription.service", () => ({
  FEATURE_KEYS: { MULTI_BRANCH: "MULTI_BRANCH" },
  LIMIT_KEYS: { MAX_BRANCHES: "MAX_BRANCHES" },
  requireFeature: async () => {
    if (db.plan !== "BUSINESS") throw Object.assign(new Error("plan"), { name: "AppError", code: "SUBSCRIPTION_LIMIT" });
    return { planCode: db.plan };
  },
  assertSubscriptionActive: async () => ({ planCode: db.plan }),
}));
vi.mock("@server/db/prisma", () => {
  const tx = {
    $queryRaw: async () => [],
    branch: {
      findMany: async ({ where }: { where: { businessId: string } }) =>
        branches().filter((b) => b.businessId === where.businessId && b.status !== "DELETED"),
      findFirst: async ({
        where,
      }: {
        where: { id?: string | { not: string }; businessId: string; name?: { equals: string } };
      }) =>
        branches().find((b) => {
          if (b.businessId !== where.businessId || b.status === "DELETED") return false;
          if (typeof where.id === "string" && b.id !== where.id) return false;
          if (typeof where.id === "object" && b.id === where.id.not) return false;
          if (where.name && b.name.toLowerCase() !== where.name.equals.toLowerCase()) return false;
          return true;
        }) ?? null,
      count: async ({ where }: { where: { businessId: string; status: string } }) =>
        branches().filter((b) => b.businessId === where.businessId && b.status === where.status).length,
      create: async ({ data }: { data: { businessId: string; name: string; address?: string; phone?: string } }) => {
        const b: B = { id: `new-${++db.seq}`, status: "ACTIVE", isDefault: false, address: data.address ?? null, phone: data.phone ?? null, businessId: data.businessId, name: data.name };
        branches().push(b);
        return b;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<B> }) => {
        const b = branches().find((x) => x.id === where.id);
        if (b) Object.assign(b, data);
        return b;
      },
    },
    businessMember: {
      findMany: async ({ where }: { where: { businessId: string } }) => members().filter((m) => m.businessId === where.businessId && m.role !== "OWNER"),
      findFirst: async ({ where }: { where: { id: string; businessId: string } }) =>
        members().find((m) => m.id === where.id && m.businessId === where.businessId) ?? null,
    },
    branchAccess: {
      createMany: async ({ data }: { data: { businessMemberId: string; branchId: string }[] }) => {
        for (const d of data) if (!db.access.some((a) => a.memberId === d.businessMemberId && a.branchId === d.branchId)) db.access.push({ memberId: d.businessMemberId, branchId: d.branchId });
      },
      deleteMany: async ({ where }: { where: { businessMemberId: string } }) => {
        db.access = db.access.filter((a) => a.memberId !== where.businessMemberId);
      },
      findMany: async ({ where }: { where: { businessMemberId: string } }) =>
        db.access.filter((a) => a.memberId === where.businessMemberId).map((a) => ({ branchId: a.branchId })),
    },
    auditLog: { create: async ({ data }: { data: { action: string } }) => void db.audits.push(data.action) },
  };
  return { prisma: { ...tx, $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } };
});

import { createBranch, setBranchStatus, setMemberBranchAccess, updateBranch } from "@server/services/branch.service";
import { UserRole, type TenantContext } from "@shared/types/auth.types";

const BIZ = "biz-1";
const ctx: TenantContext = { userId: "u-owner", firebaseUid: "f", businessId: BIZ, membershipId: "m-owner", role: UserRole.OWNER, financialReportGrant: false, branchId: null };

beforeEach(() => {
  db.branches.length = 0;
  db.members.length = 0;
  db.access = [];
  db.audits.length = 0;
  db.plan = "BUSINESS";
  branches().push(
    { id: "b-main", businessId: BIZ, name: "Main", status: "ACTIVE", isDefault: true, address: null, phone: null },
    { id: "b-foreign", businessId: "biz-2", name: "Foreign", status: "ACTIVE", isDefault: true, address: null, phone: null },
  );
  members().push(
    { id: "m-owner", businessId: BIZ, role: "OWNER", status: "ACTIVE", createdAt: new Date(1) },
    { id: "m-staff", businessId: BIZ, role: "STAFF", status: "ACTIVE", createdAt: new Date(2) },
    { id: "m-mgr", businessId: BIZ, role: "MANAGER", status: "INACTIVE", createdAt: new Date(3) },
    { id: "m-foreign", businessId: "biz-2", role: "STAFF", status: "ACTIVE", createdAt: new Date(4) },
  );
});

describe("createBranch", () => {
  it("creates a branch, audited", async () => {
    const r = await createBranch(ctx, { name: "Bole" });
    expect(branches().find((b) => b.id === r.id)).toMatchObject({ businessId: BIZ, name: "Bole", status: "ACTIVE", isDefault: false });
    expect(db.audits).toContain("BRANCH_CREATED");
  });

  it("going from one branch to several keeps every existing member's access to the original branch", async () => {
    await createBranch(ctx, { name: "Bole" });
    expect(db.access.filter((a) => a.branchId === "b-main").map((a) => a.memberId).sort()).toEqual(["m-mgr", "m-staff"]);
    // …and the new branch is NOT granted to anyone but the owner.
    expect(db.access.some((a) => a.branchId !== "b-main")).toBe(false);
    // the other business's member is untouched
    expect(db.access.some((a) => a.memberId === "m-foreign")).toBe(false);
  });

  it("a third branch does not re-run the grant", async () => {
    await createBranch(ctx, { name: "Bole" });
    db.access.length = 0;
    await createBranch(ctx, { name: "Piassa" });
    expect(db.access).toHaveLength(0);
  });

  it("is a Business-plan feature", async () => {
    db.plan = "PRO";
    await expect(createBranch(ctx, { name: "Bole" })).rejects.toThrow();
    expect(branches().filter((b) => b.businessId === BIZ)).toHaveLength(1);
  });

  it("rejects a duplicate name (case-insensitive) and non-owners", async () => {
    await expect(createBranch(ctx, { name: "  main " })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(createBranch({ ...ctx, role: UserRole.MANAGER }, { name: "Bole" })).rejects.toThrow("FORBIDDEN");
  });
});

describe("updateBranch / setBranchStatus", () => {
  it("cannot touch another business's branch", async () => {
    await expect(updateBranch(ctx, { branchId: "b-foreign", name: "Hacked" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setBranchStatus(ctx, "b-foreign", "INACTIVE")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(branches().find((b) => b.id === "b-foreign")?.name).toBe("Foreign");
  });

  it("protects the main branch and the last active branch", async () => {
    await expect(setBranchStatus(ctx, "b-main", "INACTIVE")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const { id } = await createBranch(ctx, { name: "Bole" });
    await setBranchStatus(ctx, id, "INACTIVE");
    expect(branches().find((b) => b.id === id)?.status).toBe("INACTIVE");
    expect(db.audits).toContain("BRANCH_DEACTIVATED");
    // only Main is active now → still protected
    await expect(setBranchStatus(ctx, "b-main", "INACTIVE")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("closing is allowed on a lapsed plan; reopening needs the feature", async () => {
    const { id } = await createBranch(ctx, { name: "Bole" });
    db.plan = "PRO";
    await setBranchStatus(ctx, id, "INACTIVE");
    await expect(setBranchStatus(ctx, id, "ACTIVE")).rejects.toThrow();
  });

  it("renames within the business, rejecting a clash", async () => {
    const { id } = await createBranch(ctx, { name: "Bole" });
    await expect(updateBranch(ctx, { branchId: id, name: "MAIN" })).rejects.toMatchObject({ code: "CONFLICT" });
    await updateBranch(ctx, { branchId: id, name: "Bole Atlas" });
    expect(branches().find((b) => b.id === id)?.name).toBe("Bole Atlas");
  });
});

describe("setMemberBranchAccess", () => {
  it("replaces the member's branches, audited, and is a no-op when unchanged", async () => {
    const { id } = await createBranch(ctx, { name: "Bole" });
    db.audits.length = 0;
    await setMemberBranchAccess(ctx, "m-staff", [id]);
    expect(db.access.filter((a) => a.memberId === "m-staff").map((a) => a.branchId)).toEqual([id]);
    expect(db.audits).toEqual(["BRANCH_ACCESS_CHANGED"]);
    await setMemberBranchAccess(ctx, "m-staff", [id]);
    expect(db.audits).toHaveLength(1);
  });

  it("can remove all access (member can then use no branch)", async () => {
    await createBranch(ctx, { name: "Bole" });
    await setMemberBranchAccess(ctx, "m-staff", []);
    expect(db.access.filter((a) => a.memberId === "m-staff")).toHaveLength(0);
  });

  it("rejects another business's branch id and another business's member", async () => {
    await expect(setMemberBranchAccess(ctx, "m-staff", ["b-foreign"])).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(setMemberBranchAccess(ctx, "m-foreign", ["b-main"])).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.access.some((a) => a.branchId === "b-foreign")).toBe(false);
  });

  it("the owner needs no assignment", async () => {
    await expect(setMemberBranchAccess(ctx, "m-owner", ["b-main"])).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("only the owner may assign", async () => {
    await expect(setMemberBranchAccess({ ...ctx, role: UserRole.MANAGER }, "m-staff", [])).rejects.toThrow("FORBIDDEN");
  });
});
