import "server-only";
import { notFound, redirect } from "next/navigation";
import { getSessionUserId } from "@server/auth/session";
import { requirePlatformAdmin, type PlatformAdminContext } from "@server/services/platform-admin.service";
import type { PlatformAdminRole } from "@prisma/client";


export async function adminPageGuard(
  allowed?: readonly PlatformAdminRole[],
): Promise<PlatformAdminContext> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/sign-in?next=/admin");
  try {
    return await requirePlatformAdmin(allowed);
  } catch {
    notFound();
  }
}
