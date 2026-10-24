import { describe, it, expect } from "vitest";
import {
  accessibleBranches,
  pickCurrentBranch,
  canWriteToBranch,
  planBranchStatusChange,
  planBranchAssignment,
  type BranchLite,
} from "@shared/branch-rules";

const main: BranchLite = { id: "b-main", name: "Main", status: "ACTIVE", isDefault: true };
const bole: BranchLite = { id: "b-bole", name: "Bole", status: "ACTIVE", isDefault: false };
const piassa: BranchLite = { id: "b-piassa", name: "Piassa", status: "INACTIVE", isDefault: false };
const gone: BranchLite = { id: "b-gone", name: "Old", status: "DELETED", isDefault: false };
const none = new Set<string>();

describe("accessibleBranches", () => {
  it("owner sees every non-deleted branch, including inactive ones (history)", () => {
    expect(accessibleBranches("OWNER", [main, bole, piassa, gone], none).map((b) => b.id)).toEqual(["b-main", "b-bole", "b-piassa"]);
  });

  it("a single-branch business gives everyone that branch (backward compatible)", () => {
    expect(accessibleBranches("STAFF", [main], none).map((b) => b.id)).toEqual(["b-main"]);
    expect(accessibleBranches("MANAGER", [main, gone], none).map((b) => b.id)).toEqual(["b-main"]);
  });

  it("in a multi-branch business non-owners only get granted branches", () => {
    expect(accessibleBranches("STAFF", [main, bole], new Set(["b-bole"])).map((b) => b.id)).toEqual(["b-bole"]);
    expect(accessibleBranches("MANAGER", [main, bole], none)).toEqual([]);
  });

  it("a grant for a deleted branch grants nothing", () => {
    expect(accessibleBranches("STAFF", [main, bole, gone], new Set(["b-gone"]))).toEqual([]);
  });
});

describe("pickCurrentBranch / write rules", () => {
  it("honours a valid saved choice", () => {
    expect(pickCurrentBranch([main, bole], "b-bole")?.id).toBe("b-bole");
  });

  it("falls back to the default when the saved branch is inaccessible or inactive", () => {
    expect(pickCurrentBranch([main, bole], "b-other")?.id).toBe("b-main");
    expect(pickCurrentBranch([main, piassa], "b-piassa")?.id).toBe("b-main");
  });

  it("falls back to the first active branch when the default is not accessible", () => {
    expect(pickCurrentBranch([bole], null)?.id).toBe("b-bole");
  });

  it("returns null when nothing is usable — never an inactive branch", () => {
    expect(pickCurrentBranch([piassa], "b-piassa")).toBeNull();
    expect(pickCurrentBranch([], null)).toBeNull();
  });

  it("only active branches accept transactions", () => {
    expect(canWriteToBranch(main)).toBe(true);
    expect(canWriteToBranch(piassa)).toBe(false);
  });
});

describe("planBranchStatusChange", () => {
  it("protects the default branch and the last active branch", () => {
    expect(planBranchStatusChange(main, "INACTIVE", 2)).toEqual({ ok: false, error: "DEFAULT_BRANCH_PROTECTED" });
    expect(planBranchStatusChange(bole, "INACTIVE", 1)).toEqual({ ok: false, error: "LAST_ACTIVE_BRANCH" });
  });

  it("allows deactivating a non-default branch when another stays active, and reactivating", () => {
    expect(planBranchStatusChange(bole, "INACTIVE", 2)).toEqual({ ok: true });
    expect(planBranchStatusChange(piassa, "ACTIVE", 1)).toEqual({ ok: true });
  });

  it("rejects no-ops and deleted branches", () => {
    expect(planBranchStatusChange(bole, "ACTIVE", 2)).toEqual({ ok: false, error: "NO_CHANGE" });
    expect(planBranchStatusChange(gone, "ACTIVE", 2)).toEqual({ ok: false, error: "DELETED_BRANCH" });
  });
});

describe("planBranchAssignment", () => {
  const staff = { role: "STAFF" as const, status: "ACTIVE" as const };

  it("normalises duplicates", () => {
    expect(planBranchAssignment(staff, ["b-main", "b-main", "b-bole"], [main, bole])).toEqual({ ok: true, branchIds: ["b-main", "b-bole"] });
  });

  it("an empty assignment is valid (member loses all branches)", () => {
    expect(planBranchAssignment(staff, [], [main, bole])).toEqual({ ok: true, branchIds: [] });
  });

  it("rejects unknown or deleted branch ids (e.g. another business's branch)", () => {
    expect(planBranchAssignment(staff, ["b-foreign"], [main, bole])).toEqual({ ok: false, error: "UNKNOWN_BRANCH" });
    expect(planBranchAssignment(staff, ["b-gone"], [main, gone])).toEqual({ ok: false, error: "UNKNOWN_BRANCH" });
  });

  it("owners need no assignment; removed members cannot be assigned", () => {
    expect(planBranchAssignment({ role: "OWNER", status: "ACTIVE" }, ["b-main"], [main])).toEqual({ ok: false, error: "OWNER_HAS_ALL" });
    expect(planBranchAssignment({ role: "STAFF", status: "REVOKED" }, ["b-main"], [main])).toEqual({ ok: false, error: "INACTIVE_MEMBER" });
  });
});
