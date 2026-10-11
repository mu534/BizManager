import { NextRequest, NextResponse } from "next/server";
import { resolveContext } from "@server/auth/resolve-context";
import { createReturn } from "@server/services/sale.service";
import { createReturnSchema } from "@shared/validation/sale.schema";
import { isAppError } from "@shared/errors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string; saleId: string }> },
): Promise<NextResponse> {
  try {
    const { businessId, saleId } = await params;
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = createReturnSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid return data" } },
        { status: 422 },
      );
    }
    const ctx = await resolveContext(businessId, parsed.data.branchId);
    const saleReturn = await createReturn(ctx, saleId, parsed.data);
    return NextResponse.json({ returnId: saleReturn.id });
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(err.toSafeJSON(), { status: err.statusCode });
    console.error("[POST /api/[businessId]/sales/[saleId]/return]", err);
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: "Return failed." } }, { status: 500 });
  }
}
