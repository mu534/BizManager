import "server-only";
import { listAccessibleBranches, type BranchActor } from "@server/services/branch-access.service";

export interface ReportBranchChoice {
  /** Branches the member may report on (closed ones included — they have history). */
  branches: { id: string; name: string; closed: boolean }[];
  /** The branch picked in the filter, only if the member may use it; otherwise undefined (= all). */
  selectedId: string | undefined;
}

/**
 * Resolve the report branch filter. An unknown or inaccessible id is ignored
 * (falls back to "all my branches") rather than echoed back, so the query string
 * can never be used to probe other branches. The services re-check access anyway.
 */
export async function resolveReportBranch(actor: BranchActor, requested?: string): Promise<ReportBranchChoice> {
  const accessible = await listAccessibleBranches(actor);
  const branches = accessible.map((b) => ({ id: b.id, name: b.name, closed: b.status !== "ACTIVE" }));
  return { branches, selectedId: branches.find((b) => b.id === requested)?.id };
}
