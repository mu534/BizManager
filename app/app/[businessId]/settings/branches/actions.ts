"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resolveContext } from "@server/auth/resolve-context";
import { createBranch, setBranchStatus, setMemberBranchAccess, updateBranch } from "@server/services/branch.service";
import { createBranchSchema, setBranchAccessSchema, updateBranchSchema } from "@shared/validation/branch.schema";
import { isAppError } from "@shared/errors";
import type { FormState } from "@shared/form-state";

/**
 * The business comes from the URL-bound argument and is verified against the
 * signed-in user's membership by resolveContext(); every service then requires
 * the OWNER role and re-checks that branches/members belong to this business.
 */
const fail = (err: unknown): { ok: false; message: string } => ({
  ok: false,
  message: isAppError(err) ? err.message : "Something went wrong. Please try again.",
});

export async function createBranchAction(businessId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = createBranchSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address") ?? undefined,
    phone: formData.get("phone") ?? undefined,
  });
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors;
    return { ok: false, message: fe.name?.[0] ?? fe.address?.[0] ?? fe.phone?.[0] ?? "Please check the form.", nonce: Date.now() };
  }
  try {
    await createBranch(await resolveContext(businessId), parsed.data);
  } catch (err) {
    return { ...fail(err), nonce: Date.now() };
  }
  revalidatePath(`/app/${businessId}`, "layout");
  return { ok: true, message: "Branch added. Assign team members to it below.", nonce: Date.now() };
}

export async function renameBranchAction(
  businessId: string,
  input: { branchId: string; name: string },
): Promise<{ ok: boolean; message: string }> {
  const parsed = updateBranchSchema.safeParse({ branchId: input.branchId, name: input.name });
  if (!parsed.success) return { ok: false, message: parsed.error.flatten().fieldErrors.name?.[0] ?? "Invalid name." };
  try {
    await updateBranch(await resolveContext(businessId), parsed.data);
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/app/${businessId}`, "layout");
  return { ok: true, message: "Saved." };
}

export async function setBranchStatusAction(
  businessId: string,
  branchId: string,
  status: "ACTIVE" | "INACTIVE",
): Promise<{ ok: boolean; message: string }> {
  if (!z.string().uuid().safeParse(branchId).success) return { ok: false, message: "Invalid branch." };
  try {
    await setBranchStatus(await resolveContext(businessId), branchId, status);
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/app/${businessId}`, "layout");
  return { ok: true, message: status === "INACTIVE" ? "Branch closed. Its history is kept." : "Branch reopened." };
}

export async function setMemberBranchAccessAction(
  businessId: string,
  memberId: string,
  branchIds: string[],
): Promise<{ ok: boolean; message: string }> {
  const parsed = setBranchAccessSchema.safeParse({ memberId, branchIds });
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  try {
    await setMemberBranchAccess(await resolveContext(businessId), parsed.data.memberId, parsed.data.branchIds);
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/app/${businessId}`, "layout");
  return { ok: true, message: "Branch access saved." };
}
