import { describe, it, expect, vi, beforeEach } from "vitest";

type B = { id: string; businessId: string; name: string; status: "ACTIVE" | "INACTIVE" | "DELETED"; isDefault: boolean };
const db = vi.hoisted(() => ({ branches: [] as unknown[], grants: [] as { memberId: string; branchId: string }[] }));
const branches = () => db.branches as B[];

vi.mock("server-only", () => ({}));
vi.mock("@server/db/prisma", () => ({
  prisma: {
    branch: {
      findUnique: async ({ where }: { where: { id: string } }) => branches().find((b) => b.id === where.id) ?? null,
      count: async ({ where }: { where: { businessId: string } }) =>
        branches().filter((b) => b.businessId === where.businessId && b.status !== "DELETED").length,
      findMany: async ({ where }: { where: { businessId: string } }) =>
        branches().filter((b) => b.businessId === where.businessId && b.status !== "DELETED"),
    },
    branchAccess: {
      findUnique: async ({ where }: { where: { businessMemberId_branchId: { businessMemberId: string; branchId: string } } }) =>
        db.grants.find(
          (g) => g.memberId === where.businessMemberId_branchId.businessMemberId && g.branchId === where.businessMemberId_branchId.branchId,
        ) ?? null,
      findMany: async ({ where }: { where: { businessMemberId: string } }) =>
        db.grants.filter((g) => g.memberId === where.businessMemberId).map((g) => ({ branchId: g.branchId })),
    },
  },
}));

import { requireBranchAccess, listAccessibleBranches } from "@server/services/branch-access.service";
import { UserRole } from "@shared/types/auth.types";

const BIZ = "biz-1";
const owner = { businessId: BIZ, membershipId: "m-owner", role: UserRole.OWNER };
const staff = { businessId: BIZ, membershipId: "m-staff", role: UserRole.STAFF };

function seed(multi: boolean) {
  db.branches.length = 0;
  db.grants.length = 0;
  branches().push(
    { id: "b-main", businessId: BIZ, name: "Main", status: "ACTIVE", isDefault: true },
    { id: "b-foreign", businessId: "biz-2", name: "Foreign", status: "ACTIVE", isDefault: true },
    { id: "b-gone", businessId: BIZ, name: "Gone", status: "DELETED", isDefault: false },
  );
  if (multi) {
    branches().push(
      { id: "b-bole", businessId: BIZ, name: "Bole", status: "ACTIVE", isDefault: false },
      { id: "b-closed", businessId: BIZ, name: "Closed", status: "INACTIVE", isDefault: false },
    );
  }
}

describe("requireBranchAccess — single-branch business", () => {
  beforeEach(() => seed(false));

  it("everyone may use the one branch (existing shops are unaffected)", async () => {
    expect((await requireBranchAccess(staff, "b-main")).id).toBe("b-main");
    expect((await requireBranchAccess(staff, "b-main", { write: true })).id).toBe("b-main");
  });
});

describe("requireBranchAccess — multi-branch business", () => {
  beforeEach(() => seed(true));

  it("owner may use any branch of the business", async () => {
    expect((await requireBranchAccess(owner, "b-bole", { write: true })).id).toBe("b-bole");
  });

  it("a member without a grant is refused; with a grant is allowed", async () => {
    await expect(requireBranchAccess(staff, "b-bole")).rejects.toMatchObject({ code: "FORBIDDEN" });
    db.grants.push({ memberId: "m-staff", branchId: "b-bole" });
    expect((await requireBranchAccess(staff, "b-bole")).id).toBe("b-bole");
    await expect(requireBranchAccess(staff, "b-main")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("another business's branch is a tenant violation — even for the owner", async () => {
    await expect(requireBranchAccess(owner, "b-foreign")).rejects.toMatchObject({ code: "TENANT_VIOLATION" });
    await expect(requireBranchAccess(staff, "b-foreign")).rejects.toMatchObject({ code: "TENANT_VIOLATION" });
  });

  it("deleted and unknown branches are not found", async () => {
    await expect(requireBranchAccess(owner, "b-gone")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(requireBranchAccess(owner, "nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("an inactive branch is readable (history) but rejects new transactions", async () => {
    expect((await requireBranchAccess(owner, "b-closed")).id).toBe("b-closed");
    await expect(requireBranchAccess(owner, "b-closed", { write: true })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("a grant for a different member does not help", async () => {
    db.grants.push({ memberId: "someone-else", branchId: "b-bole" });
    await expect(requireBranchAccess(staff, "b-bole")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("listAccessibleBranches", () => {
  beforeEach(() => seed(true));

  it("owner: all non-deleted branches of this business, default first", async () => {
    expect((await listAccessibleBranches(owner)).map((b) => b.id)).toEqual(["b-main", "b-bole", "b-closed"]);
  });

  it("member: only granted branches; never another business's", async () => {
    db.grants.push({ memberId: "m-staff", branchId: "b-bole" }, { memberId: "m-staff", branchId: "b-foreign" });
    expect((await listAccessibleBranches(staff)).map((b) => b.id)).toEqual(["b-bole"]);
  });
});
