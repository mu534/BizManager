import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveContext } from "@server/auth/resolve-context";
import { removePushSubscription, savePushSubscription } from "@server/services/push.service";
import { isAppError } from "@shared/errors";

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048).startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(256) }),
});
const unsubscribeSchema = z.object({ endpoint: z.string().url().max(2048) });

type Params = { params: Promise<{ businessId: string }> };

function errorResponse(err: unknown, label: string): NextResponse {
  if (isAppError(err)) return NextResponse.json(err.toSafeJSON(), { status: err.statusCode });
  console.error(label, err);
  return NextResponse.json({ error: { code: "SERVER_ERROR", message: "Request failed." } }, { status: 500 });
}

/** Turn alerts on for this device. */
export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const { businessId } = await params;
    const parsed = subscribeSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid subscription." } }, { status: 422 });
    }
    const ctx = await resolveContext(businessId);
    await savePushSubscription(ctx, {
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: request.headers.get("user-agent")?.slice(0, 300),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "[POST /api/[businessId]/push/subscription]");
  }
}

/** Turn alerts off for this device. */
export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const { businessId } = await params;
    const parsed = unsubscribeSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request." } }, { status: 422 });
    }
    const ctx = await resolveContext(businessId);
    await removePushSubscription(ctx, parsed.data.endpoint);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "[DELETE /api/[businessId]/push/subscription]");
  }
}