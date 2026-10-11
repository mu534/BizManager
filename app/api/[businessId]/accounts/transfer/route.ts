import { NextRequest, NextResponse } from "next/server";
import { resolveContext } from "@server/auth/resolve-context";
import { transferFunds, depositFunds, withdrawFunds } from "@server/services/financial.service";
import { transferSchema, depositSchema, withdrawSchema } from "@shared/validation/financial.schema";
import { isAppError } from "@shared/errors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> },
): Promise<NextResponse> {
  try {
    const { businessId } = await params;
    const ctx = await resolveContext(businessId);
    const body = await request.json().catch(() => ({})) as { action?: string };
    const action = body.action;

    if (action === "deposit") {
      const parsed = depositSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid data" } }, { status: 422 });
      await depositFunds(ctx, parsed.data);
    } else if (action === "withdraw") {
      const parsed = withdrawSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid data" } }, { status: 422 });
      await withdrawFunds(ctx, parsed.data);
    } else {
      const parsed = transferSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid data" } }, { status: 422 });
      await transferFunds(ctx, parsed.data);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(err.toSafeJSON(), { status: err.statusCode });
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: "Operation failed." } }, { status: 500 });
  }
}
